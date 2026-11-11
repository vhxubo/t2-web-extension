import { findNode } from './nodes';
import type { ApiNode, Section } from './types';

/** 持久化用的分区 key：all / p:<顶层 slug> / n:<子节点 slug>。 */
export function sectionKey(section: Section): string {
  if (section.kind === 'all') return 'all';
  return section.kind === 'parent' ? `p:${section.slug}` : `n:${section.slug}`;
}

export function sectionLabel(section: Section, nodes: ApiNode[]): string {
  if (section.kind === 'all') return '全站';
  const node = findNode(nodes, section.slug);
  return node?.name || section.slug;
}

/** 转成 /v1/topics 的筛选参数。子节点用 node_id，顶层节点用 parent_slug。 */
export function sectionQuery(section: Section, nodes: ApiNode[]): Record<string, string> {
  if (section.kind === 'parent') return { parent_slug: section.slug };
  if (section.kind === 'node') {
    const node = findNode(nodes, section.slug);
    return node ? { node_id: node.id } : {};
  }
  return {};
}

/** 子节点解析不到内部 uuid 时，说明节点数据还没准备好。 */
export function sectionResolved(section: Section, nodes: ApiNode[]): boolean {
  if (section.kind !== 'node') return true;
  return Boolean(findNode(nodes, section.slug)?.id);
}
