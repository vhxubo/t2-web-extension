import { describe, expect, test } from 'bun:test';
import { BUILTIN_ME_VIEWS, ME_VIEW_MAP, normalizeMePage, type MeViewMeta } from './me';

const follows = ME_VIEW_MAP['builtin:me_follows'];
const favorites = ME_VIEW_MAP['builtin:me_favorites'];
const bookmarks = ME_VIEW_MAP['builtin:me_bookmarks'];
const collections = ME_VIEW_MAP['builtin:me_collections'];

describe('BUILTIN_ME_VIEWS', () => {
  test('5 个内置视图的 id 与 endpoint 固定', () => {
    expect(BUILTIN_ME_VIEWS.map((view) => [view.id, view.endpoint])).toEqual([
      ['builtin:me_follows', 'me/follows/timeline'],
      ['builtin:me_favorites', 'me/favorites'],
      ['builtin:me_bookmarks', 'me/bookmarks'],
      ['builtin:me_topics', 'me/topics'],
      ['builtin:me_collections', 'me/collections'],
    ]);
  });

  test('不分页的视图标注 paginated=false', () => {
    expect(ME_VIEW_MAP['builtin:me_topics'].paginated).toBe(false);
    expect(ME_VIEW_MAP['builtin:me_collections'].paginated).toBe(false);
    expect(ME_VIEW_MAP['builtin:me_favorites'].paginated).toBe(true);
  });
});

describe('normalizeMePage', () => {
  test('收藏读 posts 字段', () => {
    const page = normalizeMePage(favorites, {
      posts: [
        {
          short_id: 'a1',
          title: '收藏的帖子',
          author: { username: 'jimmy' },
          node: { slug: 'work', name: '职场' },
        },
      ],
      total: 12,
      page: 1,
      limit: 50,
      total_pages: 1,
    });
    expect(page.items).toEqual([
      {
        key: 'topic:a1',
        kind: 'topic',
        topic: expect.objectContaining({
          short_id: 'a1',
          title: '收藏的帖子',
          author: expect.objectContaining({ username: 'jimmy' }),
          node: expect.objectContaining({ slug: 'work' }),
        }),
      },
    ]);
    expect(page.total).toBe(12);
    expect(page.totalPages).toBe(1);
  });

  test('书签读 items，并兼容 { comment, post } 包装', () => {
    const page = normalizeMePage(bookmarks, {
      items: [
        {
          id: 'c1',
          content: '平铺的评论',
          author: { username: 'alice' },
          post: { short_id: 'p1', title: '帖子', node: { slug: 'life' } },
        },
        {
          comment: { id: 'c2', content: '包装的评论' },
          post: { short_id: 'p2', title: '另一个帖子' },
        },
        { id: 'c3', post: { short_id: 'p3' }, parent: { author: { username: 'bob' } } },
      ],
      total: 3,
    });

    expect(page.items.map((item) => item.key)).toEqual(['comment:c1', 'comment:c2', 'comment:c3']);
    const [first, , third] = page.items;
    expect(first?.kind === 'comment' && first.comment.content).toBe('平铺的评论');
    // 没有 reply_to_username 时，从父评论作者补。
    expect(third?.kind === 'comment' && third.comment.reply_to_username).toBe('bob');
  });

  test('书签缺 post 摘要也保留条目', () => {
    const page = normalizeMePage(bookmarks, { items: [{ id: 'c9', content: '孤立的书签' }] });
    expect(page.items).toHaveLength(1);
  });

  test('我的合集：数组响应 + 不分页', () => {
    const page = normalizeMePage(collections, [
      { id: 'k1', name: '前端', description: 'Web 笔记', post_count: 7 },
      { name: '无 id 的合集' },
      { description: '没有名字的会被丢掉' },
    ]);
    expect(page.items.map((item) => item.key)).toEqual(['collection:k1', 'collection:无 id 的合集']);
    expect(page.total).toBe(2);
    expect(page.totalPages).toBe(1);
  });

  test('关注流混排帖子与评论', () => {
    const page = normalizeMePage(follows, {
      items: [
        { short_id: 't1', title: '一条帖子', node: { slug: 'work' } },
        { id: 'c1', content: '一条评论', post: { short_id: 't2' } },
      ],
    });
    expect(page.items.map((item) => item.kind)).toEqual(['topic', 'comment']);
  });

  test('认不出的条目跳过，不抛错', () => {
    const page = normalizeMePage(favorites, { posts: [{ title: '没有 short_id' }, null, 42] });
    expect(page.items).toEqual([]);
  });

  test('缺少分页字段时兜底 1 页', () => {
    const meta: MeViewMeta = favorites;
    const page = normalizeMePage(meta, { posts: [{ short_id: 'a' }] }, 2);
    expect(page.page).toBe(2);
    expect(page.totalPages).toBe(1);
  });
});
