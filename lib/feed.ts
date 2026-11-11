/** 排行榜 / 列表接口的读取与归一化。 */
import { apiGet } from './api';
import { BOARD_MAP } from './boards';
import { sectionQuery, sectionResolved } from './section';
import type { BoardId, Section, Topic, TopicPage, ApiNode } from './types';

export interface FeedItem {
  key: string;
  topic: Topic;
}

export interface FeedPage {
  items: FeedItem[];
  total: number;
  page: number;
  totalPages: number;
}

export interface LoadFeedOptions {
  board: BoardId;
  section: Section;
  nodes: ApiNode[];
  page: number;
  /** 仅 `/v1/topics` 使用；hot / latest 端点不传 limit，走接口默认值。 */
  pageSize: number;
  signal?: AbortSignal;
}

export async function loadFeed(options: LoadFeedOptions): Promise<FeedPage> {
  const { board, section, nodes, page, pageSize, signal } = options;

  if (section.kind !== 'all' && !sectionResolved(section, nodes)) {
    // 节点数据还没到，先给空页，避免把全站内容误当成分区内容。
    return { items: [], total: 0, page, totalPages: 0 };
  }

  const filter = sectionQuery(section, nodes);
  const isFiltered = section.kind !== 'all';
  let data: TopicPage;

  if (board === 'home') {
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
