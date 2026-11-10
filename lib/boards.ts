import type { BoardId, TopicDimension } from './types';

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
  /** 该榜单对应 `GET /v1/topics?dimensions=...` 的维度。 */
  dimension?: TopicDimension;
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
    id: 'work',
    label: '工作',
    shortLabel: '工作',
    hint: '工作维度的最新话题',
    icon: '💼',
    supportsSection: true,
    dimension: 'work',
  },
  {
    id: 'life',
    label: '生活',
    shortLabel: '生活',
    hint: '生活维度的最新话题',
    icon: '🌿',
    supportsSection: true,
    dimension: 'life',
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
