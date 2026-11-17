/**
 * 把一条消息归一成原生通知的标题 / 正文 / 补充信息。
 *
 * 刻意不依赖扩展运行时（浏览器 API / storage），方便用 bun test 直接验证；
 * 系统通知的创建与点击跳转留在 lib/native-notifications.ts。
 *
 * 原生通知只有 title / message / contextMessage 三行，所以按信息量排序：
 * 标题放「谁做了什么」，正文优先放消息里真正的正文（回复内容、系统提示），
 * 帖子标题、金币等次级信息放第三行小字，避免拉到了详情却只显示标题。
 */
import { describeNotification, type AppNotification } from './notification-view';

const DEFAULT_TITLE = 'T2 Web Extension';

export interface NotificationContent {
  title: string;
  message: string;
  /** 第三行小字：目标标题 / 附加信息 / 剩余未读；没有可展示内容时省略。 */
  contextMessage?: string;
}

export function buildNotificationContent(
  latest: AppNotification | null,
  total: number,
): NotificationContent {
  const unread = total > 1 ? `还有 ${total - 1} 条未读` : null;
  if (!latest) {
    return { title: DEFAULT_TITLE, message: `你有 ${Math.max(total, 1)} 条新消息` };
  }

  const view = describeNotification(latest);
  const actor = view.actorName ? `${view.actorName} ` : '';
  const title = `${actor}${view.action}`.trim() || view.typeLabel;

  // 正文优先用评论 / 回复原文和系统详情；都没有才退回帖子标题。
  const message = view.excerpt ?? view.detail ?? view.targetTitle ?? '查看消息';
  // 已经作为正文展示的字段不重复；帖子标题 > 附加信息 > 剩余未读。
  const context = [view.targetTitle, view.detail, unread]
    .filter((part): part is string => Boolean(part) && part !== message)
    .join(' · ');

  return context ? { title, message, contextMessage: context } : { title, message };
}

/**
 * 把第三行的补充信息并进正文。
 *
 * Firefox 的 `browser.notifications` 只支持 `type` / `title` / `message` / `iconUrl`，
 * `contextMessage` 会被静默丢弃；只传三行会让帖子标题、失败原因、剩余未读数在
 * Firefox 上直接看不到，所以这种环境下换成「正文 + 换行 + 补充信息」。
 * 标准 Web Notification 也只有单独的 body，同样走这里拼。
 */
export function inlineNotificationContext(content: NotificationContent): NotificationContent {
  if (!content.contextMessage) return content;
  return {
    title: content.title,
    message: `${content.message}\n${content.contextMessage}`,
  };
}

/**
 * 是否该为拉到的这条最新未读弹系统通知。
 *
 * - `fetched === false`：正文没拉到（网络 / 接口失败），仍弹一条「N 条新消息」，
 *   不要因为一次请求失败就静默；
 * - 拉到了但列表为空：消息一进来就被读掉了，此时再弹「你有 N 条新消息」只是噪音；
 * - 服务端没按 `unread_only` 过滤时，兜底跳过已读消息；
 * - 同一条消息只弹一次：一次新消息可能触发多条 `notification_update`，
 *   每次都挑到同一条未读时不该重复弹——用户点开第一条后它已经是已读状态，
 *   再弹一次就成了「重复通知一条已读通知」。
 */
export function shouldNotifyLatest(
  latest: AppNotification | null,
  notifiedId: string | null,
  fetched: boolean,
): boolean {
  if (!fetched) return true;
  if (!latest) return false;
  if (latest.is_read) return false;
  return latest.id !== notifiedId;
}
