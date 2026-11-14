import { browser } from '#imports';
import { ApiError } from '@/lib/api';
import { AuthError } from '@/lib/auth';
import {
  NOTIFICATION_EVENT_MESSAGE,
  STREAM_STATUS_MESSAGE,
  UNREAD_COUNT_MESSAGE,
  isStreamStatusQuery,
  isUnreadReportMessage,
  type NotificationBroadcast,
} from '@/lib/messages';
import { getUnreadNotificationCount } from '@/lib/notifications';
import {
  initNativeNotificationClicks,
  scheduleNewMessageNotification,
} from '@/lib/native-notifications';
import {
  openNotificationStream,
  type NotificationStream,
  type NotificationStreamError,
} from '@/lib/notification-stream';
import { tokensItem } from '@/lib/storage';

/**
 * 服务端的 CORS 只放行它自己站点的来源，扩展发起的请求会带上
 * `Origin: chrome-extension://<id>` / `moz-extension://<uuid>`，于是被服务端以
 * 500「Not allowed by CORS」拒绝。
 *
 * 这里用 declarativeNetRequest 在「发往 API 域名的请求」上移除浏览器自动附加的
 * Origin 头，让请求表现得像 curl 一样的普通客户端。
 *
 * 关键的坑：不能像最初那样用 `initiatorDomains: [browser.runtime.id]` 来限定
 * 「只改扩展自己的请求」——Chrome 的 runtime.id 是合法的 canonical domain（如
 * lbjdmldgngjjdpgadblpgneglbmgblfd）且正好等于扩展请求的发起方，规则能命中；
 * 但 Firefox 的 runtime.id 是 `t2-...@vhxubo.com`，既不是合法 canonical domain，
 * 也不等于扩展请求真正的发起方（moz-extension://<uuid>），结果规则在 Firefox 上
 * 根本不匹配，扩展发出的请求仍带着 Origin，登录回调的令牌交换就被 CORS 拦掉。
 *
 * 所以改成：把规则范围钉在 `2libra.com/api`，再用 `excludedInitiatorDomains`
 * 把「站点自身页面（2libra.com）」排除掉。这样无论扩展在 Chrome 还是 Firefox 上
 * 的发起方是什么，扩展自己的请求都会被命中并移除 Origin，而站点同站请求不受影响。
 * CORS 不是鉴权，读接口本来就是公开的，登录令牌仍按 Authorization 传递，
 * 消息已读这类写请求也由 scope + 令牌控制。
 */
const RULE_ID = 1;

/**
 * 长连接保活：service worker 可能被浏览器回收，闹钟只负责把它唤醒并重建 SSE，
 * 不再顺带拉未读数——未读数完全由 SSE 事件驱动。
 */
const STREAM_ALARM = 't2:notification-stream';
const STREAM_ALARM_MINUTES = 1;

/** 角标配色与界面里的未读小红点一致（styles/theme.css 的 --notice）。 */
const BADGE_COLOR = '#c4554b';
/** 角标文字用白色，保证在陶土红底上清晰可读。 */
const BADGE_TEXT_COLOR = '#ffffff';
const DEFAULT_TITLE = 'T2 Web Extension';

type BadgeApi = {
  setBadgeText(details: { text: string }): Promise<void> | void;
  setBadgeBackgroundColor(details: { color: string }): Promise<void> | void;
  setBadgeTextColor?(details: { color: string }): Promise<void> | void;
  setTitle(details: { title: string }): Promise<void> | void;
};

/** Chrome MV3 用 `action`，Firefox MV2 用 `browserAction`。 */
function getBadgeApi(): BadgeApi | null {
  const api = browser as unknown as { action?: BadgeApi; browserAction?: BadgeApi };
  return api.action ?? api.browserAction ?? null;
}

/**
 * 把未读数写到工具栏图标右下角的角标上；0 表示清空角标。
 * 直接显示真实个数（Chrome 角标最多容纳 4 个字符，正常未读数远小于这个量级）。
 */
async function applyBadge(count: number): Promise<void> {
  const action = getBadgeApi();
  if (!action) return;

  const unread = Math.max(0, Math.floor(count));
  const text = unread > 0 ? String(unread) : '';
  try {
    await action.setBadgeBackgroundColor({ color: BADGE_COLOR });
    await action.setBadgeTextColor?.({ color: BADGE_TEXT_COLOR });
    await action.setBadgeText({ text });
    await action.setTitle({
      title: unread > 0 ? `${unread} 条未读消息 · ${DEFAULT_TITLE}` : DEFAULT_TITLE,
    });
  } catch (error) {
    console.debug('[T2] 更新扩展角标失败', error);
  }
}

