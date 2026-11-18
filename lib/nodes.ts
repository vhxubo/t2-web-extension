import { apiGet } from './api';
import { nodesCacheItem } from './storage';
import { normalizeNode } from './node-tree';
import type { ApiNode } from './types';

/**
 * 节点树的纯函数工具放在 `lib/node-tree.ts`，这里重新导出以保持现有调用方不变。
 */
export {
  findNode,
  findParent,
  flattenNodes,
  groupNodes,
  normalizeNode,
  type SectionGroup,
} from './node-tree';

const NODES_TTL = 10 * 60 * 1000;
const NODES_CACHE_VERSION = 3;

/** 进程内缓存：StrictMode 双挂载、重复 `useNodes` 不必重读 storage。 */
let memo: { at: number; nodes: ApiNode[] } | null = null;
/** 单飞：同一个页面里的并发调用共享同一次节点树请求。 */
let inflight: Promise<ApiNode[]> | null = null;

/**
 * 节点列表变化极少，缓存 10 分钟；请求失败时退回旧缓存。
 *
 * `/v1/nodes` 不传 `parent` 时直接返回完整节点树（每个顶层节点带 `children`），
 * 不再按 `?parent=<slug>` 逐个补拉子节点。`parent_slug` 过滤与「添加节点」面板
 * 都依赖这棵完整的两层树。
 */
export function loadNodes(force = false): Promise<ApiNode[]> {
  if (!force && memo && Date.now() - memo.at < NODES_TTL) {
    return Promise.resolve(memo.nodes);
  }
  inflight ??= doLoadNodes(force).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doLoadNodes(force: boolean): Promise<ApiNode[]> {
  const cache = await nodesCacheItem.getValue();
  const fresh =
    cache &&
    cache.version === NODES_CACHE_VERSION &&
    Date.now() - cache.fetchedAt < NODES_TTL;
  if (!force && fresh && cache.nodes.length > 0) {
    memo = { at: Date.now(), nodes: cache.nodes };
    return cache.nodes;
  }

  try {
    const raw = await apiGet<ApiNode[]>('/v1/nodes', { auth: false });
    const nodes = Array.isArray(raw) ? raw.map(normalizeNode) : [];

    await nodesCacheItem.setValue({
      fetchedAt: Date.now(),
      nodes,
      version: NODES_CACHE_VERSION,
    });
    memo = { at: Date.now(), nodes };
    return nodes;
  } catch (error) {
    if (cache?.nodes.length) {
      memo = { at: Date.now(), nodes: cache.nodes };
      return cache.nodes;
    }
    throw error;
  }
}
