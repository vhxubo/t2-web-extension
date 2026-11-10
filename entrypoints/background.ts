import { browser } from '#imports';
import { ApiError } from '@/lib/api';
import { AuthError } from '@/lib/auth';
import { getUnreadNotificationCount } from '@/lib/notifications';
import { tokensItem } from '@/lib/storage';

/**
 * 服务端的 CORS 只放行它自己站点的来源，扩展发起的请求会带上
 * `Origin: chrome-extension://<id>`，于是被服务端以 500「Not allowed by CORS」拒绝。
 *
 * 这里用 declarativeNetRequest 在「扩展自己发往 API 域名的请求」上移除
 * 浏览器自动附加的 Origin 头，让请求表现得像 curl 一样的普通客户端。
 * 规则限定 initiatorDomains 为扩展自身，因此不会影响站点页面或其它网站
 * 的请求；CORS 不是鉴权，读接口本来就是公开的，令牌仍按 Authorization 传递。
 */
const RULE_ID = 1;

/** 未读数轮询：`alarms` 的最小周期是 1 分钟，与接口文档建议的 60 秒一致。 */
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

/**
 * 只采纳最后一次抓取的结果：alarm、令牌变更、启动事件可能重叠。
 * 未登录 → 清空角标；网络 / 429 / 5xx → 保留上次角标，等下一轮；
 * 401 / 403 / 令牌失效 → 清空角标，不打扰用户。
 */
let generation = 0;

async function syncUnreadBadge(): Promise<void> {
  const run = ++generation;
  const tokens = await tokensItem.getValue().catch(() => null);

  if (!tokens?.accessToken) {
    if (run === generation) await applyBadge(0);
    return;
  }

  try {
    const count = await getUnreadNotificationCount();
    if (run === generation) await applyBadge(count);
  } catch (error) {
    if (run !== generation) return;
    const authIssue =
      (error instanceof ApiError && (error.status === 401 || error.status === 403)) ||
      (error instanceof AuthError && (error.code === 'expired' || error.code === 'config'));
    if (authIssue) {
      await applyBadge(0);
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

  // 登录、退出、令牌刷新后立即更新角标，不用等下一轮闹钟。
  tokensItem.watch(() => void syncUnreadBadge());
});
