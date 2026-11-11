/**
 * 视图（榜单 / 节点）身份与持久化配置。
 *
 * 一个「视图」是弹窗里的一个 Tab、仪表盘上的一张卡片。身份用稳定的字符串表示：
 * - `board:<id>`：八个内置榜单；
 * - `section:all`：全站最新；
 * - `section:p:<slug>`：某个父节点（含全部子节点）；
 * - `section:n:<slug>`：某个具体子节点。
 *
 * 设置里只保存 id 和「在哪些界面展示」，节点名称等展示信息在运行时从
 * `/v1/nodes` 解析（见 lib/views.ts），这样接口改名后不需要迁移旧配置。
 */
import { isBoardId } from './boards';
import type { BoardId, Section, ViewPreference } from './types';

/** 弹窗最多展示的 Tab 数；仪表盘不限。 */
export const POPUP_TAB_LIMIT = 6;

/**
 * 视图配置结构版本。
 * v2 起默认带「最新评论」；旧配置在读取时补上这一项（见 migrateViewPreferences）。
 */
export const VIEWS_VERSION = 2;

export function boardViewId(board: BoardId): string {
  return `board:${board}`;
}

export function sectionViewId(section: Section): string {
  if (section.kind === 'all') return 'section:all';
  return `section:${section.kind === 'parent' ? 'p' : 'n'}:${section.slug}`;
}

export type ParsedViewId =
  | { kind: 'board'; board: BoardId }
  | { kind: 'section'; section: Section };

export function parseViewId(id: string): ParsedViewId | null {
  if (id.startsWith('board:')) {
    const board = id.slice('board:'.length);
    return isBoardId(board) ? { kind: 'board', board } : null;
  }

  if (id === 'section:all') return { kind: 'section', section: { kind: 'all' } };

  if (id.startsWith('section:p:')) {
    const slug = id.slice('section:p:'.length).trim();
    return slug ? { kind: 'section', section: { kind: 'parent', slug } } : null;
  }

  if (id.startsWith('section:n:')) {
    const slug = id.slice('section:n:'.length).trim();
    return slug ? { kind: 'section', section: { kind: 'node', slug } } : null;
  }

  return null;
}

/** 默认配置：八个内置榜单，全部同时出现在弹窗与仪表盘。 */
export const DEFAULT_VIEW_IDS = [
  boardViewId('home'),
  boardViewId('hot24h'),
  boardViewId('hot7d'),
  boardViewId('latest'),
  boardViewId('comments'),
  boardViewId('community'),
  boardViewId('work'),
  boardViewId('life'),
] as const;

export const DEFAULT_DEFAULT_VIEW = boardViewId('home');

export function createDefaultViews(): ViewPreference[] {
  // 仪表盘放下全部内置榜单；弹窗只放前 6 个，后面的默认仅在仪表盘展示。
  return DEFAULT_VIEW_IDS.map((id, index) => ({
    id,
    popup: index < POPUP_TAB_LIMIT,
    dashboard: true,
  }));
}

/**
 * 旧配置补上「最新评论」。
 *
 * 只在新版本第一次读取时做一次（用 viewsVersion 标记），之后用户主动移除就不会再加回来。
 * 弹窗已满时只加到仪表盘，避免悄悄挤掉用户自己挑的 Tab。
 */
export function migrateViewPreferences(
  views: ViewPreference[],
  storedVersion: number,
): ViewPreference[] {
  if (storedVersion >= VIEWS_VERSION) return views;
  if (views.some((view) => view.id === boardViewId('comments'))) return views;

  const next = [...views];
  const latestIndex = next.findIndex((view) => view.id === boardViewId('latest'));
  const popupCount = next.filter((view) => view.popup).length;
  next.splice(latestIndex >= 0 ? latestIndex + 1 : next.length, 0, {
    id: boardViewId('comments'),
    popup: popupCount < POPUP_TAB_LIMIT,
    dashboard: true,
  });
  return next;
}

function normalizeViewPreference(raw: unknown): ViewPreference | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  const id = typeof record.id === 'string' ? record.id : '';
  if (!parseViewId(id)) return null;
  return {
    id,
    // 旧版本没有这两个字段，按「都展示」迁移。
    popup: typeof record.popup === 'boolean' ? record.popup : true,
    dashboard: typeof record.dashboard === 'boolean' ? record.dashboard : true,
  };
}

/** 收敛存储里的视图配置：丢掉非法 / 重复 id，空配置回落默认值。 */
export function normalizeViewPreferences(raw: unknown): ViewPreference[] {
  if (!Array.isArray(raw)) return createDefaultViews();

  const seen = new Set<string>();
  const views: ViewPreference[] = [];
  let popupCount = 0;
  for (const item of raw) {
    const view = normalizeViewPreference(item);
    if (!view || seen.has(view.id)) continue;
    seen.add(view.id);
    // 硬上限：旧配置或手工改存储里可能超过 6 个，读取时收敛掉多出来的弹窗位。
    if (view.popup) {
      popupCount += 1;
      if (popupCount > POPUP_TAB_LIMIT) view.popup = false;
    }
    views.push(view);
  }
  return views.length ? views : createDefaultViews();
}

export function popupViewIds(views: ViewPreference[]): string[] {
  return views.filter((view) => view.popup).map((view) => view.id);
}

/** Tab / 卡片 DOM id 里不能直接放 `:` 等字符。 */
export function viewDomId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, '-');
}
