/**
 * 全站搜索：`GET /v1/search`。
 *
 * 这个端点单独限流（匿名 5 次/分、登录 20 次/分），文档明确要求加 300ms 以上防抖，
 * 也不要把它当作列表翻页的数据源。所以这里只取第一页，缓存与节流逻辑放在
 * `hooks/useSearch.ts`，本文件只负责「参数 → 稳定结果」。
 */
import { apiGet } from './api';
import { APP_ORIGIN } from './config';
import type { Topic } from './types';

export const SEARCH_MIN_LENGTH = 2;
export const SEARCH_MAX_LENGTH = 100;
export const SEARCH_DEBOUNCE_MS = 350;
/** 搜索接口 limit 的默认值，本地按同样条数截断。 */
export const SEARCH_PAGE_SIZE = 20;
export const SEARCH_LIST_LIMIT = 20;

/** 文档给出的搜索限流额度，用来在客户端提前提醒，避免白白撞 429。 */
export const SEARCH_RATE_LIMITS = {
  anonymous: 5,
  signedIn: 20,
} as const;

export type SearchType = 'posts' | 'users' | 'nodes' | 'tags' | 'favorites';

export interface SearchTypeMeta {
  id: SearchType;
  label: string;
  hint: string;
  /** 只有登录后才展示 / 请求（收藏搜索需要令牌）。 */
  requiresAuth?: boolean;
}

export const SEARCH_TYPES: SearchTypeMeta[] = [
  { id: 'posts', label: '帖子', hint: '搜索帖子标题' },
  { id: 'users', label: '用户', hint: '搜索用户昵称' },
  { id: 'nodes', label: '节点', hint: '搜索板块名称' },
  { id: 'tags', label: '标签', hint: '搜索标签' },
  { id: 'favorites', label: '收藏', hint: '搜索我收藏的帖子', requiresAuth: true },
];

export function searchTypesFor(signedIn: boolean): SearchTypeMeta[] {
  return SEARCH_TYPES.filter((type) => !type.requiresAuth || signedIn);
}

export function isSearchType(value: string): value is SearchType {
  return SEARCH_TYPES.some((type) => type.id === value);
}

/* ------------------------------------------------------------------
   结果形状
   注意：不同 type 的响应结构并不统一 —— 帖子是分页对象（字段 `posts`），
   其余类型直接是数组。接口承诺「只增字段」，所以解析时都做宽松兜底。
------------------------------------------------------------------ */

export interface SearchUser {
  id?: string;
  username?: string;
  display_name?: string;
  avatar_url?: string | null;
  is_pro?: boolean;
  level?: number;
}

export interface SearchNode {
  id?: string;
  name?: string;
  slug?: string;
  parent_slug?: string | null;
  post_count?: number;
}

export interface SearchTag {
  id?: string;
  name?: string;
  post_count?: number;
}

/**
 * 收藏结果字段来自站点搜索的既有实现：
 * `{ postUrl, postTitle, user, postCreatedAt }`。
 * 同时保留 snake_case / Topic 兜底，服务端加字段或换命名时不至于整块空白。
 */
export interface SearchFavorite {
  postUrl?: string;
  post_url?: string;
  url?: string;
  postTitle?: string;
  post_title?: string;
  title?: string;
  postCreatedAt?: string;
  post_created_at?: string;
  created_at?: string;
  user?: SearchUser | null;
  from_user?: SearchUser | null;
  /** 如果返回的是 Topic 结构，用这两个字段拼原帖地址。 */
  short_id?: string;
  node?: { slug?: string; name?: string } | null;
}

interface SearchPostPage {
  posts?: Topic[];
  total?: number;
}

export type SearchResults =
  | { type: 'posts'; query: string; posts: Topic[]; total: number }
  | { type: 'users'; query: string; users: SearchUser[] }
  | { type: 'nodes'; query: string; nodes: SearchNode[] }
  | { type: 'tags'; query: string; tags: SearchTag[] }
  | { type: 'favorites'; query: string; favorites: SearchFavorite[] };

export function searchKey(type: SearchType, query: string): string {
  return `${type}:${query.trim().toLowerCase()}`;
}

