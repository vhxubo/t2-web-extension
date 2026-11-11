/**
 * 「我的」内置视图。
 *
 * 这 5 个视图不写进用户的节点配置，而是作为系统视图直接注册到视图路由里：
 * - 弹窗登录后的一级 Tab「我的」固定展示它们；
 * - id 与普通视图共用 `ViewPreference` 的 `builtin:me_*` 命名空间，
 *   `parseViewId` / `resolveView` 都能识别，方便以后搬到仪表盘或设置页。
 *
 * 接口列表字段名不统一（见开放 API 文档）：收藏是 `posts`，书签 / 关注流是
 * `items`，合集没有分页。这里统一收敛成 `FeedItem`，上层只关心列表内容。
 */
import { APP_ORIGIN } from './config';
import type {
  Author,
  CollectionSummary,
  CommentPostRef,
  FeedItem,
  LatestComment,
  ReactionSummary,
  RewardSummary,
  Topic,
  TopicNodeRef,
} from './types';

export type MeViewId =
  | 'builtin:me_follows'
  | 'builtin:me_favorites'
  | 'builtin:me_bookmarks'
  | 'builtin:me_topics'
  | 'builtin:me_collections';

export type MeViewKind = 'topics' | 'comments' | 'collections' | 'mixed';

export interface MeViewMeta {
  id: MeViewId;
  label: string;
  /** 窄空间里的短标签；不填时用 label。 */
  shortLabel?: string;
  /** 相对 `/v1` 的路径。 */
  endpoint: string;
  icon: string;
  hint: string;
  pageSize: number;
  kind: MeViewKind;
  /** 是否支持 page / limit 分页；`me/topics` 与 `me/collections` 不分页。 */
  paginated: boolean;
  emptyTitle: string;
  emptyDesc: string;
}

export const BUILTIN_ME_VIEWS: MeViewMeta[] = [
  {
    id: 'builtin:me_follows',
    label: '关注流',
    endpoint: 'me/follows/timeline',
    icon: '👥',
    hint: '我关注的用户的最新动态',
    pageSize: 50,
    kind: 'mixed',
    paginated: true,
    emptyTitle: '关注流还是空的',
    emptyDesc: '关注一些用户后，他们发布的帖子会出现在这里。',
  },
  {
    id: 'builtin:me_favorites',
    label: '收藏',
    endpoint: 'me/favorites',
    icon: '⭐',
    hint: '我收藏的帖子',
    pageSize: 50,
    kind: 'topics',
    paginated: true,
    emptyTitle: '还没有收藏',
    emptyDesc: '在帖子里点收藏后，会出现在这里。',
  },
  {
    id: 'builtin:me_bookmarks',
    label: '书签',
    endpoint: 'me/bookmarks',
    icon: '🔖',
    hint: '我收藏的评论',
    pageSize: 50,
    kind: 'comments',
    paginated: true,
    emptyTitle: '还没有书签',
    emptyDesc: '给评论加书签后，会出现在这里。',
  },
  {
    id: 'builtin:me_topics',
    label: '我的帖子',
    endpoint: 'me/topics',
    icon: '✍️',
    hint: '我发布的帖子',
    pageSize: 50,
    kind: 'topics',
    paginated: false,
    emptyTitle: '还没有发过帖子',
    emptyDesc: '发布第一帖后会出现在这里。',
  },
  {
    id: 'builtin:me_collections',
    label: '我的合集',
    endpoint: 'me/collections',
    icon: '📚',
    hint: '我整理的帖子合集',
    pageSize: 50,
    kind: 'collections',
    paginated: false,
    emptyTitle: '还没有合集',
    emptyDesc: '在站点里创建合集并把帖子放进去后，会出现在这里。',
  },
];

export const ME_VIEW_MAP: Record<MeViewId, MeViewMeta> = BUILTIN_ME_VIEWS.reduce(
  (map, view) => {
    map[view.id] = view;
    return map;
  },
  {} as Record<MeViewId, MeViewMeta>,
);

export function isMeViewId(value: string): value is MeViewId {
  return Object.prototype.hasOwnProperty.call(ME_VIEW_MAP, value);
}

