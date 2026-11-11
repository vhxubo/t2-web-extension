/**
 * 把持久化的视图 id 解析成可直接渲染的展示信息。
 *
 * 内置榜单的文案来自 lib/boards.ts；节点视图的名称来自 `/v1/nodes` 的缓存，
 * 节点数据还没到 / 节点已下线时退回 slug，界面仍能正确显示与操作。
 */
import { BOARD_MAP } from './boards';
import type { MeViewMeta } from './me';
import { findNode, findParent, groupNodes } from './nodes';
import { POPUP_TAB_LIMIT, parseViewId } from './viewIds';
import type { ApiNode, BoardId, Section, ViewPreference } from './types';

const ALL_SECTION: Section = { kind: 'all' };

export interface ResolvedView {
  id: string;
  kind: 'board' | 'section' | 'me';
  board?: BoardId;
  section: Section;
  /** 「我的」系统视图的元信息；其它视图为 undefined。 */
  me?: MeViewMeta;
  label: string;
  shortLabel: string;
  hint: string;
  icon: string;
  pageSize: number;
  /** 节点视图是否能在节点数据里找到；内置榜单、全站与「我的」始终可用。 */
  available: boolean;
  /** 卡片 / 设置行里的小标签：榜单 / 全站 / 父节点 / 子节点 / 我的。 */
  sourceLabel: string;
}

export interface ViewEntry extends ViewPreference {
  view: ResolvedView;
}

export function resolveView(id: string, nodes: ApiNode[]): ResolvedView {
  const parsed = parseViewId(id);

  if (!parsed) {
    return {
      id,
      kind: 'section',
      section: ALL_SECTION,
      label: id || '未知视图',
      shortLabel: '未知',
      hint: '这个视图已经不可用',
      icon: '❔',
      pageSize: 50,
      available: false,
      sourceLabel: '未知',
    };
  }

  if (parsed.kind === 'board') {
    const meta = BOARD_MAP[parsed.board];
    return {
      id,
      kind: 'board',
      board: parsed.board,
      section: ALL_SECTION,
      label: meta.label,
      shortLabel: meta.shortLabel ?? meta.label,
      hint: `${meta.icon} ${meta.hint}`,
      icon: meta.icon,
      pageSize: meta.pageSize,
      available: true,
      sourceLabel: '榜单',
    };
  }

  if (parsed.kind === 'me') {
    const meta = parsed.me;
    return {
      id,
      kind: 'me',
      me: meta,
      section: ALL_SECTION,
      label: meta.label,
      shortLabel: meta.shortLabel ?? meta.label,
      hint: `${meta.icon} ${meta.hint}`,
      icon: meta.icon,
      pageSize: meta.pageSize,
      available: true,
      sourceLabel: '我的',
    };
  }

  const section = parsed.section;

  if (section.kind === 'all') {
    return {
      id,
      kind: 'section',
      section,
      label: '全站',
      shortLabel: '全站',
      hint: '所有节点的最新帖子',
      icon: '🌐',
      pageSize: 50,
      available: true,
      sourceLabel: '全站',
    };
  }

  if (section.kind === 'parent') {
    const node = findNode(nodes, section.slug);
    return {
      id,
      kind: 'section',
      section,
      label: node?.name || section.slug,
      shortLabel: node?.name || section.slug,
      hint: node ? `${node.name} · 父节点，含全部子节点` : `父节点 ${section.slug} 未找到`,
      icon: '🗂️',
      pageSize: 50,
      available: Boolean(node),
      sourceLabel: '父节点',
    };
  }

  const node = findNode(nodes, section.slug);
  const parent = findParent(nodes, section.slug);
  const name = node?.name || section.slug;
  return {
    id,
    kind: 'section',
    section,
    label: name,
    shortLabel: name,
    hint: parent ? `${parent.name} / ${name}` : `子节点 ${section.slug}`,
    icon: '💬',
    pageSize: 50,
    available: Boolean(node?.id),
    sourceLabel: '子节点',
  };
}

export function buildViewEntries(prefs: ViewPreference[], nodes: ApiNode[]): ViewEntry[] {
  return prefs.map((pref) => ({ ...pref, view: resolveView(pref.id, nodes) }));
}

/** 弹窗 Tab：按配置顺序取前 6 个（硬上限，防止手工改存储后溢出）。 */
export function popupEntries(entries: ViewEntry[]): ViewEntry[] {
  return entries.filter((entry) => entry.popup).slice(0, POPUP_TAB_LIMIT);
}

/** 仪表盘卡片：不限制数量。 */
export function dashboardEntries(entries: ViewEntry[]): ViewEntry[] {
  return entries.filter((entry) => entry.dashboard);
}

export interface ViewOption {
  id: string;
  label: string;
  hint: string;
  group: string | null;
  depth: number;
}

/**
 * 「添加节点」面板的候选项。
 * 每个父节点提供一条「父节点（含全部子节点）」，每个子节点单独一条。
 */
export function viewOptions(nodes: ApiNode[]): ViewOption[] {
  const options: ViewOption[] = [
    { id: 'section:all', label: '全站', hint: '所有节点的最新帖子', group: null, depth: 0 },
  ];

  for (const group of groupNodes(nodes)) {
    for (const node of group.nodes) {
      if (!node.slug) continue;
      options.push({
        id: `section:p:${node.slug}`,
        label: node.name,
        hint: `${node.name} · 父节点，读取全部子节点`,
        group: group.label,
        depth: 0,
      });
      for (const child of node.children ?? []) {
        if (!child.slug) continue;
        options.push({
          id: `section:n:${child.slug}`,
          label: child.name,
          hint: `${node.name} / ${child.name} · 子节点`,
          group: group.label,
          depth: 1,
        });
      }
    }
  }

  return options;
}
