import { browser, storage } from '#imports';
import { isBoardId } from './boards';
import {
  COMMENT_RUN_DEFAULT_LENGTH,
  normalizeCommentRunThreshold,
} from './comment-runs';
import {
  DEFAULT_DEFAULT_VIEW,
  VIEWS_VERSION,
  boardViewId,
  createDefaultViews,
  migrateViewPreferences,
  normalizeViewPreferences,
} from './viewIds';
import type { ApiNode, Profile, ViewPreference } from './types';

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** 毫秒时间戳。 */
  expiresAt: number;
  scope: string | null;
  tokenType: string;
}

/** 外观偏好：显式浅色 / 显式深色 / 跟随操作系统。 */
export type ThemePreference = 'light' | 'dark' | 'system';

export interface Settings {
  /**
   * 弹窗默认进入的视图 id（见 lib/viewIds.ts）。
   * 只决定打开弹窗时先显示哪一个；切换 Tab 不会写回这里。
   */
  defaultView: string;
  /**
   * 可配置视图（榜单 / 节点）的顺序与展示位置。
   * 顺序即弹窗 Tab 和仪表盘卡片的顺序；popup 最多 6 个，dashboard 不限。
   */
  views: ViewPreference[];
  /** 视图配置结构版本：用于把「最新评论」补给旧配置，只迁移一次。 */
  viewsVersion: number;
  /** 外观偏好，保存在 local:t2:settings，所有页面共用。 */
  theme: ThemePreference;
  /**
   * 是否用系统级桌面通知提示新消息（manifest 需 `notifications` 权限）。
   * 默认开启；关闭后只保留工具栏角标与弹窗 / 仪表盘消息中心。
   */
  desktopNotifications: boolean;
  /**
   * 是否在 2libra.com 的帖子评论框上方显示评论徽章助手（content script）。
   * 默认开启；关闭后不注入状态栏，也不请求徽章与潘多拉接口。
   */
  badgeSwitcher: boolean;
  /**
   * 是否折叠「最新评论」里同一用户连续发布的评论。
   * 默认关闭；开启后同一作者连续达到 `collapseRepeatedCommentsThreshold` 条时
   * 只展示第一条，其余收在展开按钮后面。
   */
  collapseRepeatedComments: boolean;
  /**
   * 连续评论折叠阈值：同一作者连续发布达到这么多条时折叠。
   * 默认 3，可配置 2–10；设为 2 时两条连续评论也会折叠。
   */
  collapseRepeatedCommentsThreshold: number;
  /**
   * 是否在站点的「自定义菜单」弹窗里插入节点级联选择器（content script）。
   * 默认开启；关闭后不注入选择器，菜单名称与链接仍可手动填写。
   */
  customMenuNodePicker: boolean;
}

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

export interface PendingAuth {
  state: string;
  verifier: string;
  redirectUri: string;
  createdAt: number;
}

export interface NodesCache {
  fetchedAt: number;
  nodes: ApiNode[];
  /** 节点树结构版本；旧缓存没有子节点，需要重新拉取。 */
  version?: number;
}

/** 表情短码 → 图片地址；最新评论正文要用它把 `:code:` 渲染成图片。 */
export interface EmojisCache {
  fetchedAt: number;
  /** key 带两端冒号，如 `:sigh:`。 */
  map: Record<string, string>;
}

/**
 * 已经点开过的列表条目：`topic:<short_id>` / `comment:<id>` → 点击时间。
 * 只存条目 id，不存标题或正文；用于列表置灰，过期条目会定期裁掉。
 */
export interface ReadItemsCache {
  items: Record<string, number>;
}

/**
 * 上一次解析成功的用户资料。本地缓存只用于两件事：
 * 1. 精简快照没带头像时，直接复用上次的头像，省掉一次公开资料请求；
 * 2. 刷新资料失败时仍能显示头像和昵称，而不是退回「已登录」。
 * 退出登录时会一并清掉。
 */
export interface ProfileCache {
  profile: Profile;
  fetchedAt: number;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultView: DEFAULT_DEFAULT_VIEW,
  views: createDefaultViews(),
  viewsVersion: VIEWS_VERSION,
  theme: 'system',
  desktopNotifications: true,
  badgeSwitcher: true,
  collapseRepeatedComments: false,
  collapseRepeatedCommentsThreshold: COMMENT_RUN_DEFAULT_LENGTH,
  customMenuNodePicker: true,
};

const PREFIX = 't2';

/* ------------------------------------------------------------------
   存储适配层
   扩展刚改过 manifest（新增 storage 权限）但 Chrome 里还是旧实例、
   或者页面在扩展重载后成了孤儿上下文时，chrome.storage 会不存在。
   这时退回内存存储：界面照常能看，只是设置/登录不会落盘，
   页面上也会显示一条「重新加载扩展」的提示。
------------------------------------------------------------------ */

export interface StorageItem<T> {
  getValue(): Promise<T>;
  setValue(value: T): Promise<void>;
  watch(callback: (value: T, oldValue: T) => void): () => void;
}

function detectStorage(): boolean {
  try {
    const area = (browser as unknown as { storage?: { local?: unknown } }).storage;
    return Boolean(area?.local);
  } catch {
    return false;
  }
}

export const storageAvailable = detectStorage();

const memoryData = new Map<string, unknown>();
const memoryListeners = new Map<string, Set<(value: unknown, oldValue: unknown) => void>>();

