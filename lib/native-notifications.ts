/**
 * 原生（系统级）桌面通知。
 *
 * 扩展默认只在工具栏画角标 + 在弹窗 / 仪表盘里展示消息中心；这里把「收到新消息」
 * 也推到操作系统通知中心，方便用户不盯着扩展图标时也能看到。
 *
 * 主路径统一用 WebExtension 的 `browser.notifications`（manifest 需要 `notifications`
 * 权限，Chrome / Firefox 都支持）：点击由 `onClicked` 回传，能把已被回收的后台唤醒。
 * 只有该 API 缺失或创建失败时才退回标准 Web `Notification`——后台页面没有用户手势，
 * `requestPermission()` 只会静默返回 `default`，所以授权放在设置页打开开关时请求
 * （见 requestNotificationPermission），后台只负责在已授权时弹出。
 *
 * 推送本身不带正文，所以展示真实内容时要额外拉一次最新的未读消息
 * （见 lib/notifications.ts 的 getNotifications）。SSE 的 notification_update
 * 经常成串到达，这里用一个短 debounce 把它们合并成一条通知，避免刷屏；
 * 合并后仍会展示最新一条的正文与详情（评论原文、系统提示等），
 * 并把帖子标题 / 剩余未读数放到第三行，不再只显示标题。
 *
 * 两个浏览器差异要在这里抹平：
 * - Firefox 只支持 `type` / `title` / `message` / `iconUrl`，`contextMessage`
 *   会被静默丢弃，所以 Firefox 上把补充信息并进正文（见 inlineNotificationContext）；
 * - 同一条消息可能被多条 `notification_update` 命中，按消息 id 去重，
 *   否则用户读过之后还会再收到一遍同一条「已读通知」。
 */
import { browser } from '#imports';
import { notificationHref, type AppNotification } from './notification-view';
import { getNotifications } from './notifications';
import { LINKS } from './config';
import { readSettings } from './storage';
import {
  buildNotificationContent,
  inlineNotificationContext,
  shouldNotifyLatest,
  type NotificationContent,
} from './notification-content';

const NOTIFICATION_ID_PREFIX = 't2:msg:';
/** 成串的 notification_update 合并窗口：窗口内只弹一条系统通知。 */
const COALESCE_MS = 1000;
/** Web Notification 兜底路径下，点击依赖对象存活，最多同时保留这么多条。 */
const MAX_LIVE_NOTIFICATIONS = 10;

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

/**
 * 把点击目标编码进通知 id：后台被浏览器回收后内存里的映射会丢，id 不会，
 * 这样几分钟后再点通知仍能跳到对应评论，而不是一律落到消息界面。
 * 格式 `t2:msg:<时间戳36进制>:<encodeURIComponent(地址)>`，编码后不含 `:`，
 * 所以按第一个 `:` 切分即可还原。
 */
function buildNotificationId(target: string): string {
  return `${NOTIFICATION_ID_PREFIX}${Date.now().toString(36)}:${encodeURIComponent(target)}`;
}

/** 从通知 id 还原点击目标；不是本扩展的通知或地址不合法时返回 null。 */
function parseNotificationTarget(notificationId: string): string | null {
  if (!notificationId.startsWith(NOTIFICATION_ID_PREFIX)) return null;
  const rest = notificationId.slice(NOTIFICATION_ID_PREFIX.length);
  const separator = rest.indexOf(':');
  if (separator < 0) return null;
  try {
    const target = decodeURIComponent(rest.slice(separator + 1));
    // 只允许 http(s)：解码后的字符串会直接交给 tabs.create，别让它打开本地页面。
    return /^https?:\/\//i.test(target) ? target : null;
  } catch {
    return null;
  }
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
  // 解析不出目标（旧格式的 id / 地址被截断）时回落到消息界面。
  const target = parseNotificationTarget(notificationId) ?? LINKS.notifications;
  void browser.tabs?.create({ url: target }).catch(() => undefined);
}

let coalesceTimer: ReturnType<typeof setTimeout> | null = null;
let coalescedTotal = 0;
/** 上一条已经弹过系统通知的消息 id：同一条消息不重复弹。 */
let lastNotifiedId: string | null = null;
/**
 * 串行弹通知：两次合并窗口挨得很近时，并发拉取会同时通过上面的去重判断，
 * 结果同一条消息弹两次。排队后第一条弹完并记下 id，第二条自然被跳过。
 */
let notifyQueue: Promise<void> = Promise.resolve();

/**
 * 收到 SSE 的 notification_update 时调用：合并成一条系统通知后弹出。
 * 不在这里判断开关，交给 showNewMessageNotification 读设置，
 * 这样即使 debounce 期间设置变了也能生效。
 */
export function scheduleNewMessageNotification(total: number): void {
  // 能力判断放到 showNewMessageNotification：Firefox 上未必有 browser.notifications，
  // 这里不能仅凭它是否存在就放弃调度。
  coalescedTotal = Math.max(coalescedTotal, total);
  if (coalesceTimer !== null) return;
  coalesceTimer = setTimeout(() => {
    coalesceTimer = null;
    const total = coalescedTotal;
    coalescedTotal = 0;
    notifyQueue = notifyQueue
      .then(() => showNewMessageNotification(total))
      .catch(() => undefined);
  }, COALESCE_MS);
}

