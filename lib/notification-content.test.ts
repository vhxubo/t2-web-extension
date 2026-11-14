import { describe, expect, test } from 'bun:test';
import { buildNotificationContent } from './notification-content';
import type { AppNotification } from './notification-view';

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: '1',
    type: 'reply',
    payload: {
      postTitle: '关于 T2 的讨论',
      commentText: '写得很清楚',
      alias_name: '张三',
    },
    ...overrides,
  };
}

describe('buildNotificationContent', () => {
  test('没有正文时回落到未读计数', () => {
    const { title, message } = buildNotificationContent(null, 3);
    expect(title).toBe('T2 Web Extension');
    expect(message).toBe('你有 3 条新消息');
  });

  test('总数至少为 1', () => {
    const { message } = buildNotificationContent(null, 0);
    expect(message).toBe('你有 1 条新消息');
  });

  test('回复展示操作者、动作与帖子标题', () => {
    const { title, message } = buildNotificationContent(makeNotification(), 1);
    expect(title).toContain('张三');
    expect(title).toContain('回复');
    expect(message).toBe('关于 T2 的讨论');
  });

  test('没有帖子标题时退回到评论正文', () => {
    const item = makeNotification({ payload: { commentText: '这段很关键' } });
    const { message } = buildNotificationContent(item, 1);
    expect(message).toBe('这段很关键');
  });
});
