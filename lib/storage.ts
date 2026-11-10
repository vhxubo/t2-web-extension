import { browser, storage } from '#imports';
import { isBoardId } from './boards';
import type { ApiNode, BoardId, Profile } from './types';

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** 毫秒时间戳。 */
  expiresAt: number;
  scope: string | null;
  tokenType: string;
}

export interface Settings {
  /**
   * 弹窗默认进入的榜单。只有完整页面的设置弹窗能改；
   * 在弹窗里切换榜单只影响当次浏览，不会写回这里。
   */
  board: BoardId;
  /** 默认展示的分区，见 lib/section.ts 的 key 规则。 */
  section: string;
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
  board: 'latest',
  section: 'all',
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

export const profileCacheItem = definePersistentItem<ProfileCache | null>(
  `local:${PREFIX}:profile`,
  null,
);

/** 把存储里的值收敛成可用的设置：旧版本字段、已下线榜单都回落到默认值。 */
export function normalizeSettings(stored: Partial<Settings> | null | undefined): Settings {
  return {
    board:
      typeof stored?.board === 'string' && isBoardId(stored.board)
        ? stored.board
        : DEFAULT_SETTINGS.board,
    section: typeof stored?.section === 'string' ? stored.section : DEFAULT_SETTINGS.section,
  };
}

/** 读出设置并与默认值合并；顺手收敛掉旧版本或手工改坏的字段。 */
export async function readSettings(): Promise<Settings> {
  return normalizeSettings((await settingsItem.getValue()) ?? DEFAULT_SETTINGS);
}
