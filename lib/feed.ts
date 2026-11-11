/** 排行榜 / 列表接口的读取与归一化。 */
import { apiGet } from './api';
import { BOARD_MAP } from './boards';
import { loadLatestComments } from './comments';
import { sectionQuery, sectionResolved } from './section';
import type { BoardId, LatestComment, Section, Topic, TopicPage, ApiNode } from './types';

/** 一张卡片 / 一个 Tab 里的一行：普通帖子，或「最新评论」里的一条评论。 */
export type FeedItem =
  | { key: string; kind: 'topic'; topic: Topic }
  | { key: string; kind: 'comment'; comment: LatestComment };

export interface FeedPage {
  items: FeedItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface LoadFeedOptions {
  /** 内置榜单；为空时按 `section` 直接查 `/v1/topics`（节点视图）。 */
  board?: BoardId;
  section: Section;
  nodes: ApiNode[];
  page: number;
  /** `/v1/topics` 必填；hot / latest 走接口默认值，最新评论用它作为条数上限。 */
  pageSize: number;
  signal?: AbortSignal;
}

export async function loadFeed(options: LoadFeedOptions): Promise<FeedPage> {
  const { board, section, nodes, page, pageSize, signal } = options;

  if (section.kind !== 'all' && !sectionResolved(section, nodes)) {
    // 节点数据还没到，先给空页，避免把全站内容误当成分区内容。
    return { items: [], total: 0, page, totalPages: 0 };
  }

  // 最新评论是独立的时间线（列表字段是 items，不是 posts）；没有分区筛选。
  // 该端点实际上只取「最近的 N 条」，page 会被忽略，所以没有下一页。
  if (board === 'comments') {
    const data = await loadLatestComments({ limit: pageSize, signal });
    const comments = data.items ?? [];
    return {
      items: comments.map((comment) => ({
        key: `comment:${comment.id}`,
        kind: 'comment',
        comment,
      })),
      total: data.total ?? comments.length,
      page: data.page ?? 1,
      totalPages: 1,
    };
  }

  const filter = sectionQuery(section, nodes);
  const isFiltered = section.kind !== 'all';
  let data: TopicPage;

  if (!board) {
    // 节点视图：和站点节点页一致，按发布时间排序；父节点走 parent_slug，
    // 子节点走 node_id，两者都由 sectionQuery 负责。
    data = await apiGet<TopicPage>('/v1/topics', {
      auth: true,
      query: { page, limit: pageSize, ...filter },
      signal,
    });
  } else if (board === 'home') {
    // 首页 = 站点首页 feed：全站（parent_slug=All）按价值排序。
    // `page` / `limit` 必填，limit 取榜单配置的 50 条。
    data = await apiGet<TopicPage>('/v1/topics', {
      auth: true,
      query: {
        page,
        limit: pageSize,
        ...(section.kind === 'all' ? { parent_slug: 'All' } : filter),
        sort: 'value',
      },
      signal,
    });
  } else if (board === 'hot24h' || board === 'hot7d') {
    // hot 的 page 默认 1、limit 默认 50、period 默认 24h：
    // 只有翻页和 7d 这类非默认值才显式传。
    data = await apiGet<TopicPage>('/v1/topics/hot', {
      auth: true,
      query: {
        ...(page > 1 ? { page } : {}),
        ...(board === 'hot7d' ? { period: '7d' } : {}),
      },
      signal,
    });
  } else if (board === 'latest' && !isFiltered) {
    // 新发表 = 站点最新帖子流：page 默认 1、limit 默认 50，只有第 2 页起才带 page。
    data = await apiGet<TopicPage>('/v1/topics/latest', {
      auth: true,
      query: { ...(page > 1 ? { page } : {}) },
      signal,
    });
  } else {
    const { dimension, nodeId } = BOARD_MAP[board];
    data = await apiGet<TopicPage>('/v1/topics', {
      auth: true,
      query: {
        // 这个端点 page / limit 必填；sort 默认 latest，不再显式传。
        page,
        limit: pageSize,
        ...(dimension ? { dimensions: dimension } : {}),
        ...(nodeId ? { node_id: nodeId } : {}),
        ...filter,
      },
      signal,
    });
  }

  const posts = data.posts ?? [];
  return {
    items: posts.map((topic) => ({
      key: `topic:${topic.short_id}`,
      kind: 'topic',
      topic,
    })),
    total: data.total ?? posts.length,
    page: data.page ?? page,
    totalPages: data.total_pages ?? 0,
  };
}

/** 翻页可能重复（接口不承诺不重不漏），按 key 去重。 */
export function mergeItems(current: FeedItem[], incoming: FeedItem[]): FeedItem[] {
  const seen = new Set(current.map((item) => item.key));
  const merged = [...current];
  for (const item of incoming) {
    if (seen.has(item.key)) continue;
    seen.add(item.key);
    merged.push(item);
  }
  return merged;
}

export function topicHref(topic: Topic): string {
  const slug = topic.node?.slug ?? '';
  return `https://2libra.com/post/${encodeURIComponent(slug)}/${encodeURIComponent(topic.short_id)}`;
}