export function findMeView(id: string): MeViewMeta | null {
  return isMeViewId(id) ? ME_VIEW_MAP[id] : null;
}

/* ------------------------------------------------------------------
   响应归一化
   开放 API 的字段名在不同端点间并不完全一致，而且服务端承诺只增字段。
   这里按「多种常见形态」取值，认不出的条目跳过，不让一条脏数据毁掉整页。
----------------------------------------------------------------- */

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as UnknownRecord)
    : null;
}

function readText(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return null;
}

function readNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function readBool(...values: unknown[]): boolean | undefined {
  for (const value of values) {
    if (typeof value === 'boolean') return value;
    if (value === 0 || value === 1) return value === 1;
  }
  return undefined;
}

function normalizeAuthor(raw: unknown): Author | null {
  const record = asRecord(raw);
  if (!record) return null;
  const username = readText(record.username, record.name);
  const id = readText(record.id);
  if (!username && !id) return null;
  return {
    id: id ?? undefined,
    username: username ?? undefined,
    avatar_url: readText(record.avatar_url, record.avatarUrl, record.avatar) ?? null,
    level: readNumber(record.level),
    is_pro: readBool(record.is_pro),
    role: readText(record.role) ?? undefined,
  };
}

function normalizeNodeRef(raw: unknown): TopicNodeRef | null {
  const record = asRecord(raw);
  if (!record) return null;
  const slug = readText(record.slug);
  if (!slug) return null;
  return {
    id: readText(record.id) ?? undefined,
    slug,
    name: readText(record.name) ?? undefined,
    parent_slug: readText(record.parent_slug) ?? null,
  };
}

function normalizeTags(raw: unknown): { name?: string }[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const tags = raw
    .map((tag) => (typeof tag === 'string' ? tag : readText(asRecord(tag)?.name)))
    .filter((name): name is string => Boolean(name))
    .map((name) => ({ name }));
  return tags.length ? tags : undefined;
}

/** 关注流条目会带表情表态与打赏；只在有数据时保留，别的视图不受影响。 */
function normalizeReactions(raw: unknown): ReactionSummary[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const reactions: ReactionSummary[] = [];
  for (const value of raw) {
    const record = asRecord(value);
    const emoji = readText(record?.emoji);
    const count = readNumber(record?.count);
    if (emoji && typeof count === 'number' && count > 0) reactions.push({ emoji, count });
  }
  return reactions.length ? reactions : undefined;
}

function normalizeRewards(raw: unknown): RewardSummary[] | undefined {
  if (!Array.isArray(raw)) return undefined;
  const rewards: RewardSummary[] = [];
  for (const value of raw) {
    const record = asRecord(value);
    if (!record) continue;
    const amount = readNumber(record.amount);
    if (typeof amount !== 'number' || amount <= 0) continue;
    rewards.push({
      id: readText(record.id) ?? undefined,
      amount,
      user: normalizeAuthor(record.user),
      created_at: readText(record.created_at) ?? undefined,
    });
  }
  return rewards.length ? rewards : undefined;
}

/** 没拿到 markdown 时，把 `content_html` 粗略退化成纯文本，不注入 HTML。 */
function htmlToText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function readContent(record: UnknownRecord | null): string | undefined {
  const markdown = readText(record?.content, record?.content_text);
  if (markdown) return markdown;
  const html = readText(record?.content_html);
  return html ? htmlToText(html) : undefined;
}

/**
 * 帖子归一化。兼容：
 * - 帖子对象直接平铺；
 * - `{ post: {...} }` / `{ topic: {...} }` 的包装。
 */
