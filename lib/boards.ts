import type { BoardId } from './types';

export interface BoardMeta {
  id: BoardId;
  label: string;
  /** 窄空间（弹窗底部标签）使用的短标签。 */
  shortLabel?: string;
  hint: string;
  /** 看板标题前的轻量图标。 */
  icon: string;
  /** 该榜单的接口是否支持按分区筛选。 */
  supportsSection: boolean;
}

export const BOARDS: BoardMeta[] = [
  {
    id: 'latest',
    label: '新发表',
    shortLabel: '最新',
    hint: '按发布时间',
    icon: '📑',
    supportsSection: true,
  },
  {
    id: 'hot24h',
    label: '今日热议',
    shortLabel: '今日热议',
    hint: '24 小时内最活跃',
    icon: '🔥',
    supportsSection: false,
  },
  {
    id: 'hot7d',
    label: '近期热议',
    shortLabel: '近期热议',
    hint: '7 天内最活跃',
    icon: '📈',
    supportsSection: false,
  },
  {
    id: 'value',
    label: '价值榜',
    shortLabel: '价值榜',
    hint: '按帖子价值排序',
    icon: '💎',
    supportsSection: true,
  },
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
