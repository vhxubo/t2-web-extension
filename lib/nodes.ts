import { apiGet } from './api';
import { nodesCacheItem } from './storage';
import type { ApiNode } from './types';

const NODES_TTL = 10 * 60 * 1000;

/** 节点列表变化极少，缓存 10 分钟；请求失败时退回旧缓存。 */
export async function loadNodes(force = false): Promise<ApiNode[]> {
  const cache = await nodesCacheItem.getValue();
  const fresh = cache && Date.now() - cache.fetchedAt < NODES_TTL;
  if (!force && fresh && cache.nodes.length > 0) return cache.nodes;

  try {
    const nodes = await apiGet<ApiNode[]>('/v1/nodes', { auth: false });
    const list = Array.isArray(nodes) ? nodes.map(normalizeNode) : [];
    await nodesCacheItem.setValue({ fetchedAt: Date.now(), nodes: list });
    return list;
  } catch (error) {
    if (cache?.nodes.length) return cache.nodes;
    throw error;
  }
}

function normalizeNode(node: ApiNode): ApiNode {
  return {
    ...node,
    children: Array.isArray(node.children) ? node.children.map(normalizeNode) : [],
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

/** 按接口返回的 dimensions 字段分组，分组顺序固定，未知分组排在最后。 */
export function groupNodes(nodes: ApiNode[]): SectionGroup[] {
  const groups = new Map<string, ApiNode[]>();
  for (const node of nodes) {
    const dimension = node.dimensions || 'other';
    const list = groups.get(dimension);
    if (list) list.push(node);
    else groups.set(dimension, [node]);
  }

  return [...groups.entries()]
    .sort(([a], [b]) => rankDimension(a) - rankDimension(b))
    .map(([dimension, list]) => ({
      dimension,
      label: DIMENSION_LABELS[dimension] ?? '其他',
      nodes: [...list].sort((a, b) => (a.name ?? '').localeCompare(b.name ?? '', 'zh-CN')),
    }));
}

function rankDimension(dimension: string): number {
  const index = DIMENSION_ORDER.indexOf(dimension);
  return index === -1 ? DIMENSION_ORDER.length : index;
}

export function flattenNodes(nodes: ApiNode[]): ApiNode[] {
  return nodes.flatMap((node) => [node, ...(node.children ?? [])]);
}

export function findNode(nodes: ApiNode[], slug: string): ApiNode | undefined {
  return flattenNodes(nodes).find((node) => node.slug === slug);
}

export function findParent(nodes: ApiNode[], slug: string): ApiNode | undefined {
  return nodes.find((node) => (node.children ?? []).some((child) => child.slug === slug));
}