export function normalizeMeTopic(raw: unknown): Topic | null {
  const record = asRecord(raw);
  if (!record) return null;
  const source = asRecord(record.post) ?? asRecord(record.topic) ?? record;
  const shortId = readText(source.short_id, source.shortId, record.short_id);
  if (!shortId) return null;

  const node = normalizeNodeRef(source.node) ?? normalizeNodeRef(record.node) ?? { slug: '' };

  return {
    id: readText(source.id) ?? undefined,
    short_id: shortId,
    title: readText(source.title, source.post_title) ?? undefined,
    type: readText(source.type) ?? undefined,
    is_pinned: readBool(source.is_pinned),
    comment_count: readNumber(source.comment_count, source.comments_count),
    views: readNumber(source.views),
    created_at: readText(source.created_at, source.createdAt, record.created_at) ?? undefined,
    latest_commented_at:
      readText(
        source.latest_commented_at,
        source.last_commented_at,
        source.updated_at,
      ) ?? undefined,
    author: normalizeAuthor(source.author ?? record.author),
    node,
    tags: normalizeTags(source.tags),
    hotScore: readNumber(source.hotScore),
    status: readText(source.status) ?? undefined,
    // 关注流会带正文、表态与打赏；没有就留空，普通列表照常。
    content: readContent(source) ?? undefined,
    content_html: readText(source.content_html) ?? undefined,
    reactions_summary: normalizeReactions(source.reactions_summary),
    rewards: normalizeRewards(source.rewards),
  };
}

function normalizeCommentPostRef(
  raw: unknown,
  fallback?: UnknownRecord | null,
): CommentPostRef | null {
  const record = asRecord(raw) ?? fallback ?? null;
  if (!record) return null;
  const shortId = readText(record.short_id, record.shortId);
  if (!shortId) return null;
  return {
    id: readText(record.id) ?? undefined,
    short_id: shortId,
    title: readText(record.title) ?? undefined,
    comment_count: readNumber(record.comment_count, record.comments_count),
    views: readNumber(record.views),
    node: normalizeNodeRef(record.node),
    parent_node:
      normalizeNodeRef(record.parent_node) ?? normalizeNodeRef(record.parentNode),
  };
}

/**
 * 评论归一化。兼容书签 / 关注流里可能出现的两种形态：
 * - 评论对象平铺，`post` 是帖子摘要；
 * - `{ comment: {...}, post: {...} }`。
 */
export function normalizeMeComment(raw: unknown): LatestComment | null {
  const record = asRecord(raw);
  if (!record) return null;

  const nested = asRecord(record.comment) ?? asRecord(record.reply);
  const source = nested ?? record;
  const id = readText(source.id, source.comment_id, record.id);
  if (!id) return null;

  const post =
    normalizeCommentPostRef(record.post, asRecord(source.post)) ??
    normalizeCommentPostRef(source.post, asRecord(record.post)) ??
    { short_id: '' };

  const parentRecord = asRecord(source.parent) ?? asRecord(record.parent);
  const parent = parentRecord
    ? {
        id: readText(parentRecord.id) ?? '',
        content: readText(parentRecord.content) ?? null,
        created_at: readText(parentRecord.created_at) ?? undefined,
        is_deleted: readBool(parentRecord.is_deleted),
        floor: readNumber(parentRecord.floor) ?? null,
        flat_floor: readNumber(parentRecord.flat_floor) ?? null,
        author: normalizeAuthor(parentRecord.author),
      }
    : null;

  return {
    id,
    floor: readNumber(source.floor) ?? null,
    flat_floor: readNumber(source.flat_floor) ?? null,
    content: readContent(source) ?? null,
    content_html: readText(source.content_html) ?? undefined,
    created_at: readText(source.created_at, source.createdAt, record.created_at) ?? undefined,
    updated_at: readText(source.updated_at) ?? undefined,
    is_deleted: readBool(source.is_deleted),
    author: normalizeAuthor(source.author ?? record.author),
    reply_to_username: readText(
      source.reply_to_username,
      source.reply_to,
      parentRecord?.author ? normalizeAuthor(parentRecord.author)?.username : null,
    ),
    parent,
    post,
    reactions_summary: normalizeReactions(source.reactions_summary),
    rewards: normalizeRewards(source.rewards),
  };
}

