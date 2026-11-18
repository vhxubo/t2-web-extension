/**
 * 节点树的纯函数工具：分组、拍平、查找。
 *
 * 单独放在这里是为了让不依赖扩展 API / storage 的逻辑（如菜单节点选择器）
 * 可以在 bun test 里直接导入，不会把 `#imports` 一起拖进来。
 */
import type { ApiNode } from './types';

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

export function normalizeNode(node: ApiNode): ApiNode {
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
