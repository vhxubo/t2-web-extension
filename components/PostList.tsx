import { useMemo, useState } from 'react';
import type { FeedItem } from '../lib/feed';
import type { FeedStatus } from '../hooks/useFeed';
import { COMMENT_RUN_DEFAULT_LENGTH, groupConsecutiveComments } from '../lib/comment-runs';
import type { EmojiMap } from '../lib/emojis';
import { describeError } from '../lib/errors';
import type { Topic } from '../lib/types';
import { CollectionRow } from './CollectionRow';
import { CommentRow } from './CommentRow';
import { CommentRun } from './CommentRun';
import { Icon } from './Icon';
import { PostRow } from './PostRow';
import { useReadItemsContext } from './ReadItems';

type FeedVariant = 'topic' | 'comment' | 'collection';

interface PostListProps {
  items: FeedItem[];
  status: FeedStatus;
  error: unknown;
  compact?: boolean;
  /** 是否显示行首序号；弹窗这类紧凑场景可以关掉。 */
  showRank?: boolean;
  /** 只显示标题，回复数固定在行尾，省略分区、作者和时间（弹窗用）。 */
  titleOnly?: boolean;
  /** 标题强制单行截断（弹窗 Dock 布局用）。 */
  oneLine?: boolean;
  /** 列表内容：普通帖子、「最新评论」时间线，或「我的合集」。 */
  variant?: FeedVariant;
  /** 评论正文的表情映射；页面级缓存，按需加载。 */
  emojis?: EmojiMap;
  /** 合集所属用户名；「我的合集」用它拼站点入口。 */
  collectionOwner?: string | null;
  /** 列表为空时的文案；「我的」各视图用各自的人话。 */
  emptyTitle?: string;
  emptyDesc?: string;
  /** 加载态占位行数；仪表盘卡片更高，需要更多行。 */
  skeletonRows?: number;
  sectionFiltered: boolean;
  sectionName?: string;
  onRetry?: () => void;
  onLogin?: () => void;
  onResetSection?: () => void;
  /** 是否允许从行尾进入帖子详情（弹窗用）。 */
  expandable?: boolean;
  onExpand?: (topic: Topic) => void;
  /**
   * 「最新评论」：同一用户连续发布达到折叠阈值时只展示第一条，其余可展开。
   * 由设置里的「折叠连续评论」控制，默认关闭。
   */
  collapseRuns?: boolean;
  /** 折叠阈值；不传时按默认 3 条处理。 */
  collapseRunThreshold?: number;
}

