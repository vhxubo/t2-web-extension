import { apiGet } from './api';
import { nodesCacheItem } from './storage';
import type { ApiNode } from './types';

const NODES_TTL = 10 * 60 * 1000;
const NODES_CACHE_VERSION = 2;

/**
 * 节点列表变化极少，缓存 10 分钟；请求失败时退回旧缓存。
 *
 * `/v1/nodes` 只返回顶层节点，子节点要再按 `?parent=<slug>` 拉一次。
 * 这里把所有顶层节点的子节点一并拉齐，`parent_slug` 过滤与「添加节点」面板
 * 都依赖这棵完整的两层树。
 */
export async function loadNodes(force = false): Promise<ApiNode[]> {
  const cache = await nodesCacheItem.getValue();
  const fresh =
    cache &&
    cache.version === NODES_CACHE_VERSION &&
    !cache.partial &&
    Date.now() - cache.fetchedAt < NODES_TTL;
  if (!force && fresh && cache.nodes.length > 0) return cache.nodes;

  try {
    const raw = await apiGet<ApiNode[]>('/v1/nodes', { auth: false });
    const roots = Array.isArray(raw) ? raw.map(normalizeNode) : [];

    // 顶级节点通常不多，但仍按 4 个并发读取子节点，避免一次性打满匿名配额。
    const children = await mapWithConcurrency(roots, 4, (node) =>
      apiGet<ApiNode[]>('/v1/nodes', { auth: false, query: { parent: node.slug } }),
    );

    let partial = false;
    const nodes = roots.map((node, index) => {
      const result = children[index];
      if (!result || result.status !== 'fulfilled') {
        partial = true;
        return node;
      }
      const fetched = Array.isArray(result.value) ? result.value.map(normalizeNode) : [];
      // 接口未来若直接在顶层返回 children，与单独请求的结果合并去重。
      const bySlug = new Map<string, ApiNode>();
      for (const child of node.children ?? []) bySlug.set(child.slug, child);
      for (const child of fetched) bySlug.set(child.slug, child);
      return { ...node, children: [...bySlug.values()].sort(compareNodes) };
    });

    await nodesCacheItem.setValue({
      fetchedAt: Date.now(),
      nodes,
      version: NODES_CACHE_VERSION,
      partial,
    });
    return nodes;
  } catch (error) {
    if (cache?.nodes.length) return cache.nodes;
    throw error;
  }
}

/** 带并发上限的 allSettled，节点数量多时也不会瞬间打满接口配额。 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<Array<PromiseSettledResult<R>>> {
  const results = new Array<PromiseSettledResult<R>>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      const item = items[index];
      if (item === undefined) continue;
      try {
        results[index] = { status: 'fulfilled', value: await task(item, index) };
      } catch (reason) {
        results[index] = { status: 'rejected', reason };
      }
    }
  });

  await Promise.all(workers);
  return results;
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
