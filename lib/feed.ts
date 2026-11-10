/** 排行榜 / 列表接口的读取与归一化。 */
import { apiGet } from './api';
import { BOARD_MAP } from './boards';
import { sectionQuery, sectionResolved } from './section';
import type { BoardId, Section, Topic, TopicPage, ApiNode } from './types';

export interface FeedItem {
  key: string;
  topic: Topic;
}

/** 列表固定每页 20 条；设置里不再提供条数选项。 */
export const FEED_PAGE_SIZE = 20;

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

  if (board === 'hot24h' || board === 'hot7d') {
    data = await apiGet<TopicPage>('/v1/topics/hot', {
      auth: true,
      query: { page, limit: pageSize, period: board === 'hot24h' ? '24h' : '7d' },
      signal,
    });
  } else if (board === 'latest' && !isFiltered) {
    data = await apiGet<TopicPage>('/v1/topics/latest', {
      auth: true,
      query: { page, limit: pageSize },
      signal,
    });
  } else {
    const dimension = BOARD_MAP[board].dimension;
    data = await apiGet<TopicPage>('/v1/topics', {
      auth: true,
      query: {
        page,
        limit: pageSize,
        sort: 'latest',
        ...(dimension ? { dimensions: dimension } : {}),
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