/* ------------------------------------------------------------------
   消息：后台优先持有长连接
   - SSE 负责即时提醒：帧里带未读数就直接用，没带才补一次 unread-count；
   - 不再定时轮询未读数；闹钟只用来唤醒 service worker 重建长连接；
   - 结果同时写进工具栏角标，并广播给打开着的弹窗与仪表盘；
   - 后台没就绪时，页面会自己连一条 SSE 兜底（见 hooks/useUnreadNotifications）。
------------------------------------------------------------------ */

/** 整个扩展只允许一条 SSE 连接，避免弹窗、仪表盘各开一条撞上并发上限。 */
let stream: NotificationStream | null = null;
/** 握手成功（收到 ready）后才算就绪；页面据此停掉自己的兜底轮询。 */
let streamReady = false;
/** 授权类失败（403 / 刷新失败）后先不重连，等令牌变化后再试。 */
let streamDisabled = false;

/** 只采纳最后一次抓取：alarm、SSE 事件、令牌变更可能重叠。 */
let generation = 0;
/** 把连续的 notification_update 合并成一次未读数请求。 */
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
/** 最近一次采纳的未读结果对应的请求开始时间；比它旧的回报直接丢弃。 */
let countAppliedAt = 0;
/** 最近一次已知的未读数，随状态查询回给新打开的页面，省掉一次请求。 */
let lastUnread: number | null = null;

async function broadcast(message: NotificationBroadcast): Promise<void> {
  try {
    // 没有页面在监听（弹窗和仪表盘都没开）时 Chrome 会 reject，属于正常情况。
    await browser.runtime.sendMessage(message);
  } catch {
    // 忽略：消息结果已经写进角标，页面下次打开会自己拉一次。
  }
}

/** 未读数同时写角标与页面；两处始终显示同一份状态。 */
async function publishUnread(count: number, at = Date.now()): Promise<void> {
  if (at < countAppliedAt) return;
  countAppliedAt = at;
  lastUnread = Math.max(0, Math.floor(count));
  await applyBadge(lastUnread);
  await broadcast({ type: UNREAD_COUNT_MESSAGE, count: lastUnread });
}

function setStreamReady(next: boolean): void {
  if (streamReady === next) return;
  streamReady = next;
  void broadcast({ type: STREAM_STATUS_MESSAGE, connected: next });
}

function stopNotificationStream(): void {
  const current = stream;
  stream = null;
  setStreamReady(false);
  current?.close();
}

function ensureNotificationStream(): void {
  if (stream || streamDisabled) return;

  stream = openNotificationStream({
    onReady: (unreadCount) => {
      setStreamReady(true);
      // 断开期间可能漏掉事件：帧里带了未读数就直接采纳，没带才补一次请求。
      if (unreadCount !== null) {
        void publishUnread(unreadCount);
        return;
      }
      void syncUnreadBadge();
    },
    onNotification: (unreadCount) => {
      // 让打开着的消息中心按需刷新列表；事件本身不带正文。
      void broadcast({ type: NOTIFICATION_EVENT_MESSAGE });
      // SSE 监听到的每一条新消息都弹系统通知（受设置开关控制，合并窗口内只弹一条）。
      scheduleNewMessageNotification(unreadCount ?? lastUnread ?? 0);
      if (unreadCount !== null) {
        void publishUnread(unreadCount);
        return;
      }
      scheduleUnreadRefresh();
    },
    onReconnect: () => {
      // 服务端要主动断开（15 分钟寿命 / 令牌将过期），属于正常节奏。
      setStreamReady(false);
    },
    onError: (error: NotificationStreamError) => {
      setStreamReady(false);
      if (error.kind === 'auth') {
        // 令牌 / scope 问题：停止重连，隐藏角标，等重新授权；
        // tokensItem.watch 会在令牌变化后重置 streamDisabled。
        stream = null;
        streamDisabled = true;
        void publishUnread(0);
        return;
      }
      console.debug('[T2] 消息长连接断开，稍后自动重连', error);
    },
  });
}

function scheduleUnreadRefresh(): void {
  if (refreshTimer !== null) return;
  refreshTimer = setTimeout(() => {
    refreshTimer = null;
    void syncUnreadBadge();
  }, 300);
}

/**
 * 拉一次未读数：未登录 → 清空角标；网络 / 429 / 5xx → 保留上次角标；
 * 401 / 403 / 令牌失效 → 清空角标并停下长连接，等重新授权。
 */
async function syncUnreadBadge(): Promise<void> {
  const run = ++generation;
  const tokens = await tokensItem.getValue().catch(() => null);

  if (!tokens?.accessToken) {
    stopNotificationStream();
    if (run === generation) await publishUnread(0);
    return;
  }

  ensureNotificationStream();

  try {
    const startedAt = Date.now();
    const count = await getUnreadNotificationCount();
    if (run === generation) await publishUnread(count, startedAt);
  } catch (error) {
    if (run !== generation) return;
    const authIssue =
      (error instanceof ApiError && (error.status === 401 || error.status === 403)) ||
      (error instanceof AuthError && (error.code === 'expired' || error.code === 'config'));
    if (authIssue) {
      streamDisabled = true;
      stopNotificationStream();
      await publishUnread(0);
      return;
    }
    console.debug('[T2] 未读消息数抓取失败，保留上次角标', error);
  }
}

