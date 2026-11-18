/**
 * 「最新评论」时间线里的连续评论折叠。
 *
 * 列表本身按时间倒序排列，同一个用户在相邻位置连发多条评论时会占满整屏。
 * 这里只做纯数据分组：同一作者的相邻条目合成一个 run，达到阈值才折叠；
 * 折叠 / 展开按钮与设置开关由组件层与内容脚本处理，方便单独测试。
 *
 * 判定「连续」只看作者与列表相邻关系，不要求是同一条帖子：最新评论是全局
 * 时间线，跨帖连发同样会把别人的评论挤出屏幕。
 */
import type { FeedItem, LatestComment } from './types';

export type CommentFeedItem = Extract<FeedItem, { kind: 'comment' }>;

export interface CommentRunBlock {
  kind: 'run';
  /** 组内第一条的 key；展开 / 收起状态以它为标识。 */
  key: string;
  /** 作者展示名（不带 @）。 */
  author: string;
  /** 同一作者的连续评论，第一条是默认展示的那条。 */
  items: CommentFeedItem[];
}

export type CommentTimelineBlock =
  | { kind: 'item'; item: FeedItem }
  | CommentRunBlock;

/** 默认折叠阈值：同一作者连续 3 条及以上时折叠。 */
export const COMMENT_RUN_DEFAULT_LENGTH = 3;
/** 设置里可选的阈值下限；少于 2 条不构成「连续」。 */
export const COMMENT_RUN_MIN_LENGTH = 2;
/** 设置里可选的阈值上限。 */
export const COMMENT_RUN_MAX_LENGTH = 10;

/**
 * 把设置里的折叠阈值收敛到可选范围（2–10）。
 * 缺省、非数字或手工改坏的值一律回落到默认 3。
 */
export function normalizeCommentRunThreshold(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return COMMENT_RUN_DEFAULT_LENGTH;
  }
  return Math.min(
    COMMENT_RUN_MAX_LENGTH,
    Math.max(COMMENT_RUN_MIN_LENGTH, Math.round(value)),
  );
}

/**
 * 作者身份键：优先用户 id，其次小写用户名。
 * 没有作者信息（匿名 / 已删除）时返回 null，调用方不应把这些评论并进同一组，
 * 否则会把不同人的匿名评论误折叠成一个人的连续评论。
 */
export function commentAuthorKey(comment: LatestComment): string | null {
  const id = comment.author?.id?.trim();
  if (id) return `id:${id}`;
  const username = comment.author?.username?.trim().toLowerCase();
  return username ? `name:${username}` : null;
}

/** 作者展示名；和 CommentRow 的 @匿名 保持一致。 */
export function commentAuthorLabel(comment: LatestComment): string {
  return comment.author?.username?.trim() || '匿名';
}

/**
 * 从站点用户链接（`/user/<name>/about`）取作者键。
 * 内容脚本没有接口数据，只能从 DOM 的 href 推作者；规则与 `commentAuthorKey`
 * 的 username 分支保持一致（去空白、转小写）。
 */
export function commentAuthorKeyFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const match = /^\/user\/([^/?#]+)(?:\/|$)/.exec(href);
  const raw = match?.[1];
  if (!raw) return null;

  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    // 非法百分号编码：退回原文，至少还能参与分组。
  }
  name = name.trim().toLowerCase();
  return name ? `name:${name}` : null;
}

/** 从评论的帖子链接（`...?commentId=<uuid>`）取评论 id；用作折叠组的稳定标识。 */
export function commentIdFromHref(href: string | null | undefined): string | null {
  if (!href) return null;
  const match = /[?&]commentId=([^&#]+)/.exec(href);
  const raw = match?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export interface ConsecutiveGroup {
  /** 组内第一条在输入数组里的下标。 */
  start: number;
  /** 组内条目数，保证达到阈值。 */
  length: number;
}

/**
 * 在一串「作者键」里找出连续相同、且长度达到阈值的片段。
 * 键为 null 的条目不参与分组，同时会打断已有的连续片段。
 *
 * 和 `groupConsecutiveComments` 共用阈值语义；内容脚本里没有 FeedItem，
 * 只需要作者键，所以单独暴露这个下标级函数。
 */
export function findConsecutiveGroups(
  keys: ReadonlyArray<string | null>,
  minLength: number = COMMENT_RUN_DEFAULT_LENGTH,
): ConsecutiveGroup[] {
  // 阈值至少为 2：一条不成「连续」，也不该出现只有一行的折叠组。
  const threshold = Math.max(2, Math.floor(minLength));
  const groups: ConsecutiveGroup[] = [];
  let start = 0;
  let current: string | null = null;

  const flush = (end: number) => {
    if (current !== null && end - start >= threshold) {
      groups.push({ start, length: end - start });
    }
  };

  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index] ?? null;
    if (key !== null && key === current) continue;
    flush(index);
    current = key;
    start = index;
  }
  flush(keys.length);
  return groups;
}

/**
 * 把评论时间线切成渲染块：能折叠的连续同作者评论合成 `run`，
 * 其余（不足阈值的连续评论、非评论条目、匿名评论）保持 `item` 原样。
 */
export function groupConsecutiveComments(
  items: FeedItem[],
  minLength: number = COMMENT_RUN_DEFAULT_LENGTH,
): CommentTimelineBlock[] {
  const keys = items.map((item) =>
    item.kind === 'comment' ? commentAuthorKey(item.comment) : null,
  );
  const groups = findConsecutiveGroups(keys, minLength);
  const starts = new Map(groups.map((group) => [group.start, group]));
  const blocks: CommentTimelineBlock[] = [];

  for (let index = 0; index < items.length; ) {
    const item = items[index];
    if (!item) break;

    const group = starts.get(index);
    if (!group) {
      blocks.push({ kind: 'item', item });
      index += 1;
      continue;
    }

    const run = items.slice(group.start, group.start + group.length) as CommentFeedItem[];
    const first = run[0];
    if (!first) {
      index += 1;
      continue;
    }

    blocks.push({
      kind: 'run',
      key: first.key,
      author: commentAuthorLabel(first.comment),
      items: run,
    });
    index += group.length;
  }

  return blocks;
}
