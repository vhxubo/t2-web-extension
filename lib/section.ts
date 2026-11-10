import { findNode, findParent, groupNodes } from './nodes';
import type { ApiNode, Section } from './types';

/** 持久化用的分区 key：all / p:<顶层 slug> / n:<子节点 slug>。 */
export function sectionKey(section: Section): string {
  if (section.kind === 'all') return 'all';
  return section.kind === 'parent' ? `p:${section.slug}` : `n:${section.slug}`;
}

export function parseSectionKey(key: string | null | undefined): Section {
  if (!key || key === 'all') return { kind: 'all' };
  if (key.startsWith('p:')) return { kind: 'parent', slug: key.slice(2) };
  if (key.startsWith('n:')) return { kind: 'node', slug: key.slice(2) };
  return { kind: 'all' };
}

export function sectionLabel(section: Section, nodes: ApiNode[]): string {
  if (section.kind === 'all') return '全站';
  const node = findNode(nodes, section.slug);
  return node?.name || section.slug;
}

export function sectionPath(section: Section, nodes: ApiNode[]): string {
  if (section.kind === 'all') return '全站';
  if (section.kind === 'parent') return sectionLabel(section, nodes);
  const parent = findParent(nodes, section.slug);
  const node = findNode(nodes, section.slug);
  const name = node?.name || section.slug;
  return parent ? `${parent.name} / ${name}` : name;
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

export interface SectionOption {
  value: string;
  label: string;
  group: string | null;
  depth: number;
}

/** 下拉框/设置页用的扁平分区列表，包含全部顶层分区与子分区。 */
export function sectionOptions(nodes: ApiNode[]): SectionOption[] {
  const options: SectionOption[] = [{ value: 'all', label: '全站', group: null, depth: 0 }];
  for (const group of groupNodes(nodes)) {
    for (const node of group.nodes) {
      options.push({ value: `p:${node.slug}`, label: node.name, group: group.label, depth: 0 });
      for (const child of node.children ?? []) {
        options.push({
          value: `n:${child.slug}`,
          label: child.name,
          group: group.label,
          depth: 1,
        });
      }
    }
  }
  return options;
}
