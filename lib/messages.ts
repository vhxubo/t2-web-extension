/**
 * 后台与扩展页面之间的消息。
 *
 * 正常情况下后台是消息长连接（SSE）的持有者：拿到未读数后既更新工具栏角标，
 * 也通过 `runtime.sendMessage` 广播给所有打开的扩展页面。页面挂载时再主动
 * 问一次长连接状态；后台没就绪时页面会自己连一条短连接兜底，保证小红点
 * 不依赖 service worker 是否存活。
 *
 * 页面自己拉到未读数后也会回报给后台：这样即使长连接暂时不可用，
 * 页面上的小红点和工具栏角标也始终是同一份、最新的数字。
 *
 * 消息只带数字和布尔值：推送里没有消息内容，扩展也不缓存别人的内容。
 */

export const UNREAD_COUNT_MESSAGE = 't2:notifications/unread-count';
export const UNREAD_REPORT_MESSAGE = 't2:notifications/unread-report';
export const NOTIFICATION_EVENT_MESSAGE = 't2:notifications/event';
export const STREAM_STATUS_MESSAGE = 't2:notifications/stream-status';
export const STREAM_STATUS_QUERY = 't2:notifications/stream-status-query';

/**
 * 页面自己的长连接收到 notification_update 时派发的窗口事件。
 * 后台不可用时由页面兜底连一条 SSE；消息中心据此刷新列表，
 * 不必依赖后台广播（后台可能正被浏览器回收）。
 */
export const NOTIFICATION_LOCAL_EVENT = 't2:notifications/local-event';

export interface UnreadCountMessage {
  type: typeof UNREAD_COUNT_MESSAGE;
  /** 已归一化为 >= 0 的整数。 */
  count: number;
}

/** 服务端推送了一条 `notification_update`；页面可以按需刷新消息列表。 */
export interface NotificationEventMessage {
  type: typeof NOTIFICATION_EVENT_MESSAGE;
}

/** 页面直接拉到未读数后回报给后台，用来同步角标。 */
export interface UnreadReportMessage {
  type: typeof UNREAD_REPORT_MESSAGE;
  count: number;
  /** 这次请求开始的时间戳，后台用它丢弃比已应用结果更旧的回报。 */
  at: number;
}

export interface StreamStatusMessage {
  type: typeof STREAM_STATUS_MESSAGE;
  connected: boolean;
}

export interface StreamStatusQuery {
  type: typeof STREAM_STATUS_QUERY;
}

export type NotificationBroadcast = UnreadCountMessage | NotificationEventMessage | StreamStatusMessage;
export type NotificationMessage =
  | NotificationBroadcast
  | UnreadReportMessage
  | StreamStatusQuery;

function typeOf(message: unknown): unknown {
  return message !== null && typeof message === 'object'
    ? (message as { type?: unknown }).type
    : undefined;
}

export function isUnreadCountMessage(message: unknown): message is UnreadCountMessage {
  return (
    typeOf(message) === UNREAD_COUNT_MESSAGE &&
    typeof (message as { count?: unknown }).count === 'number' &&
    Number.isFinite((message as { count: number }).count)
  );
}

export function isUnreadReportMessage(message: unknown): message is UnreadReportMessage {
  return (
    typeOf(message) === UNREAD_REPORT_MESSAGE &&
    typeof (message as { count?: unknown }).count === 'number' &&
    Number.isFinite((message as { count: number }).count) &&
    typeof (message as { at?: unknown }).at === 'number' &&
    Number.isFinite((message as { at: number }).at)
  );
}

export function isNotificationEventMessage(message: unknown): message is NotificationEventMessage {
  return typeOf(message) === NOTIFICATION_EVENT_MESSAGE;
}

export function isStreamStatusMessage(message: unknown): message is StreamStatusMessage {
  return (
    typeOf(message) === STREAM_STATUS_MESSAGE &&
    typeof (message as { connected?: unknown }).connected === 'boolean'
  );
}

export function isStreamStatusQuery(message: unknown): message is StreamStatusQuery {
  return typeOf(message) === STREAM_STATUS_QUERY;
}
