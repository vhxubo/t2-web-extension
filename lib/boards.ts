import type { BoardId } from './types';

export interface BoardMeta {
  id: BoardId;
  label: string;
  hint: string;
  /** 该榜单的接口是否支持按分区筛选。 */
  supportsSection: boolean;
}

export const BOARDS: BoardMeta[] = [
  { id: 'latest', label: '新发表', hint: '按发布时间', supportsSection: true },
  { id: 'hot24h', label: '今日热议', hint: '24 小时内最活跃', supportsSection: false },
  { id: 'hot7d', label: '近期热议', hint: '7 天内最活跃', supportsSection: false },
  { id: 'value', label: '价值榜', hint: '按帖子价值排序', supportsSection: true },
  { id: 'scores', label: '评分榜', hint: '社区评分', supportsSection: false },
];

export const BOARD_MAP: Record<BoardId, BoardMeta> = BOARDS.reduce(
  (map, board) => {
    map[board.id] = board;
    return map;
  },
  {} as Record<BoardId, BoardMeta>,
);

export function isBoardId(value: string): value is BoardId {
  return value in BOARD_MAP;
}

export function boardMeta(id: BoardId): BoardMeta {
  return BOARD_MAP[id];
}
