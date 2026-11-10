import { browser, storage } from '#imports';
import { isBoardId } from './boards';
import type { ApiNode, BoardId } from './types';

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  /** 毫秒时间戳。 */
  expiresAt: number;
  scope: string | null;
  tokenType: string;
  source: 'oauth' | 'manual';
}

export interface Settings {
  /** 默认查看的榜单。 */
  board: BoardId;
  /** 默认展示的分区，见 lib/section.ts 的 key 规则。 */
  section: string;
  pageSize: number;
  /** 2Libra OAuth 应用的 client_id（公开客户端，无 secret）。 */
  clientId: string;
}

export interface PendingAuth {
  state: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  createdAt: number;
}

export interface NodesCache {
  fetchedAt: number;
  nodes: ApiNode[];
}

export const DEFAULT_SETTINGS: Settings = {
  board: 'latest',
  section: 'all',
  pageSize: 20,
  clientId: '',
};

export const PAGE_SIZES = [20, 30, 50] as const;

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
        '[2Libra] 没有可用的 chrome.storage：设置与登录不会保存。请在 chrome://extensions 重新加载扩展后刷新页面。',
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

/** 读出设置并与默认值合并；顺手收敛掉旧版本或手工改坏的字段。 */
export async function readSettings(): Promise<Settings> {
  const stored = await settingsItem.getValue();
  const merged = { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
  return {
    ...merged,
    board: isBoardId(merged.board) ? merged.board : DEFAULT_SETTINGS.board,
    pageSize: (PAGE_SIZES as readonly number[]).includes(merged.pageSize)
      ? merged.pageSize
      : DEFAULT_SETTINGS.pageSize,
    section: typeof merged.section === 'string' ? merged.section : 'all',
  };
}
