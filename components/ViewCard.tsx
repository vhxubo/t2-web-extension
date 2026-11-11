import type { FeedStatus } from '../hooks/useFeed';
import { useFeed } from '../hooks/useFeed';
import { useEmojiMap } from '../hooks/useEmojis';
import type { NodesStatus } from '../hooks/useNodes';
import { describeError } from '../lib/errors';
import type { ApiNode } from '../lib/types';
import type { ResolvedView } from '../lib/views';
import { Icon } from './Icon';
import { PostList } from './PostList';

interface ViewCardProps {
  view: ResolvedView;
  nodes: ApiNode[];
  nodesStatus: NodesStatus;
  enabled: boolean;
  index: number;
  onLogin: () => void;
  onReloadNodes: () => void;
}

/** 仪表盘上一张可配置的卡片：内置榜单或某个节点。 */
export function ViewCard({
  view,
  nodes,
  nodesStatus,
  enabled,
  index,
  onLogin,
  onReloadNodes,
}: ViewCardProps) {
  const isComments = view.board === 'comments';
  const emojis = useEmojiMap(isComments);
  const needsNodes = view.kind === 'section' && view.section.kind !== 'all';
  const nodePending = needsNodes && nodesStatus === 'loading';
  const nodeMissing = needsNodes && nodesStatus !== 'loading' && !view.available;

  const feed = useFeed({
    board: view.kind === 'board' ? view.board : undefined,
    section: view.section,
    nodes,
    nodesReady: !needsNodes || nodesStatus !== 'loading',
    limit: view.pageSize,
    enabled: enabled && !nodePending && !nodeMissing,
  });

  const moreError = feed.moreError ? describeError(feed.moreError) : null;
  const nodeError = nodeMissing
    ? new Error(
        nodesStatus === 'error'
          ? '节点列表加载失败，暂时没法读取这个节点。'
          : `节点「${view.label}」已经不存在，请到节点配置里移除。`,
      )
    : null;
  const status: FeedStatus = nodeMissing
    ? 'error'
    : nodePending
      ? 'loading'
      : feed.status;
  const error = nodeError ?? feed.error;

  const handleRetry = () => {
    if (nodeMissing) {
      onReloadNodes();
      return;
    }
    void feed.reload();
  };

  return (
    <section
      className={`board-card${nodeMissing ? ' board-card--missing' : ''}`}
      data-view-id={view.id}
      data-board={view.board}
      aria-labelledby={`view-card-title-${view.id}`}
      style={{ animationDelay: `${Math.min(index, 8) * 0.04}s` }}
    >
      <header className="board-card__head">
        <span className="board-card__icon" aria-hidden="true">
          {view.icon}
        </span>
        <h2
          className="board-card__title"
          id={`view-card-title-${view.id}`}
          title={view.hint}
        >
          {view.label}
        </h2>
        {view.sourceLabel !== '榜单' && (
          <span className="board-card__tag">{view.sourceLabel}</span>
        )}
        <button
          type="button"
          className="btn btn--icon board-card__refresh"
          onClick={() => void feed.reload()}
          title={`刷新${view.label}`}
          aria-label={`刷新${view.label}`}
          data-spinning={feed.status === 'loading'}
          disabled={nodeMissing}
        >
          <Icon name="refresh" size={14} />
        </button>
      </header>

      <div className="board-card__body">
        <PostList
          items={nodePending || nodeMissing ? [] : feed.items}
          status={status}
          error={error}
          compact
          variant={isComments ? 'comment' : 'topic'}
          emojis={emojis}
          sectionFiltered={view.section.kind !== 'all'}
          sectionName={view.label}
          onRetry={handleRetry}
          onLogin={onLogin}
        />
      </div>

      {feed.status === 'ready' && !nodeMissing && (
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
          ) : isComments ? (
            <span className="board-card__end">— 仅展示最近 {feed.items.length} 条 —</span>
          ) : (
            <span className="board-card__end">— 到底了 —</span>
          )}
        </footer>
      )}
    </section>
  );
}
