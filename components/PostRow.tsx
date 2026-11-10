import { relativeTime, rankLabel } from '../lib/format';
import { topicHref } from '../lib/feed';
import type { Topic } from '../lib/types';

interface PostRowProps {
  topic: Topic;
  index: number;
  compact?: boolean;
}

export function PostRow({ topic, index, compact = false }: PostRowProps) {
  const author = topic.author?.username ?? '匿名';
  const nodeName = topic.node?.name ?? topic.node?.slug ?? '未分区';
  const comments = topic.comment_count ?? 0;
  const hot = typeof topic.hotScore === 'number' ? Math.round(topic.hotScore) : null;
  const typeLabel =
    topic.type === 'anonymous' ? '匿名' : topic.type === 'moment' ? '动态' : null;

  return (
    <li className={`feed-row${compact ? ' feed-row--compact' : ''}`}>
      <a
        className="feed-row__link"
        href={topicHref(topic)}
        target="_blank"
        rel="noreferrer"
        title={topic.title ? `${topic.title} · 打开原帖` : '打开原帖'}
      >
        <span className="feed-row__rank t2-mono" aria-hidden="true">
          {rankLabel(index)}
        </span>

        <span className="feed-row__body">
          <span className="feed-row__title t2-serif">
            {topic.is_pinned && <span className="chip chip--pin">置顶</span>}
            {typeLabel && <span className="chip">{typeLabel}</span>}
            <span className="feed-row__titletext">{topic.title || '（无标题）'}</span>
          </span>

          <span className="feed-row__meta">
            <span className="feed-row__node">{nodeName}</span>
            <span className="feed-row__sep" aria-hidden="true">
              ·
            </span>
            <span className="feed-row__author">{author}</span>
            <span className="feed-row__sep" aria-hidden="true">
              ·
            </span>
            <time className="feed-row__time" dateTime={topic.created_at}>
              {relativeTime(topic.created_at)}
            </time>
            {compact && (
              <>
                <span className="feed-row__sep" aria-hidden="true">
                  ·
                </span>
                <span className="feed-row__comment-inline t2-mono">{comments} 回复</span>
              </>
            )}
          </span>
        </span>

        {!compact && (
          <span className="feed-row__stats" aria-hidden="true">
            <span className="feed-row__stat">
              <b className="t2-mono">{comments}</b>
              <i>回复</i>
            </span>
            {hot !== null && (
              <span className="feed-row__stat feed-row__stat--hot">
                <b className="t2-mono">{hot}</b>
                <i>热度</i>
              </span>
            )}
          </span>
        )}
      </a>
    </li>
  );
}
