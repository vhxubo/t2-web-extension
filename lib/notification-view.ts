/**
 * 通知 payload → 展示字段。
 *
 * 这里刻意不依赖扩展运行时（browser / storage / fetch），方便用 bun test
 * 直接验证字段映射；请求逻辑留在 lib/notifications.ts。
 */
import { APP_ORIGIN, LINKS } from './config';
import type { Author } from './types';

export interface AppNotification {
  id: string;
  type?: string;
  /**
   * 通知负载的结构没有在文档里逐项承诺，但站点自己的通知中心会读取这些字段。
   * 这里按「字段可能新增」处理：认识的字段用于展示，不认识的一律忽略。
   */
  payload?: Record<string, unknown> | null;
  is_read?: boolean;
  created_at?: string;
  from_user?: Author | null;
  emojis?: Record<string, string>;
}

const TYPE_LABELS: Record<string, string> = {
  reply: '回复',
  reply_mention: '回复提及',
  mention: '提及',
  comment_pin: '置顶',
  system: '系统',
  pandora: '潘多拉',
  reward: '打赏',
  get_reward: '打赏',
  like: '点赞',
  reaction: '表态',
  follow: '关注',
  favorite: '收藏',
  level_up: '升级',
  content_check: '检定',
  badge_unlocked: '徽章',
};

export function notificationTypeLabel(type?: string): string {
  if (!type) return '通知';
  return TYPE_LABELS[type] ?? type;
}

export type NotificationKind =
  | 'reply'
  | 'reply_mention'
  | 'mention'
  | 'comment_pin'
  | 'favorite'
  | 'system'
  | 'pandora'
  | 'reaction'
  | 'get_reward'
  | 'level_up'
  | 'content_check'
  | 'badge_unlocked'
  | 'follow'
  | 'unknown';

export type NotificationTone = 'info' | 'success' | 'warning' | 'primary' | 'muted';
export type NotificationDetailTone = 'success' | 'warning' | 'danger' | 'muted';

export interface NotificationReaction {
  emoji: string;
  count: number;
}

/** 把一条原始通知归一成可直接渲染的字段，页面不需要再猜 payload。 */
export interface NotificationView {
  kind: NotificationKind;
  typeLabel: string;
  tone: NotificationTone;
  /** 操作者展示名；匿名回复时用 payload.alias_name。 */
  actorName: string | null;
  actorAvatar: string | null;
  actorIsAlias: boolean;
  /** 具体操作，例如「回复了你的评论」「打赏了你的帖子」。 */
  action: string;
  /** 被操作的帖子 / 评论标题。 */
  targetTitle: string | null;
  /** 目标内容的站点地址；没有可定位内容时回落到通知页。 */
  targetHref: string;
  /** 回复 / 提及 / 表态的正文；评论内容会原样展示。 */
  excerpt: string | null;
  /** 金币、徽章、系统提示等附加信息。 */
  detail: string | null;
  detailTone: NotificationDetailTone;
  /** RSS 地址、连续失败次数等辅助信息。 */
  meta: string[];
  reactions: NotificationReaction[];
  /** 打赏 / 置顶通知里的金币数，负数和 0 也保留。 */
  coins: number | null;
}

const KIND_MAP: Record<string, NotificationKind> = {
  reply: 'reply',
  reply_mention: 'reply_mention',
  mention: 'mention',
  comment_pin: 'comment_pin',
  favorite: 'favorite',
  system: 'system',
  pandora: 'pandora',
  reaction: 'reaction',
  get_reward: 'get_reward',
  level_up: 'level_up',
  content_check: 'content_check',
  badge_unlocked: 'badge_unlocked',
  follow: 'follow',
};

const TONE_MAP: Record<NotificationKind, NotificationTone> = {
  reply: 'info',
  reply_mention: 'info',
  mention: 'info',
  comment_pin: 'primary',
  favorite: 'warning',
  system: 'warning',
  pandora: 'warning',
  reaction: 'info',
  get_reward: 'success',
  level_up: 'success',
  content_check: 'info',
  badge_unlocked: 'success',
  follow: 'primary',
  unknown: 'muted',
};

function payloadOf(item: AppNotification): Record<string, unknown> {
  const payload = item.payload;
  return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
}

function stringValue(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text ? value : null;
}

