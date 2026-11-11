/**
 * 通知筛选分段。
 *
 * 不依赖扩展运行时，方便用 bun test 直接验证「分段 → 接口参数」的映射。
 * `type` 的取值与站点通知中心的下拉框一致，服务端一次只接受一个值；
 * 「回复提及」是独立类型（`reply_mention`），所以这里不把它并进「回复」或「提及」，
 * 需要时仍可在「全部」里看到。
 */
export type NotificationFilter = 'all' | 'unread' | 'reply' | 'mention' | 'reaction' | 'reward';

export interface NotificationFilterOption {
  id: NotificationFilter;
  label: string;
  /** 传给 `GET /v1/me/notifications` 的 `type`；不传表示不按类型过滤。 */
  type?: string;
  /** 只看未读（`unread_only=true`）。 */
  unreadOnly?: boolean;
  /** 悬停提示。 */
  description: string;
  /** 该筛选下没有通知时的标题 / 提示。 */
  emptyTitle: string;
  emptyHint: string;
}

export const NOTIFICATION_FILTERS: readonly NotificationFilterOption[] = [
  {
    id: 'all',
    label: '全部',
    description: '显示全部通知',
    emptyTitle: '没有通知',
    emptyHint: '收到回复、提及、表态、打赏或系统消息时，会出现在这里。',
  },
  {
    id: 'unread',
    label: '未读',
    unreadOnly: true,
    description: '只看未读通知',
    emptyTitle: '没有未读通知',
    emptyHint: '所有通知都已读；切到「全部」可以回看历史。',
  },
  {
    id: 'reply',
    label: '回复',
    type: 'reply',
    description: '只看回复通知',
    emptyTitle: '没有回复通知',
    emptyHint: '这个分类暂时没有消息，切到「全部」看看其它通知。',
  },
  {
    id: 'mention',
    label: '提及',
    type: 'mention',
    description: '只看提及通知',
    emptyTitle: '没有提及通知',
    emptyHint: '这个分类暂时没有消息，切到「全部」看看其它通知。',
  },
  {
    id: 'reaction',
    label: '表态',
    type: 'reaction',
    description: '只看表态通知',
    emptyTitle: '没有表态通知',
    emptyHint: '这个分类暂时没有消息，切到「全部」看看其它通知。',
  },
  {
    id: 'reward',
    label: '打赏',
    type: 'get_reward',
    description: '只看打赏通知',
    emptyTitle: '没有打赏通知',
    emptyHint: '这个分类暂时没有消息，切到「全部」看看其它通知。',
  },
];

const FILTER_MAP: Record<NotificationFilter, NotificationFilterOption> = Object.fromEntries(
  NOTIFICATION_FILTERS.map((option) => [option.id, option]),
) as Record<NotificationFilter, NotificationFilterOption>;

/** 取分段对应的展示元信息（找不到时退回「全部」）。 */
export function notificationFilterMeta(filter: NotificationFilter): NotificationFilterOption {
  return FILTER_MAP[filter] ?? FILTER_MAP.all;
}

/** 把分段翻译成通知列表接口的参数。 */
export function notificationFilterQuery(filter: NotificationFilter): {
  type?: string;
  unreadOnly: boolean;
} {
  const option = notificationFilterMeta(filter);
  return { type: option.type, unreadOnly: option.unreadOnly ?? false };
}
