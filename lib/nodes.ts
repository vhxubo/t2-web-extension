import { apiGet } from './api';
import { nodesCacheItem } from './storage';
import type { ApiNode } from './types';

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

function normalizeNode(node: ApiNode): ApiNode {
  return {
    ...node,
    // 接口文档写的是 dimension，旧代码里用 dimensions；统一到 dimensions。
    dimension: node.dimension ?? node.dimensions ?? null,
    dimensions: node.dimensions ?? node.dimension ?? null,
    children: Array.isArray(node.children)
      ? node.children.map(normalizeNode).sort(compareNodes)
      : [],
  };
}

export interface SectionGroup {
  dimension: string;
  label: string;
  nodes: ApiNode[];
}

const DIMENSION_LABELS: Record<string, string> = {
  work: '工作',
  life: '生活',
  special: '特别',
};

const DIMENSION_ORDER = ['work', 'life', 'special'];

/** 按接口返回的 dimension(s) 字段分组，分组顺序固定，未知分组排在最后。 */
export function groupNodes(nodes: ApiNode[]): SectionGroup[] {
  const groups = new Map<string, ApiNode[]>();
  for (const node of nodes) {
    const dimension = node.dimensions || node.dimension || 'other';
    const list = groups.get(dimension);
    if (list) list.push(node);
    else groups.set(dimension, [node]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => rankDimension(a) - rankDimension(b))
    .map(([dimension, list]) => ({
      dimension,
      label: DIMENSION_LABELS[dimension] ?? '其他',
      nodes: [...list].sort(compareNodes),
    }));
}

function compareNodes(a: ApiNode, b: ApiNode): number {
  const order = (a.sort_order ?? 0) - (b.sort_order ?? 0);
  if (order !== 0) return order;
  return (a.name ?? '').localeCompare(b.name ?? '', 'zh-CN');
}

function rankDimension(dimension: string): number {
  const index = DIMENSION_ORDER.indexOf(dimension);
  return index === -1 ? DIMENSION_ORDER.length : index;
}

export function flattenNodes(nodes: ApiNode[]): ApiNode[] {
  return nodes.flatMap((node) => [node, ...flattenNodes(node.children ?? [])]);
}

export function findNode(nodes: ApiNode[], slug: string): ApiNode | undefined {
  return flattenNodes(nodes).find((node) => node.slug === slug);
}

export function findParent(nodes: ApiNode[], slug: string): ApiNode | undefined {
  for (const node of nodes) {
    if ((node.children ?? []).some((child) => child.slug === slug)) return node;
    const nested = findParent(node.children ?? [], slug);
    if (nested) return nested;
  }
  return undefined;
}
