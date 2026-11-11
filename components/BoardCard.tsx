import type { BoardMeta } from '../lib/boards';
import { describeError } from '../lib/errors';
import { useFeed } from '../hooks/useFeed';
import type { ApiNode, Section } from '../lib/types';
import { Icon } from './Icon';
import { PostList } from './PostList';

/** 完整页面只展示全站榜单，页面上不再提供分区切换。 */
const ALL_SITES: Section = { kind: 'all' };
const NO_NODES: ApiNode[] = [];

interface BoardCardProps {
  meta: BoardMeta;
  enabled: boolean;
  onLogin: () => void;
}

export function BoardCard({ meta, enabled, onLogin }: BoardCardProps) {
  const feed = useFeed({
    board: meta.id,
    section: ALL_SITES,
    nodes: NO_NODES,
    nodesReady: true,
    limit: meta.pageSize,
    enabled,
  });

  const moreError = feed.moreError ? describeError(feed.moreError) : null;

  return (
    <section
      className="board-card"
      data-board={meta.id}
      aria-labelledby={`board-title-${meta.id}`}
    >
      <header className="board-card__head">
        <span className="board-card__icon" aria-hidden="true">
          {meta.icon}
        </span>
        <h2 className="board-card__title" id={`board-title-${meta.id}`} title={meta.hint}>
          {meta.label}
        </h2>
        <button
          type="button"
          className="btn btn--icon board-card__refresh"
          onClick={() => void feed.reload()}
          title={`刷新${meta.label}`}
          aria-label={`刷新${meta.label}`}
          data-spinning={feed.status === 'loading'}
        >
          <Icon name="refresh" size={14} />
        </button>
      </header>

      <div className="board-card__body">
        <PostList
          items={feed.items}
          status={feed.status}
          error={feed.error}
          compact
          sectionFiltered={false}
          onRetry={() => void feed.reload()}
          onLogin={onLogin}
        />
      </div>

      {feed.status === 'ready' && (
        <footer className="board-card__foot">
          {moreError ? (
            <div className="board-card__more-error" role="alert">
              <span>{moreError.title}</span>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => void feed.loadMore()}
              >
                重试
              </button>
            </div>
          ) : feed.hasMore ? (
            <button
              type="button"
              className="btn board-card__more"
              onClick={() => void feed.loadMore()}
              disabled={feed.loadingMore}
            >
              {feed.loadingMore ? '加载中…' : '加载更多'}
            </button>
          ) : (
            <span className="board-card__end">— 到底了 —</span>
          )}
        </footer>
      )}
    </section>
  );
}
