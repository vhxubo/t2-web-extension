/** 通知：只读未读数与通知列表（需要 `read:me` scope）。 */
import { apiGet } from './api';
import type { Author } from './types';

export interface AppNotification {
  id: string;
  type?: string;
  /** 通知负载结构未公开承诺，按未知字段处理，只做展示兜底。 */
  payload?: Record<string, unknown> | null;
  is_read?: boolean;
  created_at?: string;
  from_user?: Author | null;
  emojis?: Record<string, string>;
}

export interface NotificationPage {
  /** 注意：通知列表的字段名是 `list`，不是 `items`。 */
  list?: AppNotification[];
  total?: number;
  page?: number;
  limit?: number;
  total_pages?: number;
}

interface UnreadCountPayload {
  unread_count?: number;
}

/** 拉取未读通知数，用于弹窗 Dock 上的小红点。 */
export async function getUnreadNotificationCount(signal?: AbortSignal): Promise<number> {
  const data = await apiGet<UnreadCountPayload>('/v1/me/notifications/unread-count', { signal });
  const count = Math.floor(Number(data?.unread_count ?? 0));
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/** 拉取通知列表；扩展只读，标记已读仍需到站点内完成。 */
export async function getNotifications(
  options: {
    page?: number;
    limit?: number;
    unreadOnly?: boolean;
    type?: string;
    signal?: AbortSignal;
  } = {},
): Promise<NotificationPage> {
  const { page = 1, limit = 30, unreadOnly = false, type, signal } = options;
  return apiGet<NotificationPage>('/v1/me/notifications', {
    query: {
      page,
      limit,
      unread_only: unreadOnly ? 'true' : undefined,
      type,
    },
    signal,
  });
}

const TYPE_LABELS: Record<string, string> = {
  reply: '回复',
  mention: '提及',
  system: '系统',
  reward: '打赏',
  like: '点赞',
  reaction: '表态',
  follow: '关注',
  favorite: '收藏',
};

export function notificationTypeLabel(type?: string): string {
  if (!type) return '通知';
  return TYPE_LABELS[type] ?? type;
}

/**
 * 通知正文只给出稳定、可展示的兜底文案。
 * 不猜测 payload 的内部结构，避免把别人的内容拼错或缓存下来。
 */
export function notificationSummary(item: AppNotification): { actor: string | null; text: string } {
  const actor = item.from_user?.username ?? null;
  switch (item.type) {
    case 'reply':
      return { actor, text: '回复了你的帖子' };
    case 'mention':
      return { actor, text: '在帖子里提到了你' };
    case 'like':
    case 'reaction':
      return { actor, text: '赞了你的内容' };
    case 'follow':
      return { actor, text: '关注了你' };
    case 'reward':
      return { actor, text: '打赏了你的帖子' };
    case 'favorite':
      return { actor, text: '收藏了你的帖子' };
    case 'system':
      return { actor: null, text: '你有一条新的系统通知' };
    default:
      return { actor, text: '发来一条新通知' };
  }
}
