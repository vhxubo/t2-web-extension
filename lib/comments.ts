/**
 * 全站最新评论（`GET /v1/comments/latest`）。
 *
 * 这个端点的列表字段是 `items`，每条评论带一份帖子摘要（`post.short_id` /
 * `post.title` / 节点信息），回复还带 `parent` 与 `reply_to_username`。
 * 守护者节点的评论不在其中，所以这里不做额外的过滤。
 */
import { apiGet } from './api';
import { APP_ORIGIN } from './config';
import type { CommentPage, LatestComment } from './types';

/**
 * 站点网页端每页 30 条评论，`?p=` 也按这个粒度分页。
 * 要精确落到某条回复，必须把楼层换算成页码一起带过去。
 */
export const SITE_COMMENT_PAGE_SIZE = 30;

interface LoadLatestCommentsOptions {
  /** 该端点分页含义有限（page 实际被忽略），保留参数只为和接口签名一致。 */
  page?: number;
  /** 默认 20，最大 50。 */
  limit?: number;
  signal?: AbortSignal;
}

export async function loadLatestComments(
  options: LoadLatestCommentsOptions = {},
): Promise<CommentPage> {
  const { page = 1, limit = 20, signal } = options;
  return apiGet<CommentPage>('/v1/comments/latest', {
    // 只读端点；登录时走登录配额，匿名也能看。
    auth: true,
    query: { page, limit },
    signal,
  });
}

function nodeSlug(comment: LatestComment): string {
  // 站点自己的兜底：没有 slug 时用 `_` 占位，链接仍能打开帖子。
  return comment.post?.node?.slug || '_';
}

function shortId(comment: LatestComment): string {
  return comment.post?.short_id ?? '';
}

/** 帖子链接（楼层视图）：评论区右下角的「原帖」用它。 */
export function commentPostHref(comment: LatestComment): string {
  const short = shortId(comment);
  if (!short) return APP_ORIGIN;
  return `${APP_ORIGIN}/post/${encodeURIComponent(nodeSlug(comment))}/${encodeURIComponent(short)}`;
}

/** 评论在帖子里的序号；嵌套回复没有 floor，用 flat_floor 兜底。 */
export function commentFloor(comment: LatestComment): number | null {
  const value = comment.floor ?? comment.flat_floor;
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function commentPage(comment: LatestComment): number {
  const floor = commentFloor(comment);
  if (floor === null || floor < 1) return 1;
  return Math.max(1, Math.ceil(floor / SITE_COMMENT_PAGE_SIZE));
}

/**
 * 评论永久链接。
 *
 * 站点的约定是 `?commentId=<uuid>`，跨页时还要带 `p=<页码>`：
 * - 顶层楼层（有 `floor`）走楼层视图 `/post/...`，按 floor 分页；
 * - 嵌套回复（`floor` 为 null）在楼层视图里跟在根楼层下，仅凭接口数据算不出
 *   根楼层在哪一页，所以改用平铺视图 `/post-flat/...`，按 flat_floor 分页。
 *   两条路径都能让站点高亮并滚动到这条回复。
 */
export function commentHref(comment: LatestComment): string {
  const short = shortId(comment);
  if (!short) return APP_ORIGIN;

  const nested = comment.floor === null || comment.floor === undefined;
  const base = nested
    ? `${APP_ORIGIN}/post-flat/${encodeURIComponent(nodeSlug(comment))}/${encodeURIComponent(short)}`
    : commentPostHref(comment);

  const params = new URLSearchParams();
  params.set('commentId', comment.id);
  const page = commentPage(comment);
  if (page > 1) params.set('p', String(page));
  return `${base}?${params.toString()}`;
}

/**
 * 把评论正文收敛成可安全放进文本节点的单行摘要：
 * 去掉 markdown 链接 / 图片 / 强调标记与多余空白，不解析 HTML。
 */
export function commentExcerpt(content?: string | null): string {
  if (typeof content !== 'string' || !content) return '';
  return content
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`{1,3}([^`]*)`{1,3}/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/(^|\s)[*_](\S(?:[^*_]*\S)?)[*_](?=\s|$)/g, '$1$2')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 被回复人：优先接口的 reply_to_username，其次 parent 的作者。 */
export function commentReplyTo(comment: LatestComment): string | null {
  const direct = comment.reply_to_username?.trim();
  if (direct) return direct;
  const parent = comment.parent?.author?.username?.trim();
  return parent || null;
}

/** 父评论摘要（引用行）；已删除的父评论给一句占位。 */
export function commentParentExcerpt(comment: LatestComment): string {
  const parent = comment.parent;
  if (!parent) return '';
  if (parent.is_deleted) return '原回复已删除';
  return commentExcerpt(parent.content);
}

/** 评论是否属于某个具体节点（节点名 + 父节点名，做展示与提示用）。 */
export function commentNodeLabel(comment: LatestComment): string {
  const node = comment.post?.node;
  const parent = comment.post?.parent_node;
  const name = node?.name || node?.slug || '未分区';
  return parent?.name && parent.name !== name ? `${parent.name} / ${name}` : name;
}
