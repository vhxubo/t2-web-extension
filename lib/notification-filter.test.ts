import { describe, expect, test } from 'bun:test';
import {
  NOTIFICATION_FILTERS,
  notificationFilterMeta,
  notificationFilterQuery,
} from './notification-filter';

describe('notificationFilterQuery', () => {
  test('all 不传类型、不限制未读', () => {
    expect(notificationFilterQuery('all')).toEqual({ type: undefined, unreadOnly: false });
  });

  test('unread 只传 unread_only', () => {
    expect(notificationFilterQuery('unread')).toEqual({ type: undefined, unreadOnly: true });
  });

  test('类别分段映射到接口的 type', () => {
    expect(notificationFilterQuery('reply')).toEqual({ type: 'reply', unreadOnly: false });
    expect(notificationFilterQuery('mention')).toEqual({ type: 'mention', unreadOnly: false });
    expect(notificationFilterQuery('reaction')).toEqual({ type: 'reaction', unreadOnly: false });
    expect(notificationFilterQuery('reward')).toEqual({ type: 'get_reward', unreadOnly: false });
  });
});

describe('NOTIFICATION_FILTERS', () => {
  test('六个分段的顺序与用户要求一致', () => {
    expect(NOTIFICATION_FILTERS.map((option) => option.id)).toEqual([
      'all',
      'unread',
      'reply',
      'mention',
      'reaction',
      'reward',
    ]);
  });

  test('每个分段都有唯一的 label、空列表文案与接口参数', () => {
    const ids = new Set(NOTIFICATION_FILTERS.map((option) => option.id));
    const labels = new Set(NOTIFICATION_FILTERS.map((option) => option.label));
    expect(ids.size).toBe(NOTIFICATION_FILTERS.length);
    expect(labels.size).toBe(NOTIFICATION_FILTERS.length);
    for (const option of NOTIFICATION_FILTERS) {
      expect(option.emptyTitle.length).toBeGreaterThan(0);
      expect(option.emptyHint.length).toBeGreaterThan(0);
    }
  });

  test('meta 覆盖所有分段并给出空列表提示', () => {
    expect(notificationFilterMeta('unread').emptyTitle).toBe('没有未读消息');
    expect(notificationFilterMeta('reward').emptyTitle).toBe('没有打赏消息');
  });
});