function asArray<T>(data: unknown, keys: string[]): T[] {
  if (Array.isArray(data)) return data as T[];
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    for (const key of keys) {
      const value = record[key];
      if (Array.isArray(value)) return value as T[];
    }
  }
  return [];
}

/** 拉取一页搜索结果；调用方负责防抖、缓存与中止。 */
export async function runSearch(
  type: SearchType,
  query: string,
  signal?: AbortSignal,
): Promise<SearchResults> {
  const q = query.trim();
  const data = await apiGet<unknown>('/v1/search', {
    // page 默认 1、limit 默认 20；搜索只取第一页，两个都用默认值。
    query: { q, type },
    signal,
  });

  switch (type) {
    case 'posts': {
      const page = (data ?? {}) as SearchPostPage;
      const posts = Array.isArray(page.posts) ? page.posts : [];
      return {
        type,
        query: q,
        posts: posts.slice(0, SEARCH_PAGE_SIZE),
        total: typeof page.total === 'number' ? page.total : posts.length,
      };
    }
    case 'users':
      return {
        type,
        query: q,
        users: asArray<SearchUser>(data, ['users', 'items', 'list']).slice(0, SEARCH_LIST_LIMIT),
      };
    case 'nodes':
      return {
        type,
        query: q,
        nodes: asArray<SearchNode>(data, ['nodes', 'items', 'list']).slice(0, SEARCH_LIST_LIMIT),
      };
    case 'tags':
      return {
        type,
        query: q,
        tags: asArray<SearchTag>(data, ['tags', 'items', 'list']).slice(0, SEARCH_LIST_LIMIT),
      };
    case 'favorites':
      return {
        type,
        query: q,
        favorites: asArray<SearchFavorite>(data, ['favorites', 'posts', 'items', 'list']).slice(
          0,
          SEARCH_LIST_LIMIT,
        ),
      };
  }
}

/* ------------------------------------------------------------------
   站点链接
------------------------------------------------------------------ */

function absoluteUrl(raw?: string | null): string | null {
  if (!raw) return null;
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${APP_ORIGIN}${value}`;
  // 漏了协议但带域名的地址，例如 `2libra.com/post/...`。
  if (/^[\w.-]+\.[a-z]{2,}\//i.test(value)) return `https://${value}`;
  return `${APP_ORIGIN}/${value.replace(/^\.?\//, '')}`;
}

/** 节点地址：父节点 `/node/<slug>`，子节点 `/node/<parent>/<slug>`。 */
export function nodeHref(node: Pick<SearchNode, 'slug' | 'parent_slug'>): string {
  if (!node.slug) return APP_ORIGIN;
  const parent = node.parent_slug?.trim();
  return parent
    ? `${APP_ORIGIN}/node/${encodeURIComponent(parent)}/${encodeURIComponent(node.slug)}`
    : `${APP_ORIGIN}/node/${encodeURIComponent(node.slug)}`;
}

/** 标签地址：`/tag/<name>`。 */
export function tagHref(name?: string | null): string {
  return name ? `${APP_ORIGIN}/tag/${encodeURIComponent(name)}` : APP_ORIGIN;
}

/** 收藏结果的帖子地址；兼容完整 URL、站内路径与 Topic 结构。 */
export function favoriteHref(favorite: SearchFavorite): string | null {
  const direct = absoluteUrl(
    favorite.postUrl ?? favorite.post_url ?? favorite.url ?? null,
  );
  if (direct) return direct;

  const slug = favorite.node?.slug;
  if (slug && favorite.short_id) {
    return `${APP_ORIGIN}/post/${encodeURIComponent(slug)}/${encodeURIComponent(favorite.short_id)}`;
  }
  return null;
}

export function favoriteTitle(favorite: SearchFavorite): string {
  return favorite.postTitle ?? favorite.post_title ?? favorite.title ?? '（无标题）';
}

export function favoriteCreatedAt(favorite: SearchFavorite): string | undefined {
  return favorite.postCreatedAt ?? favorite.post_created_at ?? favorite.created_at;
}
