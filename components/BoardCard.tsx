import type { BoardMeta } from '../lib/boards';
import { describeError } from '../lib/errors';
import { useFeed } from '../hooks/useFeed';
import type { ApiNode, Section } from '../lib/types';
import { Icon } from './Icon';
import { PostList } from './PostList';

const ALL_SITES: Section = { kind: 'all' };

interface BoardCardProps {
  meta: BoardMeta;
  /** 当前选中的分区；不支持分区的榜单会自动按全站展示。 */
  section: Section;
  sectionName: string;
  nodes: ApiNode[];
  nodesReady: boolean;
  limit: number;
  enabled: boolean;
  onLogin: () => void;
  onResetSection: () => void;
}

export function BoardCard({
  meta,
  section,
  sectionName,
  nodes,
  nodesReady,
  limit,
  enabled,
  onLogin,
  onResetSection,
}: BoardCardProps) {
  const scoped = meta.supportsSection && section.kind !== 'all';
  const sectionFiltered = scoped;

  const feed = useFeed({
    board: meta.id,
    section: meta.supportsSection ? section : ALL_SITES,
    nodes,
    nodesReady: meta.supportsSection && section.kind === 'node' ? nodesReady : true,
    limit,
    enabled,
  });

  const moreError = feed.moreError ? describeError(feed.moreError) : null;

  const hint = scoped
    ? `${meta.hint} · ${sectionName}`
    : !meta.supportsSection && section.kind !== 'all'
      ? `${meta.hint} · 全站`
      : meta.hint;

  return (
    <section className="board-card" aria-labelledby={`board-title-${meta.id}`}>
      <header className="board-card__head">
        <div className="board-card__heading">
          <div className="board-card__title-row">
            <h2 className="board-card__title t2-serif" id={`board-title-${meta.id}`}>
              {meta.label}
            </h2>
            {!meta.supportsSection && section.kind !== 'all' && (
              <span className="board-card__scope" title="这个榜单不支持按分区筛选">
                全站
              </span>
            )}
          </div>
          <p className="board-card__hint" title={hint}>
            {hint}
          </p>
        </div>

        <div className="board-card__actions">
          <button
            type="button"
            className="btn btn--icon board-card__refresh"
            onClick={() => void feed.reload()}
            title={`刷新${meta.label}`}
            aria-label={`刷新${meta.label}`}
            data-spinning={feed.status === 'loading'}
          >
            <Icon name="refresh" size={15} />
          </button>
        </div>
      </header>

      <div className="board-card__body">
        <PostList
          items={feed.items}
          status={feed.status}
          error={feed.error}
          compact
          sectionFiltered={sectionFiltered}
          sectionName={sectionName}
          onRetry={() => void feed.reload()}
          onLogin={onLogin}
          onResetSection={onResetSection}
        />
      </div>

      {feed.status === 'ready' && feed.items.length > 0 && (
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