function numberValue(value: unknown): number | null {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function normalizeSiteHref(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  if (value.startsWith('//')) return `https:${value}`;
  if (value.startsWith('/')) return `${APP_ORIGIN}${value}`;
  return `${APP_ORIGIN}/${value.replace(/^\.?\//, '')}`;
}

function withComment(href: string, commentId: string | null): string {
  if (!commentId || /[?&]commentId=/.test(href)) return href;
  return `${href}${href.includes('?') ? '&' : '?'}commentId=${encodeURIComponent(commentId)}`;
}

/**
 * 通知里最值得打开的目标地址：优先用服务端给出的 path（RSS、投票等都在里面），
 * 其次是帖子 short_id 拼出来的详情页；两者都没有时回到通知中心。
 */
export function notificationHref(item: AppNotification): string {
  const payload = payloadOf(item);
  const path = stringValue(payload.path) ?? stringValue(payload.articleLink);
  const relatedId = stringValue(payload.related_id);
  // `related_id` 在表态 / 内容检定里才可能是评论 id；帖子表态不能再拼 commentId。
  const relatedIsComment =
    (item.type === 'reaction' && stringValue(payload.reactionType) === 'comment') ||
    (item.type === 'content_check' && stringValue(payload.contentType) === 'comment');
  const commentId = stringValue(payload.commentId) ?? (relatedIsComment ? relatedId : null);

  if (item.type === 'follow') {
    const follower =
      stringValue(payload.followerUsername) ?? stringValue(item.from_user?.username);
    if (follower) return `${APP_ORIGIN}/user/${encodeURIComponent(follower)}/about`;
  }

  if (path) {
    const href = normalizeSiteHref(path);
    if (href) return withComment(href, commentId);
  }

  const shortId = stringValue(payload.postShortId);
  if (shortId) {
    const nodeSlug = stringValue(payload.postNodeSlug) ?? '_';
    const href = `${APP_ORIGIN}/post/${encodeURIComponent(nodeSlug)}/${encodeURIComponent(shortId)}`;
    return withComment(href, commentId);
  }

  return LINKS.notifications;
}

/** 规范化 `payload.reactions`（emoji → 人数），缺失时退回到 relations 聚合。 */
function reactionSummary(payload: Record<string, unknown>): NotificationReaction[] {
  const fromCounts: NotificationReaction[] = [];
  const raw = payload.reactions;
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [emoji, value] of Object.entries(raw)) {
      const count = numberValue(value);
      if (emoji && count !== null && count > 0) fromCounts.push({ emoji, count });
    }
  }
  if (fromCounts.length > 0) return fromCounts;

  const relations = payload.relations;
  if (!Array.isArray(relations)) return [];
  const counts = new Map<string, number>();
  for (const relation of relations) {
    if (!relation || typeof relation !== 'object') continue;
    const emoji = stringValue((relation as Record<string, unknown>).emoji);
    if (!emoji) continue;
    counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
  }
  return Array.from(counts, ([emoji, count]) => ({ emoji, count }));
}

function actionText(
  kind: NotificationKind,
  payload: Record<string, unknown>,
  rewardType: string | null,
): string {
  const commentLevel = numberValue(payload.commentLevel);
  const subject =
    commentLevel === 0 ? '帖子' : commentLevel !== null && commentLevel > 0 ? '评论' : null;

  switch (kind) {
    case 'reply':
      if (payload.target === 'postscript') return '回复了你的附言';
      return subject ? `回复了你的${subject}` : '回复了你';
    case 'reply_mention':
      return '回复并提到了你';
    case 'mention':
      return subject ? `在${subject}里提到了你` : '提到了你';
    case 'comment_pin':
      return '置顶了你的评论';
    case 'favorite':
      return '收藏了你的帖子';
    case 'system':
      return '发来一条系统消息';
    case 'pandora':
      return '潘多拉事件已生效';
    case 'reaction': {
      const reactionType = stringValue(payload.reactionType);
      if (reactionType === 'post') return '你的帖子收到了新表态';
      if (reactionType === 'comment') return '你的评论收到了新表态';
      return '你的内容收到了新表态';
    }
    case 'get_reward': {
      const normalized = rewardType?.toLowerCase() ?? '';
      if (normalized === 'post') return '打赏了你的帖子';
      if (normalized === 'comment') return '打赏了你的评论';
      if (normalized === 'rss_article' || normalized === 'rss') return '打赏了你的博客文章';
      return '打赏了你';
    }
    case 'level_up':
      return '等级提升了';
    case 'content_check': {
      const contentType = stringValue(payload.contentType);
      if (contentType === 'post') return '你的帖子完成了内容检定';
      if (contentType === 'comment') return '你的评论完成了内容检定';
      return '内容检定已完成';
    }
    case 'badge_unlocked':
      return '解锁了新徽章';
    case 'follow':
      return '关注了你';
    default:
      return '发来一条新通知';
  }
}

