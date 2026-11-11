/**
 * 帖子详情与收藏（`GET /v1/topics/:short_id`、`POST|DELETE /v1/topics/:short_id/favorite`）。
 *
 * 详情端点会返回正文 markdown、类型、节点、作者、发布时间等列表里没有的字段；
 * 带令牌时还会多返回 `favorited` 这类个性化字段。收藏是写操作，需要 `interact` scope。
 */
import { apiDelete, apiGet, apiPost } from './api';
import { APP_ORIGIN } from './config';
import type { Topic, TopicNodeRef } from './types';

export interface TopicPostscript {
  id?: string;
  content?: string | null;
  created_at?: string;
}

/** 详情里的节点比列表多带推荐表情字段。 */
export interface TopicDetailNode extends TopicNodeRef {
  main_emojis?: string[] | null;
  sub_emojis?: string[] | null;
}

export interface TopicDetail extends Topic {
  content?: string | null;
  updated_at?: string;
  comments_closed?: boolean;
  /** 当前用户是否已收藏；只有带令牌请求时才会下发。 */
  favorited?: boolean;
  postscripts?: TopicPostscript[] | null;
  extra?: Record<string, unknown> | null;
  node: TopicDetailNode;
}

/**
 * 帖子类型。接口文档写 `normal`，线上实际下发的是 `default`，两个都当普通帖，
 * 其它值（`anonymous` / `moment` 等）才是有信息量的特殊类型。
 */
const TOPIC_TYPE_LABELS: Record<string, string> = {
  default: '普通',
  normal: '普通',
  anonymous: '匿名',
  moment: '动态',
};

const NORMAL_TYPES = new Set(['default', 'normal']);

/** 普通帖不显示类型标签，避免每一条都挂一个没有信息量的「普通」。 */
export function isNormalTopicType(type?: string | null): boolean {
  return !type || NORMAL_TYPES.has(type);
}

/** 帖子类型的中文标签；未知类型原样展示，避免把服务端新增类型吞掉。 */
export function topicTypeLabel(type?: string | null): string {
  if (!type) return '普通';
  return TOPIC_TYPE_LABELS[type] ?? type;
}

export function loadTopicDetail(shortId: string, signal?: AbortSignal): Promise<TopicDetail> {
  return apiGet<TopicDetail>(`/v1/topics/${encodeURIComponent(shortId)}`, {
    // 带令牌才能拿到 favorited；未登录时接口照常匿名返回正文。
    auth: true,
    signal,
  });
}

/**
 * 收藏 / 取消收藏。无请求体；重复收藏服务端可能返回 `409 conflict`，
 * 调用方应把它当作「已收藏」，而不是失败。
 */
export async function setTopicFavorite(shortId: string, favorite: boolean): Promise<void> {
  const path = `/v1/topics/${encodeURIComponent(shortId)}/favorite`;
  if (favorite) {
    await apiPost<unknown>(path);
  } else {
    await apiDelete<unknown>(path);
  }
}

/** 节点页地址：父节点 `/node/<parent>/<slug>`，顶层节点 `/node/<slug>`。 */
export function topicNodeHref(
  node?: { slug?: string; parent_slug?: string | null } | null,
): string {
  const slug = node?.slug?.trim();
  if (!slug) return APP_ORIGIN;
  const parent = node?.parent_slug?.trim();
  return parent
    ? `${APP_ORIGIN}/node/${encodeURIComponent(parent)}/${encodeURIComponent(slug)}`
    : `${APP_ORIGIN}/node/${encodeURIComponent(slug)}`;
}
