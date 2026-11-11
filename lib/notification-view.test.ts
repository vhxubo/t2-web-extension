import { describe, expect, test } from 'bun:test';
import {
  describeNotification,
  notificationHref,
  type AppNotification,
} from './notification-view';

const APP = 'https://2libra.com';

function notification(
  type: string,
  payload: Record<string, unknown>,
  extra: Partial<AppNotification> = {},
): AppNotification {
  return {
    id: `${type}-1`,
    type,
    payload,
    created_at: '2026-11-01T10:00:00.000Z',
    ...extra,
  };
}

describe('describeNotification', () => {
  test('reply shows alias, concrete action, post title and comment text', () => {
    const view = describeNotification(
      notification(
        'reply',
        {
          postTitle: '如何给扩展做通知中心',
          postNodeSlug: 'dev',
          postShortId: 'a1b2c3',
          postSlug: 'how-to',
          commentId: 'comment-1',
          commentLevel: 1,
          commentText: '这个思路不错 :doge:',
          alias_name: '匿名的小号',
          alias_avatar_url: 'https://r2.2libra.com/avatars/alias.png',
        },
        {
          from_user: { username: 'jimmy', avatar_url: 'https://r2.2libra.com/avatars/jimmy.png' },
        },
      ),
    );

    expect(view.actorName).toBe('匿名的小号');
    expect(view.actorAvatar).toBe('https://r2.2libra.com/avatars/alias.png');
    expect(view.actorIsAlias).toBe(true);
    expect(view.action).toBe('回复了你的评论');
    expect(view.targetTitle).toBe('如何给扩展做通知中心');
    expect(view.excerpt).toBe('这个思路不错 :doge:');
    expect(view.targetHref).toBe(`${APP}/post/dev/a1b2c3?commentId=comment-1`);
  });

  test('reply distinguishes post replies and postscript replies', () => {
    const post = describeNotification(
      notification('reply', {
        postTitle: '帖子',
        postShortId: 'abc',
        commentLevel: 0,
      }),
    );
    expect(post.action).toBe('回复了你的帖子');

    const postscript = describeNotification(
      notification('reply', { postTitle: '帖子', postShortId: 'abc', target: 'postscript' }),
    );
    expect(postscript.action).toBe('回复了你的附言');
  });

  test('reaction exposes emoji counts and comment excerpt', () => {
    const view = describeNotification(
      notification(
        'reaction',
        {
          reactionType: 'comment',
          commentText: '被表态的评论',
          postTitle: '原帖标题',
          postShortId: 'r1',
          postNodeSlug: 'life',
          path: '/post/life/r1?commentId=c9',
          reactions: { '👍': 2, '❤️': 1 },
          relations: [{ emoji: '👍', username: 'a' }],
        },
        { from_user: { username: 'last-reactor' } },
      ),
    );

    expect(view.actorName).toBeNull();
    expect(view.action).toBe('你的评论收到了新表态');
    expect(view.excerpt).toBe('被表态的评论');
    expect(view.reactions).toEqual([
      { emoji: '👍', count: 2 },
      { emoji: '❤️', count: 1 },
    ]);
    expect(view.targetHref).toBe(`${APP}/post/life/r1?commentId=c9`);
  });

  test('reaction falls back to relations when counts are absent', () => {
    const view = describeNotification(
      notification('reaction', {
        reactionType: 'post',
        relations: [
          { emoji: '🔥', username: 'a' },
          { emoji: '🔥', username: 'b' },
          { emoji: '👀', username: 'c' },
        ],
      }),
    );

    expect(view.reactions).toEqual([
      { emoji: '🔥', count: 2 },
      { emoji: '👀', count: 1 },
    ]);
    expect(view.action).toBe('你的帖子收到了新表态');
  });

  test('reward shows amount, target and comment content', () => {
    const view = describeNotification(
      notification('get_reward', {
        amount: 12,
        rewardType: 'COMMENT',
        commentText: '打赏的评论',
        postTitle: '原帖',
        path: '/post/dev/reward1?commentId=c2',
      }),
    );

    expect(view.action).toBe('打赏了你的评论');
    expect(view.detail).toBe('+12 金币');
    expect(view.detailTone).toBe('success');
    expect(view.coins).toBe(12);
    expect(view.excerpt).toBe('打赏的评论');
    expect(view.targetHref).toBe(`${APP}/post/dev/reward1?commentId=c2`);
  });

  test('content check shows title, result and contentType action', () => {
    const view = describeNotification(
      notification('content_check', {
        contentTitle: '一篇待检定的帖子',
        contentType: 'post',
        postNodeSlug: 'dev',
        postShortId: 'check1',
        message: '内容检定通过',
      }),
    );

    expect(view.action).toBe('你的帖子完成了内容检定');
    expect(view.targetTitle).toBe('一篇待检定的帖子');
    expect(view.detail).toBe('内容检定通过');
    expect(view.detailTone).toBe('warning');
    expect(view.targetHref).toBe(`${APP}/post/dev/check1`);
  });

  test('system keeps error, feed and failure details', () => {
    const view = describeNotification(
      notification('system', {
        error: 'RSS 抓取失败',
        feedUrl: 'https://example.com/feed.xml',
        consecutiveFailures: 3,
        articleTitle: '同步的文章',
        path: '/article/sync-1',
      }),
    );

    expect(view.detail).toBe('RSS 抓取失败');
    expect(view.detailTone).toBe('danger');
    expect(view.meta).toEqual(['RSS：https://example.com/feed.xml', '连续失败 3 次']);
    expect(view.targetTitle).toBe('同步的文章');
    expect(view.targetHref).toBe(`${APP}/article/sync-1`);
  });

  test('follow uses followerUsername and opens the follower profile', () => {
    const view = describeNotification(
      notification('follow', { followerUsername: 'new-friend' }),
    );

    expect(view.actorName).toBe('new-friend');
    expect(view.action).toBe('关注了你');
    expect(view.targetTitle).toBeNull();
    expect(view.targetHref).toBe(`${APP}/user/new-friend/about`);
  });

  test('unknown payload falls back to a readable notification', () => {
    const view = describeNotification(notification('like', { anything: true }));

    expect(view.typeLabel).toBe('点赞');
    expect(view.action).toBe('发来一条新通知');
    expect(view.tone).toBe('muted');
    expect(view.excerpt).toBeNull();
  });
});