/** 定时器可能被浏览器清理（扩展更新 / 浏览器重启），这里做幂等创建。 */
async function ensureStreamAlarm(alarms: typeof browser.alarms | null): Promise<void> {
  if (!alarms) return;
  try {
    const existing = await alarms.get(STREAM_ALARM);
    if (existing) return;
    await alarms.create(STREAM_ALARM, { periodInMinutes: STREAM_ALARM_MINUTES });
  } catch (error) {
    console.warn('[T2] 长连接保活定时器创建失败，后台被回收后可能收不到实时消息', error);
  }
}

/** 闹钟只做保活：登录状态下确保长连接存在，不额外请求未读数。 */
async function ensureStreamAlive(): Promise<void> {
  const tokens = await tokensItem.getValue().catch(() => null);
  if (!tokens?.accessToken) {
    stopNotificationStream();
    return;
  }
  ensureNotificationStream();
}

export default defineBackground(() => {
  // 旧版本安装的实例可能还没有 alarms 权限，先判空再注册，避免整个后台脚本报错。
  const alarms =
    (browser as unknown as { alarms?: typeof browser.alarms }).alarms ?? null;

  const installRule = async () => {
    try {
      await browser.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [RULE_ID],
        addRules: [
          {
            id: RULE_ID,
            priority: 1,
            action: {
              type: 'modifyHeaders',
              requestHeaders: [{ header: 'origin', operation: 'remove' }],
            },
            condition: {
              urlFilter: '||2libra.com/api/',
              // 只针对 2libra.com 的接口请求；排除「站点自身页面」这个发起方，
              // 其余发起方（扩展自身的 moz-extension / chrome-extension、第三方站点）
              // 一律移除 Origin。见上方文件头注释：不能用 initiatorDomains 限定扩展自身，
              // 否则 Firefox 上规则不匹配、登录回调被 CORS 拦截。
              requestDomains: ['2libra.com'],
              excludedInitiatorDomains: ['2libra.com'],
              resourceTypes: ['xmlhttprequest', 'other'],
            },
          },
        ],
      });
    } catch (error) {
      console.warn('[T2] 跨域请求规则安装失败，接口可能被 CORS 拦截', error);
    }
  };

  /**
   * 始终重新安装规则：updateDynamicRules 的「移除 + 添加」是在同一次调用里原子完成的，
   * 不存在规则短暂缺失的窗口，因此不必担心上面注释里担心的 CORS 间隙。
   * 始终重装能保证：即便本地已存着旧写法（Firefox 上此前不匹配的那版）的规则，
   * 也会被新内容覆盖，用户无需卸载重装扩展即可生效。
   */
  const ensureRule = async () => {
    await installRule();
  };

  // 首次抓取放在 DNR 规则就绪之后：规则没生效时请求会被 CORS 拦掉。
  const boot = async () => {
    // 系统通知点击后打开站点消息页；尽早注册，与是否登录 / 长连接无关。
    initNativeNotificationClicks();
    await ensureRule();
    await syncUnreadBadge();
  };

  /**
   * 页面挂载时会问一次长连接状态，决定要不要保留 60 秒兜底轮询。
   * 只回同步响应，避免 service worker 被额外的事件循环拖住。
   */
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isStreamStatusQuery(message)) {
      // 顺带回一份已知未读数：新开的页面据此直接点亮小红点，不用再拉一次。
      sendResponse({
        type: STREAM_STATUS_MESSAGE,
        connected: streamReady,
        count: lastUnread,
      });
      return;
    }
    // 页面自己拉到的最新未读数：立刻更新工具栏角标。
    // 不在这里再广播一次，避免和页面自己的请求互相打断；
    // 这条消息同时会唤醒被浏览器回收的 service worker（顺便重启长连接）。
    if (isUnreadReportMessage(message)) {
      // 只更新角标、不再广播：页面自己的小红点已经是最新值，
      // 再广播一次反而可能打断页面正在进行的请求。
      if (message.at < countAppliedAt) return;
      countAppliedAt = message.at;
      lastUnread = Math.max(0, Math.floor(message.count));
      void applyBadge(lastUnread);
    }
  });

  void boot();
  void ensureStreamAlarm(alarms);

  // 安装 / 更新后强刷一次规则，让新版本的规则条件立即生效；未读数与长连接
  // 已由上面的 boot() 负责，这里不再重复请求。
  browser.runtime.onInstalled.addListener(() => {
    void installRule();
  });

  alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === STREAM_ALARM) void ensureStreamAlive();
  });

  // 登录、退出、令牌刷新后立即更新角标与长连接，不用等下一轮闹钟。
  tokensItem.watch(() => {
    streamDisabled = false;
    void syncUnreadBadge();
  });
});
