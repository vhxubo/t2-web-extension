import { describe, expect, test } from 'bun:test';
import {
  buildNotificationContent,
  inlineNotificationContext,
  shouldNotifyLatest,
} from './notification-content';
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

  test('回复正文优先展示评论内容，帖子标题放补充信息', () => {
    const { title, message, contextMessage } = buildNotificationContent(
      makeNotification(),
      1,
    );
    expect(title).toContain('张三');
    expect(title).toContain('回复');
    expect(message).toBe('写得很清楚');
    expect(contextMessage).toBe('关于 T2 的讨论');
  });

  test('没有评论正文时退回到帖子标题', () => {
    const item = makeNotification({ payload: { postTitle: '关于 T2 的讨论' } });
    const { message, contextMessage } = buildNotificationContent(item, 1);
    expect(message).toBe('关于 T2 的讨论');
    expect(contextMessage).toBeUndefined();
  });

  test('系统消息即使带文章标题也展示失败原因', () => {
    const item = makeNotification({
      type: 'system',
      payload: {
        error: 'RSS 抓取失败',
        articleTitle: '同步的文章',
      },
    });
    const { title, message, contextMessage } = buildNotificationContent(item, 1);
    expect(title).toBe('发来一条系统消息');
    expect(message).toBe('RSS 抓取失败');
    expect(contextMessage).toBe('同步的文章');
  });

  test('多条未读在补充信息里提示剩余数量', () => {
    const { message, contextMessage } = buildNotificationContent(
      makeNotification(),
      3,
    );
    expect(message).toBe('写得很清楚');
    expect(contextMessage).toBe('关于 T2 的讨论 · 还有 2 条未读');
  });

  test('正文与附加信息重复时不重复展示', () => {
    const item = makeNotification({
      type: 'level_up',
      payload: { message: '升到了 5 级' },
    });
    const { message, contextMessage } = buildNotificationContent(item, 1);
    expect(message).toBe('升到了 5 级');
    expect(contextMessage).toBeUndefined();
  });
});

describe('inlineNotificationContext', () => {
  test('把补充信息换行接进正文，Firefox 丢 contextMessage 时详情不丢', () => {
    const content = buildNotificationContent(makeNotification(), 3);
    const merged = inlineNotificationContext(content);
    expect(merged.title).toBe(content.title);
    expect(merged.message).toBe('写得很清楚\n关于 T2 的讨论 · 还有 2 条未读');
    expect(merged.contextMessage).toBeUndefined();
  });

  test('没有补充信息时原样返回', () => {
    const content = buildNotificationContent(null, 1);
    expect(inlineNotificationContext(content)).toEqual(content);
  });
});

describe('shouldNotifyLatest', () => {
  test('正文没拉到（请求失败）时仍然提醒', () => {
    expect(shouldNotifyLatest(null, null, false)).toBe(true);
  });

  test('拉到了但没有未读：不再弹空通知', () => {
    expect(shouldNotifyLatest(null, null, true)).toBe(false);
  });

  test('最新一条已经是已读：跳过', () => {
    const item = makeNotification({ is_read: true });
    expect(shouldNotifyLatest(item, null, true)).toBe(false);
  });

  test('同一条消息刚弹过：跳过', () => {
    const item = makeNotification();
    expect(shouldNotifyLatest(item, item.id, true)).toBe(false);
  });

  test('换了另一条未读消息：继续提醒', () => {
    const item = makeNotification();
    expect(shouldNotifyLatest(item, 'another-id', true)).toBe(true);
  });
});