function detailOf(
  kind: NotificationKind,
  payload: Record<string, unknown>,
): { detail: string | null; detailTone: NotificationDetailTone } {
  switch (kind) {
    case 'system': {
      const error = stringValue(payload.error);
      const message = stringValue(payload.message);
      return {
        detail: error ?? message,
        detailTone: error ? 'danger' : 'muted',
      };
    }
    case 'pandora': {
      const message = stringValue(payload.message);
      if (message) return { detail: message, detailTone: 'muted' };
      const eventName = stringValue(payload.event_name);
      const eventTitle = stringValue(payload.event_title);
      const detail =
        eventName && eventTitle
          ? `${eventName}：${eventTitle}`
          : eventTitle ?? eventName ?? '潘多拉事件已生效';
      return { detail, detailTone: 'muted' };
    }
    case 'level_up':
      return { detail: stringValue(payload.message), detailTone: 'success' };
    case 'badge_unlocked': {
      const badge = stringValue(payload.badge_name);
      return {
        detail: badge ? `解锁徽章「${badge}」` : null,
        detailTone: 'success',
      };
    }
    case 'content_check':
      return {
        detail: stringValue(payload.message) ?? '内容检定已完成',
        detailTone: 'warning',
      };
    case 'get_reward': {
      const amount = numberValue(payload.amount);
      if (amount === null) return { detail: null, detailTone: 'success' };
      const prefix = amount > 0 ? '+' : '';
      return { detail: `${prefix}${amount} 金币`, detailTone: 'success' };
    }
    case 'comment_pin': {
      const coins = numberValue(payload.coins);
      return {
        detail: coins === null ? null : `获得 ${coins} 金币`,
        detailTone: 'success',
      };
    }
    default:
      return { detail: null, detailTone: 'muted' };
  }
}

function metaOf(kind: NotificationKind, payload: Record<string, unknown>): string[] {
  if (kind !== 'system') return [];
  const meta: string[] = [];
  const feedUrl = stringValue(payload.feedUrl);
  if (feedUrl) meta.push(`RSS：${feedUrl}`);
  const failures = numberValue(payload.consecutiveFailures);
  if (failures !== null) meta.push(`连续失败 ${failures} 次`);
  return meta;
}

/**
 * 通知中心与弹窗预览共用：从 payload 中挑出稳定可展示的字段。
 * 只做展示，不缓存正文；无法识别的 payload 会退回到「一条新通知」。
 */
export function describeNotification(item: AppNotification): NotificationView {
  const kind = KIND_MAP[item.type ?? ''] ?? 'unknown';
  const payload = payloadOf(item);

  const aliasName = stringValue(payload.alias_name);
  const followerName = stringValue(payload.followerUsername);
  const fromName = stringValue(item.from_user?.username);
  // 表态通知是聚合事件（payload.relations 里才是一组用户），不把 from_user 当操作者。
  const actorName = kind === 'reaction' ? null : (aliasName ?? followerName ?? fromName);
  const actorIsAlias = kind !== 'reaction' && aliasName !== null;
  const actorAvatar = actorIsAlias
    ? stringValue(payload.alias_avatar_url)
    : kind === 'reaction'
      ? null
      : stringValue(item.from_user?.avatar_url);

  const rewardType = stringValue(payload.rewardType);
  const action = actionText(kind, payload, rewardType);
  const { detail, detailTone } = detailOf(kind, payload);

  const targetTitle =
    stringValue(payload.postTitle) ??
    stringValue(payload.contentTitle) ??
    stringValue(payload.articleTitle);

  const commentText = stringValue(payload.commentText);
  const normalizedReward = rewardType?.toLowerCase() ?? null;
  const rewardShowsComment =
    kind === 'get_reward' &&
    normalizedReward !== 'post' &&
    normalizedReward !== 'rss_article' &&
    normalizedReward !== 'rss';
  const excerpt =
    kind === 'reply' ||
    kind === 'reply_mention' ||
    kind === 'mention' ||
    kind === 'comment_pin' ||
    kind === 'reaction' ||
    kind === 'content_check' ||
    rewardShowsComment
      ? commentText
      : null;

  return {
    kind,
    typeLabel: notificationTypeLabel(item.type),
    tone: TONE_MAP[kind],
    actorName,
    actorAvatar,
    actorIsAlias,
    action,
    targetTitle,
    targetHref: notificationHref(item),
    excerpt,
    detail,
    detailTone,
    meta: metaOf(kind, payload),
    reactions: kind === 'reaction' ? reactionSummary(payload) : [],
    coins: numberValue(kind === 'get_reward' ? payload.amount : payload.coins),
  };
}
