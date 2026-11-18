import { describe, expect, test } from 'bun:test';
import {
  COMMENT_RUN_DEFAULT_LENGTH,
  COMMENT_RUN_MAX_LENGTH,
  COMMENT_RUN_MIN_LENGTH,
  commentAuthorKey,
  commentAuthorKeyFromHref,
  commentIdFromHref,
  findConsecutiveGroups,
  groupConsecutiveComments,
  normalizeCommentRunThreshold,
} from './comment-runs';
import type { FeedItem, LatestComment } from './types';

function comment(
  id: string,
  author: { id?: string; username?: string } | null,
  post = 'p1',
): FeedItem {
  const value: LatestComment = {
    id,
    author: author ? { id: author.id, username: author.username } : null,
    post: { short_id: post },
  };
  return { key: `comment:${id}`, kind: 'comment', comment: value };
}

function topic(shortId: string): FeedItem {
  return {
    key: `topic:${shortId}`,
    kind: 'topic',
    topic: { short_id: shortId, node: { slug: 'node' } },
  };
}

describe('commentAuthorKey', () => {
  test('prefers the user id and falls back to a lower-cased username', () => {
    expect(commentAuthorKey({ id: 'c', post: { short_id: 'p' }, author: { id: 'u1' } })).toBe(
      'id:u1',
    );
    expect(
      commentAuthorKey({ id: 'c', post: { short_id: 'p' }, author: { username: ' Alice ' } }),
    ).toBe('name:alice');
    expect(commentAuthorKey({ id: 'c', post: { short_id: 'p' }, author: null })).toBeNull();
    expect(commentAuthorKey({ id: 'c', post: { short_id: 'p' } })).toBeNull();
  });
});

describe('commentAuthorKeyFromHref', () => {
  test('parses the username segment from a site profile link', () => {
    expect(commentAuthorKeyFromHref('/user/Alice/about')).toBe('name:alice');
    expect(commentAuthorKeyFromHref('/user/%E5%BC%A0%E4%B8%89/about')).toBe('name:张三');
    expect(commentAuthorKeyFromHref('/user/bob')).toBe('name:bob');
  });

  test('returns null for missing or unrelated links', () => {
    expect(commentAuthorKeyFromHref(null)).toBeNull();
    expect(commentAuthorKeyFromHref(undefined)).toBeNull();
    expect(commentAuthorKeyFromHref('/post/technology/abc')).toBeNull();
    expect(commentAuthorKeyFromHref('/user/')).toBeNull();
  });
});

describe('commentIdFromHref', () => {
  test('extracts commentId from post links', () => {
    expect(
      commentIdFromHref('/post/games/aBBNiRP?commentId=47f95483-6d23-41a8-a15b-e99bf015f761'),
    ).toBe('47f95483-6d23-41a8-a15b-e99bf015f761');
    expect(commentIdFromHref('/post/x/y?p=2&commentId=abc&x=1')).toBe('abc');
  });

  test('returns null when the link has no commentId', () => {
    expect(commentIdFromHref('/post/x/y')).toBeNull();
    expect(commentIdFromHref(null)).toBeNull();
  });
});

describe('normalizeCommentRunThreshold', () => {
  test('keeps valid integers and rounds decimals', () => {
    expect(normalizeCommentRunThreshold(3)).toBe(3);
    expect(normalizeCommentRunThreshold(2)).toBe(2);
    expect(normalizeCommentRunThreshold(10)).toBe(10);
    expect(normalizeCommentRunThreshold(4.6)).toBe(5);
  });

  test('clamps out-of-range values into 2–10', () => {
    expect(normalizeCommentRunThreshold(0)).toBe(2);
    expect(normalizeCommentRunThreshold(-5)).toBe(2);
    expect(normalizeCommentRunThreshold(99)).toBe(10);
  });

  test('falls back to the default three for missing or invalid values', () => {
    expect(normalizeCommentRunThreshold(undefined)).toBe(3);
    expect(normalizeCommentRunThreshold(null)).toBe(3);
    expect(normalizeCommentRunThreshold('5')).toBe(3);
    expect(normalizeCommentRunThreshold(Number.NaN)).toBe(3);
    expect(normalizeCommentRunThreshold(Number.POSITIVE_INFINITY)).toBe(3);
  });
});

