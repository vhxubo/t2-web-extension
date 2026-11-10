import { rankLabel, relativeTime } from '../lib/format';
import { scoreHref } from '../lib/feed';
import type { ScoreEntry } from '../lib/types';

interface ScoreRowProps {
  entry: ScoreEntry;
  index: number;
  compact?: boolean;
}

export function ScoreRow({ entry, index, compact = false }: ScoreRowProps) {
  const score = entry.score ?? { target_name: '评分', score: undefined, comment: '', category: '', created_at: '' };
  const author = entry.author?.username ?? '匿名';
  const value = typeof score.score === 'number' ? score.score : null;

  return (
    <li className={`feed-row feed-row--score${compact ? ' feed-row--compact' : ''}`}>
      <a
        className="feed-row__link"
        href={scoreHref(entry)}
        target="_blank"
        rel="noreferrer"
        title={`${score.target_name ?? '评分'} · 打开原帖`}
      >
        <span className="feed-row__rank t2-mono" aria-hidden="true">
          {rankLabel(index)}
        </span>

        <span className="score-pill" aria-hidden="true">
          <b className="t2-mono">{value ?? '—'}</b>
          <i>分</i>
        </span>

        <span className="feed-row__body">
          <span className="feed-row__title t2-serif">
            {score.category && <span className="chip chip--gold">{score.category}</span>}
            <span className="feed-row__titletext">{score.target_name || '未命名评分'}</span>
          </span>

          {score.comment && (
            <span className="feed-row__excerpt">{score.comment}</span>
          )}

          <span className="feed-row__meta">
            <span className="feed-row__author">{author}</span>
            <span className="feed-row__sep" aria-hidden="true">
              ·
            </span>
            <time className="feed-row__time" dateTime={score.created_at}>
              {relativeTime(score.created_at)}
            </time>
            {!compact && (
              <>
                <span className="feed-row__sep" aria-hidden="true">
                  ·
                </span>
                <span className="feed-row__hint">在帖子里评分</span>
              </>
            )}
          </span>
        </span>
      </a>
    </li>
  );
}
