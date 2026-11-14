/**
 * 原生（系统级）桌面通知。
 *
 * 扩展默认只在工具栏画角标 + 在弹窗 / 仪表盘里展示消息中心；这里把「收到新消息」
 * 也推到操作系统通知中心，方便用户不盯着扩展图标时也能看到。
 *
 * Chromium 系用 WebExtension 的 `browser.notifications` API（manifest 需要
 * `notifications` 权限）；Firefox 上该 API 行为不稳定（抛错或不弹），
 * 改用标准 Web `Notification` API（用户也接受「浏览器通知」），同样落到系统通知中心。
 * 推送本身不带正文，所以展示真实内容时要额外拉一次最新的未读消息
 * （见 lib/notifications.ts 的 getNotifications）。SSE 的 notification_update
 * 经常成串到达，这里用一个短 debounce 把它们合并成一条通知，避免刷屏；
 * 合并后仍会展示最新一条的正文，并提示还剩几条未读。
 */
import { browser } from '#imports';
import { notificationHref, type AppNotification } from './notification-view';
import { getNotifications } from './notifications';
import { LINKS } from './config';
import { readSettings } from './storage';
import { buildNotificationContent } from './notification-content';

const NOTIFICATION_ID_PREFIX = 't2:msg:';
/** 成串的 notification_update 合并窗口：窗口内只弹一条系统通知。 */
const COALESCE_MS = 1000;
/** 点击通知打开的地址：按消息类型落到评论地址 / 原文 / 通知界面。 */
const clickTargets = new Map<string, string>();

interface NotificationOptions {
  type: 'basic';
  iconUrl?: string;
  title: string;
  message: string;
  contextMessage?: string;
}

interface NotificationsApi {
  create(id: string, options: NotificationOptions): Promise<string> | void;
  onClicked: {
    addListener(callback: (notificationId: string) => void): void;
    hasListener(callback: (notificationId: string) => void): boolean;
  };
}

function getNotificationsApi(): NotificationsApi | null {
  const api = (browser as unknown as { notifications?: NotificationsApi }).notifications;
  return api ?? null;
}

/** 注册点击：任何来自本扩展的通知点击后打开它对应的地址（评论 / 原文 / 通知界面）。 */
export function initNativeNotificationClicks(): void {
  const api = getNotificationsApi();
  if (!api) return;
  if (api.onClicked.hasListener(handleNotificationClick)) return;
  api.onClicked.addListener(handleNotificationClick);
}

function handleNotificationClick(notificationId: string): void {
  if (!notificationId.startsWith(NOTIFICATION_ID_PREFIX)) return;
  // 优先打开这条通知对应的地址；map 已被清理或查不到时回落到通知界面。
  const target = clickTargets.get(notificationId) ?? LINKS.notifications;
  clickTargets.delete(notificationId);
  void browser.tabs?.create({ url: target }).catch(() => undefined);
}

let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
let coalescedTotal = 0;

/**
 * 收到 SSE 的 notification_update 时调用：合并成一条系统通知后弹出。
 * 不在这里判断开关，交给 showNewMessageNotification 读设置，
 * 这样即使 debounce 期间设置变了也能生效。
 */
export function scheduleNewMessageNotification(total: number): void {
  // 能力判断放到 showNewMessageNotification：Firefox 上走标准 Web Notification，
  // 未必有 browser.notifications，这里不能仅凭它是否存在就放弃调度。
  coalescedTotal = Math.max(coalescedTotal, total);
  if (coalesceTimer !== null) return;
  coalesceTimer = setTimeout(() => {
    coalesceTimer = null;
    const total = coalescedTotal;
    coalescedTotal = 0;
    void showNewMessageNotification(total);
  }, COALESCE_MS);
}