function createMemoryItem<T>(key: string, fallback: T): StorageItem<T> {
  return {
    async getValue() {
      return memoryData.has(key) ? (memoryData.get(key) as T) : fallback;
    },
    async setValue(value: T) {
      const oldValue = memoryData.has(key) ? (memoryData.get(key) as T) : fallback;
      memoryData.set(key, value);
      for (const listener of memoryListeners.get(key) ?? []) listener(value, oldValue);
    },
    watch(callback) {
      const listeners = memoryListeners.get(key) ?? new Set();
      memoryListeners.set(key, listeners);
      const wrapped = (value: unknown, oldValue: unknown) => callback(value as T, oldValue as T);
      listeners.add(wrapped);
      return () => {
        listeners.delete(wrapped);
      };
    },
  };
}

let storageWarned = false;

type StorageKey = `local:${string}` | `session:${string}` | `sync:${string}` | `managed:${string}`;

function definePersistentItem<T>(key: StorageKey, fallback: T): StorageItem<T> {
  if (!storageAvailable) {
    if (!storageWarned) {
      storageWarned = true;
      console.warn(
        '[T2] 没有可用的 chrome.storage：设置与登录不会保存。请在 chrome://extensions 重新加载扩展后刷新页面。',
      );
    }
    return createMemoryItem(key, fallback);
  }

  const item = storage.defineItem<T>(key, { fallback });
  return {
    getValue: () => item.getValue(),
    setValue: (value) => item.setValue(value),
    watch: (callback) => item.watch(callback),
  };
}

export const tokensItem = definePersistentItem<TokenSet | null>(`local:${PREFIX}:tokens`, null);

export const settingsItem = definePersistentItem<Settings>(`local:${PREFIX}:settings`, {
  ...DEFAULT_SETTINGS,
});

export const pendingAuthItem = definePersistentItem<PendingAuth | null>(
  `local:${PREFIX}:oauth-pending`,
  null,
);

export const nodesCacheItem = definePersistentItem<NodesCache | null>(`local:${PREFIX}:nodes`, null);

export const emojisCacheItem = definePersistentItem<EmojisCache | null>(
  `local:${PREFIX}:emojis`,
  null,
);

export const readItemsCacheItem = definePersistentItem<ReadItemsCache>(
  `local:${PREFIX}:read-items`,
  { items: {} },
);

export const profileCacheItem = definePersistentItem<ProfileCache | null>(
  `local:${PREFIX}:profile`,
  null,
);

/** 旧版本（0.2.x）把默认榜单存成 board，把分区存成 section。 */
interface StoredSettings extends Partial<Settings> {
  board?: unknown;
  section?: unknown;
}

/** 把存储里的值收敛成可用的设置：旧版本字段、已下线视图都回落到合理值。 */
export function normalizeSettings(stored: StoredSettings | null | undefined): Settings {
  const storedVersion =
    typeof stored?.viewsVersion === 'number' && Number.isFinite(stored.viewsVersion)
      ? stored.viewsVersion
      : 0;
  // v1（或更早）的配置没有「最新评论」；补一次后写回版本号，之后尊重用户的移除操作。
  const views = migrateViewPreferences(
    normalizeViewPreferences(stored?.views),
    storedVersion,
  );
  const popupIds = views.filter((view) => view.popup).map((view) => view.id);

  const legacyBoard =
    typeof stored?.board === 'string' && isBoardId(stored.board)
      ? boardViewId(stored.board)
      : null;
  const storedDefault =
    typeof stored?.defaultView === 'string' ? stored.defaultView : null;

  // 默认视图必须是一个「会出现在弹窗里」的视图，否则打开弹窗时无 Tab 可选。
  const defaultView =
    (storedDefault && popupIds.includes(storedDefault) ? storedDefault : null) ??
    (legacyBoard && popupIds.includes(legacyBoard) ? legacyBoard : null) ??
    popupIds[0] ??
    '';

  return {
    defaultView,
    views,
    viewsVersion: VIEWS_VERSION,
    theme: isThemePreference(stored?.theme) ? stored.theme : DEFAULT_SETTINGS.theme,
    // 旧配置没有这个字段：显式 false 才关，否则（缺省 / 其它值）都按默认开启。
    desktopNotifications: stored?.desktopNotifications === false ? false : true,
    // 评论徽章助手同样是「默认开启」，只有用户显式关过才保持关闭。
    badgeSwitcher: stored?.badgeSwitcher === false ? false : true,
    // 连续评论折叠默认关闭：旧配置没有这个字段，只有显式开启过才生效。
    collapseRepeatedComments: stored?.collapseRepeatedComments === true,
    // 阈值缺省 / 非法时回落到 3，并夹在设置页提供的可选范围内。
    collapseRepeatedCommentsThreshold: normalizeCommentRunThreshold(
      stored?.collapseRepeatedCommentsThreshold,
    ),
    // 菜单节点选择器默认开启：只有用户显式关过才不注入。
    customMenuNodePicker: stored?.customMenuNodePicker === false ? false : true,
  };
}

/** 读出设置并与默认值合并；顺手收敛掉旧版本或手工改坏的字段。 */
export async function readSettings(): Promise<Settings> {
  return normalizeSettings((await settingsItem.getValue()) ?? DEFAULT_SETTINGS);
}