export function FeedSkeleton({
  rows = 6,
  compact = false,
  showRank = true,
  titleOnly = false,
  oneLine = false,
  variant = 'topic',
}: {
  rows?: number;
  compact?: boolean;
  showRank?: boolean;
  titleOnly?: boolean;
  oneLine?: boolean;
  variant?: FeedVariant;
}) {
  if (variant === 'collection') {
    return (
      <div className="feed-skeleton feed-skeleton--collection" aria-hidden="true">
        {Array.from({ length: rows }).map((_, index) => (
          <div className="collection-skeleton" key={index}>
            <span className="skeleton collection-skeleton__icon" />
            <div className="collection-skeleton__body">
              <span className="skeleton skeleton--line collection-skeleton__title" />
              <span className="skeleton skeleton--line skeleton--short" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'comment') {
    return (
      <div
        className={`feed-skeleton feed-skeleton--comment${
          compact ? ' feed-skeleton--compact' : ''
        }${titleOnly || oneLine ? ' feed-skeleton--comment-dense' : ''}`}
        aria-hidden="true"
      >
        {Array.from({ length: rows }).map((_, index) => (
          <div className="comment-skeleton" key={index}>
            <span className="skeleton comment-skeleton__avatar" />
            <div className="comment-skeleton__body">
              <span className="skeleton skeleton--line comment-skeleton__head" />
              <span className="skeleton skeleton--title comment-skeleton__content" />
              <span className="skeleton skeleton--line comment-skeleton__foot" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={`feed-skeleton${compact ? ' feed-skeleton--compact' : ''}${
        showRank ? '' : ' feed-skeleton--no-rank'
      }${titleOnly ? ' feed-skeleton--title-only' : ''}${oneLine ? ' feed-skeleton--one-line' : ''}`}
      aria-hidden="true"
    >
      {Array.from({ length: rows }).map((_, index) => (
        <div className="feed-skeleton__row" key={index}>
          {showRank && <span className="skeleton skeleton--line feed-skeleton__rank" />}
          <div className="feed-skeleton__body">
            <span className="skeleton skeleton--title" />
            {titleOnly && !oneLine && (
              <span className="skeleton skeleton--title skeleton--short" />
            )}
            {!titleOnly && (
              <span className="skeleton skeleton--line skeleton--short feed-skeleton__meta" />
            )}
          </div>
          {titleOnly && <span className="skeleton skeleton--line feed-skeleton__reply" />}
        </div>
      ))}
    </div>
  );
}

export function PostList({
  items,
  status,
  error,
  compact = false,
  showRank = true,
  titleOnly = false,
  oneLine = false,
  variant = 'topic',
  emojis,
  collectionOwner,
  emptyTitle: emptyTitleProp,
  emptyDesc: emptyDescProp,
  skeletonRows = 7,
  sectionFiltered,
  sectionName,
  onRetry,
  onLogin,
  onResetSection,
  expandable = false,
  onExpand,
  collapseRuns = false,
  collapseRunThreshold = COMMENT_RUN_DEFAULT_LENGTH,
}: PostListProps) {
  const { readKeys, markRead } = useReadItemsContext();
  const collapse = collapseRuns && variant === 'comment';
  const [expandedRuns, setExpandedRuns] = useState<ReadonlySet<string>>(() => new Set());
  const blocks = useMemo(
    () =>
      collapse ? groupConsecutiveComments(items, collapseRunThreshold) : null,
    [collapse, collapseRunThreshold, items],
  );

  const toggleRun = (key: string) => {
    setExpandedRuns((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderItem = (item: FeedItem, index: number) =>
    item.kind === 'collection' ? (
      <CollectionRow
        key={item.key}
        collection={item.collection}
        owner={collectionOwner}
        compact={compact}
      />
    ) : item.kind === 'comment' ? (
      <CommentRow
        key={item.key}
        comment={item.comment}
        compact={compact}
        dense={titleOnly || oneLine}
        emojis={emojis}
        isRead={readKeys.has(item.key)}
        onRead={() => markRead(item.key)}
      />
    ) : item.kind === 'topic' ? (
      <PostRow
        key={item.key}
        topic={item.topic}
        index={index}
        compact={compact}
        showRank={showRank}
        titleOnly={titleOnly}
        oneLine={oneLine}
        isRead={readKeys.has(item.key)}
        onRead={() => markRead(item.key)}
        expandable={expandable}
        emojis={emojis}
        onExpand={
          expandable
            ? () => {
                markRead(item.key);
                onExpand?.(item.topic);
              }
            : undefined
        }
      />
    ) : null;

  if (status === 'loading' || status === 'idle') {
    return (
      <FeedSkeleton
        compact={compact}
        showRank={showRank}
        titleOnly={titleOnly}
        oneLine={oneLine}
        variant={variant}
        rows={skeletonRows}
      />
    );
  }

  if (status === 'error') {
    const info = describeError(error);
    return (
      <div className="feed-state">
        <div className="banner banner--error" role="alert">
          <Icon name="alert" size={17} className="banner__icon" />
          <div className="banner__body">
            <strong className="banner__title">{info.title}</strong>
            {info.detail && <span>{info.detail}</span>}
            <div className="banner__actions">
              {info.action === 'login' && onLogin && (
                <button type="button" className="btn btn--sm btn--primary" onClick={onLogin}>
                  登录
                </button>
              )}
              {info.action !== 'none' && onRetry && (
                <button type="button" className="btn btn--sm" onClick={onRetry}>
                  重试
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    const defaultTitle =
      variant === 'comment'
        ? '还没有最新评论'
        : variant === 'collection'
          ? '还没有合集'
          : sectionFiltered
            ? '这个分区暂时没有帖子'
            : '没有拿到帖子';
    const defaultDesc =
      variant === 'comment'
        ? '全站暂时没有新评论，刷新一次试试。'
        : variant === 'collection'
          ? '创建合集后，会出现在这里。'
          : sectionFiltered
            ? `「${sectionName ?? '当前分区'}」还没有可展示的内容，换个分区或看看全站。`
            : '可能刚好没有内容，刷新一次试试。';
    const emptyTitle = emptyTitleProp ?? defaultTitle;
    const emptyDesc = emptyDescProp ?? defaultDesc;

    return (
      <div className="empty">
        <span className="empty__title">{emptyTitle}</span>
        <span className="empty__desc">{emptyDesc}</span>
        <div className="empty__actions">
          {sectionFiltered && onResetSection && (
            <button type="button" className="btn btn--primary btn--sm" onClick={onResetSection}>
              看看全站
            </button>
          )}
          {onRetry && (
            <button type="button" className="btn btn--sm" onClick={onRetry}>
              刷新
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <ol
      className={`feed-list${compact ? ' feed-list--compact' : ''}${
        showRank ? '' : ' feed-list--no-rank'
      }${titleOnly ? ' feed-list--title-only' : ''}${oneLine ? ' feed-list--one-line' : ''}${
        variant === 'comment' ? ' feed-list--comments' : ''
      }${variant === 'collection' ? ' feed-list--collections' : ''}`}
    >
      {blocks
        ? blocks.map((block, index) =>
            block.kind === 'run' ? (
              <CommentRun
                key={`run:${block.key}`}
                run={block}
                open={expandedRuns.has(block.key)}
                compact={compact}
                dense={titleOnly || oneLine}
                emojis={emojis}
                readKeys={readKeys}
                onRead={markRead}
                onToggle={() => toggleRun(block.key)}
              />
            ) : (
              renderItem(block.item, index)
            ),
          )
        : items.map((item, index) => renderItem(item, index))}
    </ol>
  );
}
