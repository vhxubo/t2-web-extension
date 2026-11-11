/** 通知：只读未读数与通知列表（需要 `read:me` scope）。 */
import { apiGet } from './api';
import type { AppNotification } from './notification-view';

export type { AppNotification, NotificationKind } from './notification-view';
export { describeNotification } from './notification-view';

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

/** 拉取未读通知数，用于弹窗 Dock 小红点与后台的工具栏角标。 */
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
