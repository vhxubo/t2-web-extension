import type { CommentRunBlock } from '../lib/comment-runs';
import type { EmojiMap } from '../lib/emojis';
import { CommentRow } from './CommentRow';
import { Icon } from './Icon';

interface CommentRunProps {
  run: CommentRunBlock;
  /** 是否已经展开：展开时展示整组评论，按钮变成「收起」。 */
  open: boolean;
  compact?: boolean;
  dense?: boolean;
  emojis?: EmojiMap;
  readKeys: ReadonlySet<string>;
  onRead: (key: string) => void;
  onToggle: () => void;
}

/**
 * 一段「同一用户连续发布」的评论。
 *
 * 默认只展示第一条，其余收在按钮后面；按钮固定紧跟第一条评论，
 * 展开后也停在同一位置，避免「收起」被整组内容推到列表底部。
 */
export function CommentRun({
  run,
  open,
  compact = false,
  dense = false,
  emojis,
  readKeys,
  onRead,
  onToggle,
}: CommentRunProps) {
  const [first, ...rest] = run.items;
  const total = run.items.length;
  if (!first) return null;

  return (
    <>
      <CommentRow
        comment={first.comment}
        compact={compact}
        dense={dense}
        emojis={emojis}
        isRead={readKeys.has(first.key)}
        onRead={() => onRead(first.key)}
      />

      {/* 按钮紧跟第一条评论：无论展开与否都在同一位置，避免「收起」被推到列表末尾。 */}
      <li
        className={`comment-run${compact ? ' comment-run--compact' : ''}${
          dense ? ' comment-run--dense' : ''
        }`}
      >
        <button
          type="button"
          className={`comment-run__toggle${open ? ' is-open' : ''}`}
          onClick={onToggle}
          aria-expanded={open}
          title={
            open
              ? `收起 @${run.author} 的连续评论`
              : `展开 @${run.author} 另外 ${total - 1} 条连续评论`
          }
        >
          <span className="comment-run__icon" aria-hidden="true">
            <Icon name="chevron" size={12} />
          </span>
          <span className="comment-run__text">
            <span className="comment-run__author">@{run.author}</span>
            {open ? (
              <>
                {' '}
                的 {total} 条连续评论已展开
              </>
            ) : (
              <>
                {' '}
                还有 <b className="comment-run__count">{total - 1} 条</b>连续评论
              </>
            )}
          </span>
          <span className="comment-run__action">
            {open ? '收起' : `展开 ${total - 1} 条`}
          </span>
        </button>
      </li>

      {open &&
        rest.map((item) => (
          <CommentRow
            key={item.key}
            comment={item.comment}
            compact={compact}
            dense={dense}
            emojis={emojis}
            isRead={readKeys.has(item.key)}
            onRead={() => onRead(item.key)}
          />
        ))}
    </>
  );
}