describe('notificationHref', () => {
  test('builds post links and appends comment id only once', () => {
    expect(
      notificationHref(
        notification('reply', {
          postShortId: 'abc123',
          postNodeSlug: 'dev',
          commentId: 'c1',
        }),
      ),
    ).toBe(`${APP}/post/dev/abc123?commentId=c1`);

    expect(
      notificationHref(
        notification('reply', {
          path: '/post/dev/abc123?commentId=c1&p=2',
          commentId: 'c1',
        }),
      ),
    ).toBe(`${APP}/post/dev/abc123?commentId=c1&p=2`);
  });

  test('normalizes absolute and relative paths', () => {
    expect(notificationHref(notification('system', { path: '//2libra.com/post/x' }))).toBe(
      `https://2libra.com/post/x`,
    );
    expect(notificationHref(notification('system', { path: 'notifications' }))).toBe(
      `${APP}/notifications`,
    );
  });

  test('uses related_id only for comment reactions', () => {
    expect(
      notificationHref(
        notification('reaction', {
          reactionType: 'comment',
          postShortId: 'abc',
          postNodeSlug: 'dev',
          related_id: 'comment-9',
        }),
      ),
    ).toBe(`${APP}/post/dev/abc?commentId=comment-9`);

    expect(
      notificationHref(
        notification('reaction', {
          reactionType: 'post',
          postShortId: 'abc',
          postNodeSlug: 'dev',
          related_id: 'not-a-comment',
        }),
      ),
    ).toBe(`${APP}/post/dev/abc`);
  });

  test('keeps an unknown notification on the notification page', () => {
    expect(notificationHref(notification('level_up', { message: '升级' }))).toBe(
      `${APP}/notifications`,
    );
  });
});
