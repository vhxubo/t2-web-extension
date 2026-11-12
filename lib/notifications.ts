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
 * 标记已读：`POST /v1/me/notifications/read`，返回 `{ ok: true }`。
 *
 * - 不传 `ids`：全部标记已读，请求不带 body（旧用法）。
 * - 传 `ids`：只标记指定通知，请求体是 `{ id: [...] }`（字段名是 `id`，不是
 *   `ids`；服务端会静默丢弃未知字段，写错等于全部已读）。接口单次上限 100 条。
 * - `ids` 为空数组时直接返回：服务端会对 `id: []` 返回 400，不能当全部已读用。
 */
export async function markNotificationsRead(
  ids?: readonly string[],
  signal?: AbortSignal,
): Promise<void> {
  if (!ids) {
    await apiPost<{ ok?: boolean }>('/v1/me/notifications/read', { signal });
    return;
  }
  // 上限 100：超过就分批，避免整批被拒后一条都没标。
  for (let start = 0; start < ids.length; start += 100) {
    await apiPost<{ ok?: boolean }>('/v1/me/notifications/read', {
      body: { id: ids.slice(start, start + 100) },
      signal,
    });
  }
}
