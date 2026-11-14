/**
 * 把一条消息归一成原生通知的标题 / 正文。
 *
 * 刻意不依赖扩展运行时（浏览器 API / storage），方便用 bun test 直接验证；
 * 系统通知的创建与点击跳转留在 lib/native-notifications.ts。
 */
import { describeNotification, type AppNotification } from './notification-view';

const DEFAULT_TITLE = 'T2 Web Extension';

export function buildNotificationContent(
  latest: AppNotification | null,
  total: number,
): { title: string; message: string } {
  if (!latest) {
    return { title: DEFAULT_TITLE, message: `你有 ${Math.max(total, 1)} 条新消息` };
  }
  const view = describeNotification(latest);
  const actor = view.actorName ? `${view.actorName} ` : '';
  const title = `${actor}${view.action}`.trim() || view.typeLabel;
  const message = view.targetTitle || view.excerpt || view.detail || '查看消息';
  return { title, message };
}