async function showNewMessageNotification(total: number): Promise<void> {
  const settings = await readSettings().catch(() => null);
  if (!settings?.desktopNotifications) return;

  let latest: AppNotification | null = null;
  try {
    const page = await getNotifications({ unreadOnly: true, limit: 1 });
    latest = page.list?.[0] ?? null;
  } catch {
    // 拉不到正文就回落到「N 条新消息」；不要因为一条失败就不弹通知。
  }

  const { title, message } = buildNotificationContent(latest, total);
  // 点击落到这条消息自己的地址：回复 / 提及 → 评论地址，表态 → 原文，
  // 没有可定位内容 → 通知界面（notificationHref 已按这个优先级回落）。
  const target = latest ? notificationHref(latest) : LINKS.notifications;

  // Firefox 上 WebExtension 的 browser.notifications 行为不稳定（抛错或不弹），
  // 用户也接受「浏览器通知」，所以这条分支直接用标准 Web Notification API，
  // 同样会落到系统通知中心，且在 Firefox 上行为可靠。Chromium 系继续用
  // browser.notifications，体验更完整（点击、第二行小字）。
  // import.meta.env.FIREFOX 在 Firefox 包里恒为 true（lib/auth.ts 已用于回调校验）。
  if (import.meta.env.FIREFOX) {
    showBrowserNotification(title, message, target);
  } else {
    showWebextNotification(title, message, target, total);
  }
}

/**
 * 用 WebExtension 的 browser.notifications 弹通知（Chromium 主路径）。
 * 带点击跳转与第二行小字；icon 加载失败导致 create 抛错时回落到不带 icon 的版本。
 */
function showWebextNotification(
  title: string,
  message: string,
  target: string,
  total: number,
): void {
  const api = getNotificationsApi();
  if (!api) return;

  const id = `${NOTIFICATION_ID_PREFIX}${Date.now()}`;
  clickTargets.set(id, target);
  // map 只缓存近期通知，避免一直增长；超出就丢掉最旧的。
  if (clickTargets.size > 50) {
    const oldest = clickTargets.keys().next().value;
    if (oldest !== undefined) clickTargets.delete(oldest);
  }

  const iconUrl = browser.runtime.getURL('icon/96.png' as never);
  const options: NotificationOptions = { type: 'basic', iconUrl, title, message };
  if (total > 1) options.contextMessage = `还有 ${total - 1} 条未读`;

  try {
    void api.create(id, options);
  } catch (error) {
    console.debug('[T2] 原生通知创建失败，尝试不带图标重试', error);
    try {
      void api.create(id, { type: 'basic', title, message });
    } catch (error2) {
      clickTargets.delete(id);
      console.debug('[T2] 原生通知创建失败', error2);
    }
  }
}

/**
 * 标准 Web Notification API（Firefox 主路径）：与 browser.notifications 一样落到
 * 系统通知中心，且在 Firefox 上行为稳定。点击后打开对应地址。
 * 需要授权：扩展背景下 Firefox 一般已授权；未决定时请求一次，被拒则不再打扰。
 */
function showBrowserNotification(title: string, message: string, target: string): void {
  const NotificationCtor = (
    globalThis as unknown as { Notification?: typeof Notification }
  ).Notification;
  if (!NotificationCtor) return;

  const permission = NotificationCtor.permission;
  if (permission === 'denied') return;

  const fire = (): void => {
    try {
      const notification = new NotificationCtor(title, {
        body: message,
        icon: browser.runtime.getURL('icon/96.png' as never),
      });
      notification.onclick = () => {
        void browser.tabs?.create({ url: target }).catch(() => undefined);
        notification.close();
      };
    } catch (error) {
      console.debug('[T2] 浏览器通知创建失败', error);
    }
  };

  if (permission === 'granted') {
    fire();
    return;
  }
  // permission === 'default'：请求一次授权再弹（Promise 形态；旧版回调形态忽略）。
  try {
    const result = NotificationCtor.requestPermission();
    if (result && typeof (result as Promise<NotificationPermission>).then === 'function') {
      (result as Promise<NotificationPermission>)
        .then((granted) => {
          if (granted === 'granted') fire();
        })
        .catch(() => undefined);
    }
  } catch {
    // 某些环境 requestPermission 不是 Promise 形态，忽略。
  }
}