async function showNewMessageNotification(total: number): Promise<void> {
  const settings = await readSettings().catch(() => null);
  if (!settings?.desktopNotifications) return;

  let latest: AppNotification | null = null;
  /** 正文到底拉没拉到（空列表和请求失败要区别对待）。 */
  let fetched = false;
  try {
    const page = await getNotifications({ unreadOnly: true, limit: 1 });
    latest = page.list?.[0] ?? null;
    fetched = true;
  } catch {
    // 拉不到正文就回落到「N 条新消息」；不要因为一条失败就不弹通知。
  }

  // 没有未读、已经读掉、或者就是刚才弹过的那一条：都不再打扰用户。
  if (!shouldNotifyLatest(latest, lastNotifiedId, fetched)) return;

  const content = buildNotificationContent(latest, total);
  // 点击落到这条消息自己的地址：回复 / 提及 → 评论地址，表态 → 原文，
  // 没有可定位内容 → 通知界面（notificationHref 已按这个优先级回落）。
  const target = latest ? notificationHref(latest) : LINKS.notifications;

  let shown = await showWebextNotification(content, target);
  // browser.notifications 不可用或创建失败：退回标准 Web Notification。
  if (!shown) shown = showBrowserNotification(content, target);
  // 只有真的弹出来了才记下来，弹失败时下一条消息还能正常提醒。
  if (shown && latest) lastNotifiedId = latest.id;
}

/**
 * 用 WebExtension 的 browser.notifications 弹通知（主路径）。
 * 带点击跳转与第二行小字；图标加载失败时退回不带图标的版本，仍然可点。
 * 返回是否创建成功，失败时由调用方决定要不要走 Web Notification 兜底。
 */
async function showWebextNotification(
  content: NotificationContent,
  target: string,
): Promise<boolean> {
  const api = getNotificationsApi();
  if (!api) return false;

  // Firefox 会把 contextMessage 静默丢掉，只有并进正文才能看到帖子标题 / 详情。
  const shown = import.meta.env.FIREFOX ? inlineNotificationContext(content) : content;

  const id = buildNotificationId(target);
  const options: NotificationOptions = {
    type: 'basic',
    iconUrl: browser.runtime.getURL('icon/96.png' as never),
    title: shown.title,
    message: shown.message,
  };
  if (shown.contextMessage) options.contextMessage = shown.contextMessage;

  if (await tryCreateNotification(api, id, options)) return true;
  // 图标路径 / 打包问题会让 create 失败，去掉图标再试一次（第三行小字照旧）。
  return tryCreateNotification(api, id, {
    type: 'basic',
    title: shown.title,
    message: shown.message,
    ...(shown.contextMessage ? { contextMessage: shown.contextMessage } : {}),
  });
}

/**
 * create 在 Chrome / Firefox 上都返回 Promise，图标加载失败这类错误是异步抛出的，
 * 必须等它才能捕获；同步抛错的环境也一并覆盖。
 */
async function tryCreateNotification(
  api: NotificationsApi,
  id: string,
  options: NotificationOptions,
): Promise<boolean> {
  try {
    await Promise.resolve(api.create(id, options));
    return true;
  } catch (error) {
    console.debug('[T2] 原生通知创建失败', error);
    return false;
  }
}

/** 点击处理依赖 Notification 对象存活，不持有引用会被 GC 掉，点击就没反应。 */
const liveNotifications = new Set<Notification>();

/**
 * 标准 Web Notification API（兜底路径）：与 browser.notifications 一样落到系统通知中心。
 * 只在已授权时弹出——后台没有用户手势，requestPermission() 在这里只会静默返回 default。
 * 返回是否真的弹出来了，调用方据此决定要不要记为「已通知」，失败时不吞掉下一条。
 */
function showBrowserNotification(content: NotificationContent, target: string): boolean {
  const NotificationCtor = (
    globalThis as unknown as { Notification?: typeof Notification }
  ).Notification;
  if (!NotificationCtor) return false;
  if (NotificationCtor.permission !== 'granted') return false;

  // Web Notification 只有一个 body：把第三行小字换行接上，详情不丢。
  const { title, message } = inlineNotificationContext(content);
  try {
    const notification = new NotificationCtor(title, {
      body: message,
      icon: browser.runtime.getURL('icon/96.png' as never),
    });
    liveNotifications.add(notification);
    if (liveNotifications.size > MAX_LIVE_NOTIFICATIONS) {
      const oldest = liveNotifications.values().next().value;
      if (oldest) {
        liveNotifications.delete(oldest);
        oldest.close();
      }
    }
    const release = (): void => {
      liveNotifications.delete(notification);
      notification.close();
    };
    notification.onclick = () => {
      void browser.tabs?.create({ url: target }).catch(() => undefined);
      release();
    };
    notification.onclose = release;
    return true;
  } catch (error) {
    console.debug('[T2] 浏览器通知创建失败', error);
    return false;
  }
}

/**
 * 在用户手势里请求通知授权（设置页打开开关时调用）。
 * 后台页面没有手势，requestPermission() 会静默返回 default，所以授权只能在这里发起。
 */
export async function requestNotificationPermission(): Promise<void> {
  const NotificationCtor = (
    globalThis as unknown as { Notification?: typeof Notification }
  ).Notification;
  if (!NotificationCtor || NotificationCtor.permission !== 'default') return;
  try {
    await NotificationCtor.requestPermission();
  } catch {
    // 旧环境 / 被拒：忽略，用户可在浏览器设置里手动允许。
  }
}