/** 合集归一化；名称是唯一必填字段。 */
export function normalizeMeCollection(raw: unknown): CollectionSummary | null {
  const record = asRecord(raw);
  if (!record) return null;
  const source = asRecord(record.collection) ?? record;
  const name = readText(source.name, source.title, record.name);
  if (!name) return null;
  return {
    id: readText(source.id, source.collection_id, source.uuid) ?? undefined,
    name,
    description: readText(source.description, source.desc) ?? null,
    post_count: readNumber(
      source.post_count,
      source.posts_count,
      source.topic_count,
      source.count,
      source.num,
    ),
    created_at: readText(source.created_at, source.createdAt) ?? undefined,
    updated_at: readText(source.updated_at, source.updatedAt) ?? undefined,
  };
}

/** 合集在站点里的入口：`/user/<username>/post?collection=<name>`。 */
export function collectionHref(collection: CollectionSummary, username?: string | null): string {
  if (!username) return APP_ORIGIN;
  const params = new URLSearchParams({ collection: collection.name });
  return `${APP_ORIGIN}/user/${encodeURIComponent(username)}/post?${params.toString()}`;
}

function normalizeMeItem(meta: MeViewMeta, raw: unknown): FeedItem | null {
  if (meta.kind === 'collections') {
    const collection = normalizeMeCollection(raw);
    if (!collection) return null;
    return {
      key: `collection:${collection.id ?? collection.name}`,
      kind: 'collection',
      collection,
    };
  }

  if (meta.kind === 'comments') {
    const comment = normalizeMeComment(raw);
    if (!comment) return null;
    return { key: `comment:${comment.id}`, kind: 'comment', comment };
  }

  if (meta.kind === 'topics') {
    const topic = normalizeMeTopic(raw);
    if (!topic) return null;
    return { key: `topic:${topic.short_id}`, kind: 'topic', topic };
  }

  // 关注流同时可能出现帖子与评论。帖子摘要里也有 `post` 字段，所以先看
  // 「像不像评论」（有正文 / comment 包装 / 回复关系），再退回帖子。
  const record = asRecord(raw);
  const looksLikeComment =
    Boolean(record) &&
    ('content' in record! ||
      'comment' in record! ||
      'reply' in record! ||
      'reply_to_username' in record!);

  if (looksLikeComment) {
    const comment = normalizeMeComment(raw);
    if (comment) return { key: `comment:${comment.id}`, kind: 'comment', comment };
  }

  const topic = normalizeMeTopic(raw);
  if (topic) return { key: `topic:${topic.short_id}`, kind: 'topic', topic };

  const comment = normalizeMeComment(raw);
  return comment ? { key: `comment:${comment.id}`, kind: 'comment', comment } : null;
}

function extractList(raw: unknown, keys: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  const record = asRecord(raw);
  if (!record) return [];
  for (const key of keys) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  // 少数端点会把列表再包一层 data。
  const nested = asRecord(record.data);
  if (nested) return extractList(nested, keys);
  return [];
}

const LIST_KEYS: Record<MeViewKind, string[]> = {
  topics: ['posts', 'topics', 'items', 'list'],
  comments: ['items', 'comments', 'posts', 'list'],
  collections: ['collections', 'items', 'list'],
  mixed: ['items', 'posts', 'topics', 'list'],
};

export interface MePage {
  items: FeedItem[];
  total: number;
  page: number;
  totalPages: number;
}

/** 把 `/v1/me/*` 的响应收敛成通用列表页。 */
export function normalizeMePage(
  meta: MeViewMeta,
  raw: unknown,
  requestedPage = 1,
): MePage {
  const record = asRecord(raw);
  const rawItems = extractList(raw, LIST_KEYS[meta.kind]);
  const items: FeedItem[] = [];
  const seen = new Set<string>();

  for (const rawItem of rawItems) {
    const item = normalizeMeItem(meta, rawItem);
    if (!item || seen.has(item.key)) continue;
    seen.add(item.key);
    items.push(item);
  }

  const total = readNumber(record?.total, record?.count, record?.total_count) ?? items.length;
  const page = readNumber(record?.page) ?? requestedPage;
  const limit = readNumber(record?.limit) ?? (meta.paginated ? meta.pageSize : items.length);
  const totalPages =
    readNumber(record?.total_pages, record?.totalPages, record?.pages) ??
    (meta.paginated && limit > 0 ? Math.max(1, Math.ceil(total / limit)) : 1);

  return { items, total, page, totalPages };
}
