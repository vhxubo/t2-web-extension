/** 消息：未读数 / 消息列表 / 单条与全部标记已读（需要 `read:me` scope）。 */
import { apiGet, apiPost } from './api';
import type { AppNotification } from './notification-view';

export type { AppNotification, NotificationKind } from './notification-view';
export { describeNotification } from './notification-view';

export interface NotificationPage {
  /** 注意：消息列表的字段名是 `list`，不是 `items`。 */
  list?: AppNotification[];
  total?: number;
  page?: number;
  limit?: number;
  total_pages?: number;
}

interface UnreadCountPayload {
  unread_count?: number;
}

/** 拉取未读消息数，用于弹窗 Dock 小红点与后台的工具栏角标。 */
export async function getUnreadNotificationCount(signal?: AbortSignal): Promise<number> {
  const data = await apiGet<UnreadCountPayload>('/v1/me/notifications/unread-count', { signal });
  const count = Math.floor(Number(data?.unread_count ?? 0));
  return Number.isFinite(count) && count > 0 ? count : 0;
}

/** 拉取消息列表；单条 / 全部已读分别走站点接口和开放 API。 */
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

/**
 * 单条标记已读：站点消息中心使用的 `POST /api/notifications/mark-as-read`，
 * 请求体是 `{ id: [消息 id] }`。
 *
 * 开放 API 文档目前只列出「全部标记已读」（`POST /v1/me/notifications/read`），
 * 没有逐条端点；单条按钮要真正落到服务端，只能沿用站点自己的这个接口。
 */
export async function markNotificationRead(id: string, signal?: AbortSignal): Promise<void> {
  await apiPost<unknown>('/notifications/mark-as-read', {
    body: { id: [id] },
    signal,
  });
}

/**
 * 全部标记已读：`POST /v1/me/notifications/read`，返回 `{ ok: true }`。
 */
export async function markAllNotificationsRead(signal?: AbortSignal): Promise<void> {
  await apiPost<{ ok?: boolean }>('/v1/me/notifications/read', { signal });
}
