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
  openNotificationStream,
  type NotificationStream,
  type NotificationStreamError,
} from '@/lib/notification-stream';
import { tokensItem } from '@/lib/storage';

/**
 * 服务端的 CORS 只放行它自己站点的来源，扩展发起的请求会带上
 * `Origin: chrome-extension://<id>`，于是被服务端以 500「Not allowed by CORS」拒绝。
 *
 * 这里用 declarativeNetRequest 在「扩展自己发往 API 域名的请求」上移除
 * 浏览器自动附加的 Origin 头，让请求表现得像 curl 一样的普通客户端。
 * 规则限定 initiatorDomains 为扩展自身，因此不会影响站点页面或其它网站
 * 的请求；CORS 不是鉴权，读接口本来就是公开的，登录令牌仍按 Authorization 传递，
 * 通知已读这类写请求也由 scope + 令牌控制。
 */
const RULE_ID = 1;

/** 未读数兜底轮询：`alarms` 的最小周期是 1 分钟，与接口文档建议的 60 秒一致。 */
const UNREAD_ALARM = 't2:unread-count';
const POLL_MINUTES = 1;

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
      title: unread > 0 ? `${unread} 条未读通知 · ${DEFAULT_TITLE}` : DEFAULT_TITLE,
    });
  } catch (error) {
    console.debug('[T2] 更新扩展角标失败', error);
  }
}

/* ------------------------------------------------------------------
   通知：后台优先持有长连接
   - SSE 负责「有新通知」的即时提醒（事件里没有正文，收到后只拉未读数）；
   - 每分钟的 alarms 仍然保留，用来兜底（旧浏览器 / 长连接断开 / 站内已读）；
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

async function broadcast(message: NotificationBroadcast): Promise<void> {
  try {
    // 没有页面在监听（弹窗和仪表盘都没开）时 Chrome 会 reject，属于正常情况。
    await browser.runtime.sendMessage(message);
  } catch {
    // 忽略：通知结果已经写进角标，页面下次打开会自己拉一次。
  }
}

/** 未读数同时写角标与页面；两处始终显示同一份状态。 */
async function publishUnread(count: number, at = Date.now()): Promise<void> {
  if (at < countAppliedAt) return;
  countAppliedAt = at;
  await applyBadge(count);
  await broadcast({ type: UNREAD_COUNT_MESSAGE, count });
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
    onReady: () => {
      setStreamReady(true);
      // 断开期间可能漏掉事件；握手成功后立刻对一次未读数。
      void syncUnreadBadge();
    },
    onNotification: () => {
      // 让打开着的通知中心按需刷新列表；事件本身不带正文。
      void broadcast({ type: NOTIFICATION_EVENT_MESSAGE });
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
      console.debug('[T2] 通知长连接断开，稍后自动重连', error);
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
    console.debug('[T2] 未读通知数抓取失败，保留上次角标', error);
  }
}

/** 定时器可能被浏览器清理（扩展更新 / 浏览器重启），这里做幂等创建。 */
async function ensureUnreadAlarm(alarms: typeof browser.alarms | null): Promise<void> {
  if (!alarms) return;
  try {
    const existing = await alarms.get(UNREAD_ALARM);
    if (existing) return;
    await alarms.create(UNREAD_ALARM, { periodInMinutes: POLL_MINUTES });
  } catch (error) {
    console.warn('[T2] 未读通知定时器创建失败，角标可能不会自动刷新', error);
  }
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
              initiatorDomains: [browser.runtime.id],
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
   * 定时器每分钟会唤醒 service worker，这里不要每次都「先删后加」规则：
   * 规则短暂缺失的窗口里请求会被 CORS 拦掉。已存在就复用，安装 / 更新时再强刷。
   */
  const ensureRule = async () => {
    try {
      const rules = await browser.declarativeNetRequest.getDynamicRules();
      if (rules.some((rule) => rule.id === RULE_ID)) return;
    } catch {
      // 读不到现有规则就退回安装一次。
    }
    await installRule();
  };

  // 首次抓取放在 DNR 规则就绪之后：规则没生效时请求会被 CORS 拦掉。
  const boot = async () => {
    await ensureRule();
    await syncUnreadBadge();
  };

  /**
   * 页面挂载时会问一次长连接状态，决定要不要保留 60 秒兜底轮询。
   * 只回同步响应，避免 service worker 被额外的事件循环拖住。
   */
  browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (isStreamStatusQuery(message)) {
      sendResponse({ type: STREAM_STATUS_MESSAGE, connected: streamReady });
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
      void applyBadge(Math.max(0, Math.floor(message.count)));
    }
  });

  void boot();
  void ensureUnreadAlarm(alarms);

  browser.runtime.onInstalled.addListener(() => {
    // 扩展安装 / 更新后强刷一次，让新版本的规则条件立即生效。
    void installRule().then(() => syncUnreadBadge());
    void ensureUnreadAlarm(alarms);
  });
  browser.runtime.onStartup.addListener(() => {
    void boot();
    void ensureUnreadAlarm(alarms);
  });

  alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === UNREAD_ALARM) void syncUnreadBadge();
  });

  // 登录、退出、令牌刷新后立即更新角标与长连接，不用等下一轮闹钟。
  tokensItem.watch(() => {
    streamDisabled = false;
    void syncUnreadBadge();
  });
});
