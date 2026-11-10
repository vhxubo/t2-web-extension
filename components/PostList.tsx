import type { FeedItem } from '../lib/feed';
import type { FeedStatus } from '../hooks/useFeed';
import { describeError } from '../lib/errors';
import { Icon } from './Icon';
import { PostRow } from './PostRow';

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
  sectionFiltered: boolean;
  sectionName?: string;
  onRetry?: () => void;
  onLogin?: () => void;
  onResetSection?: () => void;
}

export function FeedSkeleton({
  rows = 6,
  compact = false,
  showRank = true,
  titleOnly = false,
  oneLine = false,
}: {
  rows?: number;
  compact?: boolean;
  showRank?: boolean;
  titleOnly?: boolean;
  oneLine?: boolean;
}) {
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
  sectionFiltered,
  sectionName,
  onRetry,
  onLogin,
  onResetSection,
}: PostListProps) {
  if (status === 'loading' || status === 'idle') {
    return (
      <FeedSkeleton
        compact={compact}
        showRank={showRank}
        titleOnly={titleOnly}
        oneLine={oneLine}
        rows={7}
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
    return (
      <div className="empty">
        <span className="empty__title">
          {sectionFiltered ? '这个分区暂时没有帖子' : '没有拿到帖子'}
        </span>
        <span className="empty__desc">
          {sectionFiltered
            ? `「${sectionName ?? '当前分区'}」还没有可展示的内容，换个分区或看看全站。`
            : '可能刚好没有内容，刷新一次试试。'}
        </span>
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
      }${titleOnly ? ' feed-list--title-only' : ''}${oneLine ? ' feed-list--one-line' : ''}`}
    >
      {items.map((item, index) => (
        <PostRow
          key={item.key}
          topic={item.topic}
          index={index}
          compact={compact}
          showRank={showRank}
          titleOnly={titleOnly}
          oneLine={oneLine}
        />
      ))}
    </ol>
  );
}
