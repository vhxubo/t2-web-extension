import {
  commentExcerpt,
  commentFloor,
  commentHref,
  commentNodeLabel,
  commentParentExcerpt,
  commentPostHref,
  commentReplyTo,
} from '../lib/comments';
import type { EmojiMap } from '../lib/emojis';
import { relativeTime } from '../lib/format';
import type { LatestComment } from '../lib/types';
import { Avatar } from './Avatar';
import { CommentText } from './CommentText';
import { Icon } from './Icon';

interface CommentRowProps {
  comment: LatestComment;
  /** 仪表盘卡片里更紧凑一些。 */
  compact?: boolean;
  /** 弹窗：头部 / 正文 / 原帖三行紧凑排版。 */
  dense?: boolean;
  /** 页面上缓存的表情映射；为空时正文保留 `:code:` 原文。 */
  emojis?: EmojiMap;
}

/**
 * 「最新评论」专用行。
 *
 * 和帖子行不同，这里一条数据同时牵着三样东西：回复人、被回复的人、所属帖子。
 * - 点头部 / 正文 / 引用（整块 reply 链接）→ 到站点的这条回复（`?commentId=` + 页码）；
 * - 点底部的帖子标题 → 到原帖；
 * - 回复行会额外展示被引用的父评论，楼层用 `#N` 标在行尾。
 */
export function CommentRow({
  comment,
  compact = false,
  dense = false,
  emojis = {},
}: CommentRowProps) {
  const author = comment.author?.username?.trim() || '匿名';
  const replyTo = commentReplyTo(comment);
  const content = commentExcerpt(comment.content);
  const parentAuthor = comment.parent?.author?.username?.trim() || '';
  const parentText = commentParentExcerpt(comment);
  const quote = parentText
    ? `${parentAuthor ? `@${parentAuthor}：` : ''}${parentText}`
    : '';
  const floor = commentFloor(comment);
  const postTitle = comment.post?.title?.trim() || '（无标题）';
  const nodeLabel = commentNodeLabel(comment);
  const replyCount = comment.post?.comment_count;

  const replyHref = commentHref(comment);
  const postHref = commentPostHref(comment);
  const bodyText = comment.is_deleted ? '该评论已删除' : content || '（无正文）';
  const replyDescription = replyTo
    ? `打开 @${author} 回复 @${replyTo} 的评论：${postTitle}`
    : `打开 @${author} 的评论：${postTitle}`;

  return (
    <li
      className={`comment-row${compact ? ' comment-row--compact' : ''}${
        dense ? ' comment-row--dense' : ''
      }`}
    >
      <span className="comment-row__avatar">
        <Avatar src={comment.author?.avatar_url} name={author} />
      </span>

      <div className="comment-row__main">
        <a
          className="comment-row__reply"
          href={replyHref}
          target="_blank"
          rel="noreferrer"
          title="打开这条回复"
          aria-label={replyDescription}
        >
          <span className="comment-row__head">
            <span className="comment-row__identity">
              <span className="comment-row__author">@{author}</span>
              {replyTo ? (
                <>
                  <span className="comment-row__verb">回复</span>
                  <span className="comment-row__to">@{replyTo}</span>
                </>
              ) : (
                <span className="comment-row__verb">评论了帖子</span>
              )}
            </span>
            <span className="comment-row__dot" aria-hidden="true">
              ·
            </span>
            <time className="comment-row__time" dateTime={comment.created_at}>
              {relativeTime(comment.created_at)}
            </time>
            {floor !== null && (
              <span className="comment-row__floor t2-mono" title={`第 ${floor} 楼`}>
                #{floor}
              </span>
            )}
            <span className="comment-row__go" aria-hidden="true">
              <Icon name="arrow" size={11} />
            </span>
          </span>

          <span
            className={`comment-row__content${
              comment.is_deleted ? ' comment-row__content--deleted' : ''
            }`}
          >
            {comment.is_deleted ? bodyText : <CommentText text={bodyText} emojis={emojis} />}
          </span>

          {quote && (
            <span className="comment-row__quote">
              <span className="comment-row__quote-text">
                <CommentText text={quote} emojis={emojis} />
              </span>
            </span>
          )}
        </a>

        <span className="comment-row__foot">
          <span className="comment-row__node" title={nodeLabel}>
            {nodeLabel}
          </span>
          <a
            className="comment-row__post"
            href={postHref}
            target="_blank"
            rel="noreferrer"
            title={`打开原帖：${postTitle}`}
          >
            <span className="comment-row__post-title">{postTitle}</span>
            <Icon name="external" size={10} className="comment-row__post-icon" />
          </a>
          {typeof replyCount === 'number' && replyCount >= 0 && (
            <span className="comment-row__count t2-mono">{replyCount} 评论</span>
          )}
        </span>
      </div>
    </li>
  );
}