describe('findConsecutiveGroups', () => {
  test('returns index ranges for runs of at least three equal keys', () => {
    expect(findConsecutiveGroups(['a', 'a', 'a', 'b'])).toEqual([{ start: 0, length: 3 }]);
    expect(findConsecutiveGroups(['a', 'b', 'c', 'c', 'c', 'd'])).toEqual([
      { start: 2, length: 3 },
    ]);
  });

  test('ignores short runs and null keys, which also break runs', () => {
    expect(findConsecutiveGroups(['a', 'a'])).toEqual([]);
    expect(findConsecutiveGroups(['a', null, 'a', 'a', 'a'])).toEqual([
      { start: 2, length: 3 },
    ]);
    expect(findConsecutiveGroups([null, null, null, null])).toEqual([]);
  });

  test('supports a custom threshold', () => {
    expect(findConsecutiveGroups(['a', 'a'], 2)).toEqual([{ start: 0, length: 2 }]);
    expect(findConsecutiveGroups(['a', 'a', 'a'], 4)).toEqual([]);
  });
});

describe('groupConsecutiveComments', () => {
  test('folds a run of three or more consecutive comments by the same author', () => {
    const blocks = groupConsecutiveComments([
      comment('a1', { username: 'alice' }),
      comment('a2', { username: 'alice' }),
      comment('a3', { username: 'alice' }),
      comment('b1', { username: 'bob' }),
    ]);

    expect(blocks).toHaveLength(2);
    const [first, second] = blocks;
    expect(first.kind).toBe('run');
    if (first.kind !== 'run') throw new Error('expected a run');
    expect(first.author).toBe('alice');
    expect(first.key).toBe('comment:a1');
    expect(first.items.map((item) => item.key)).toEqual([
      'comment:a1',
      'comment:a2',
      'comment:a3',
    ]);
    expect(second).toEqual({ kind: 'item', item: expect.objectContaining({ key: 'comment:b1' }) });
  });

  test('leaves two consecutive comments by the same author untouched', () => {
    const blocks = groupConsecutiveComments([
      comment('a1', { username: 'alice' }),
      comment('a2', { username: 'alice' }),
    ]);

    expect(blocks).toEqual([
      { kind: 'item', item: expect.objectContaining({ key: 'comment:a1' }) },
      { kind: 'item', item: expect.objectContaining({ key: 'comment:a2' }) },
    ]);
  });

  test('only folds adjacent comments, not every comment by the same author', () => {
    const blocks = groupConsecutiveComments([
      comment('a1', { username: 'alice' }),
      comment('b1', { username: 'bob' }),
      comment('a2', { username: 'alice' }),
      comment('a3', { username: 'alice' }),
      comment('a4', { username: 'alice' }),
    ]);

    expect(blocks.map((block) => block.kind)).toEqual(['item', 'item', 'run']);
    const run = blocks[2];
    if (run.kind !== 'run') throw new Error('expected a run');
    expect(run.items.map((item) => item.key)).toEqual([
      'comment:a2',
      'comment:a3',
      'comment:a4',
    ]);
  });

  test('folds comments across different posts in the global timeline', () => {
    const blocks = groupConsecutiveComments([
      comment('a1', { username: 'alice' }, 'p1'),
      comment('a2', { username: 'alice' }, 'p2'),
      comment('a3', { username: 'alice' }, 'p3'),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('run');
  });

  test('identifies authors by id when usernames change case or differ', () => {
    const blocks = groupConsecutiveComments([
      comment('a1', { id: 'u1', username: 'Alice' }),
      comment('a2', { id: 'u1', username: 'alice' }),
      comment('a3', { id: 'u1', username: 'ALICE' }),
    ]);

    expect(blocks).toHaveLength(1);
    expect(blocks[0].kind).toBe('run');
  });

  test('breaks runs on non-comment items', () => {
    const blocks = groupConsecutiveComments([
      comment('a1', { username: 'alice' }),
      comment('a2', { username: 'alice' }),
      topic('t1'),
      comment('a3', { username: 'alice' }),
    ]);

    expect(blocks.map((block) => block.kind)).toEqual(['item', 'item', 'item', 'item']);
  });

  test('does not merge anonymous comments into one run', () => {
    const blocks = groupConsecutiveComments([
      comment('x1', null),
      comment('x2', null),
      comment('x3', null),
    ]);

    expect(blocks.map((block) => block.kind)).toEqual(['item', 'item', 'item']);
  });

  test('supports a custom threshold', () => {
    const items = [
      comment('a1', { username: 'alice' }),
      comment('a2', { username: 'alice' }),
    ];

    expect(groupConsecutiveComments(items, 2)).toHaveLength(1);
    expect(groupConsecutiveComments(items, 4)).toHaveLength(2);
  });

  test('the default threshold is three, configurable from 2 to 10', () => {
    expect(COMMENT_RUN_DEFAULT_LENGTH).toBe(3);
    expect(COMMENT_RUN_MIN_LENGTH).toBe(2);
    expect(COMMENT_RUN_MAX_LENGTH).toBe(10);
  });
});
