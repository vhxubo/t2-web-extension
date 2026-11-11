import { relativeTime, rankLabel } from '../lib/format';
import { topicHref } from '../lib/feed';
import type { Topic } from '../lib/types';
import { Icon } from './Icon';

interface PostRowProps {
  topic: Topic;
  index: number;
  compact?: boolean;
  showRank?: boolean;
  /** 只显示标题，省略分区、作者和时间；回复数固定在行尾（弹窗用）。 */
  titleOnly?: boolean;
  /** 标题单行截断，回复数只保留数字（弹窗 Dock 布局用）。 */
  oneLine?: boolean;
  /** 已经点开过：整行置灰。 */
  isRead?: boolean;
  /** 点击原帖时记录已读。 */
  onRead?: () => void;
  /** 行尾是否显示「查看详情」按钮（弹窗用）。 */
  expandable?: boolean;
  onExpand?: () => void;
}

export function PostRow({
  topic,
  index,
  compact = false,
  showRank = true,
  titleOnly = false,
  oneLine = false,
  isRead = false,
  onRead,
  expandable = false,
  onExpand,
}: PostRowProps) {
  const author = topic.author?.username ?? '匿名';
  const nodeName = topic.node?.name ?? topic.node?.slug ?? '未分区';
  const comments = topic.comment_count ?? 0;
  const hot = typeof topic.hotScore === 'number' ? Math.round(topic.hotScore) : null;
  const typeLabel =
    topic.type === 'anonymous' ? '匿名' : topic.type === 'moment' ? '动态' : null;

  return (
    <li
      className={`feed-row${compact ? ' feed-row--compact' : ''}${
        titleOnly ? ' feed-row--title-only' : ''
      }${oneLine ? ' feed-row--one-line' : ''}${isRead ? ' feed-row--read' : ''}${
        expandable ? ' feed-row--expandable' : ''
      }`}
    >
      <div className="feed-row__main">
        <a
          className="feed-row__link"
          href={topicHref(topic)}
          target="_blank"
          rel="noreferrer"
          title={topic.title ? `${topic.title} · 打开原帖` : '打开原帖'}
          onClick={onRead}
          onAuxClick={(event) => {
            if (event.button === 1) onRead?.();
          }}
        >
          {showRank && (
            <span className="feed-row__rank t2-mono" aria-hidden="true">
              {rankLabel(index)}
            </span>
          )}

          <span className="feed-row__body">
            <span className="feed-row__title">
              {topic.is_pinned && <span className="chip chip--pin">置顶</span>}
              {typeLabel && <span className="chip">{typeLabel}</span>}
              <span className="feed-row__titletext">{topic.title || '（无标题）'}</span>
            </span>

            {!titleOnly && (
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
            )}
          </span>

          {titleOnly ? (
            <span className="feed-row__stats">
              <span className="feed-row__stat" aria-label={`${comments} 条回复`}>
                <b className="t2-mono">{comments}</b>
                <i>回复</i>
              </span>
            </span>
          ) : (
            !compact && (
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
            )
          )}
        </a>

        {expandable && (
          <button
            type="button"
            className="feed-row__expand"
            onClick={onExpand}
            aria-label={`查看「${topic.title || '帖子'}」详情`}
            title="查看详情"
          >
            <Icon name="chevron" size={13} />
          </button>
        )}
      </div>
    </li>
  );
}
