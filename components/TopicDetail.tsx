import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError } from '../lib/api';
import type { EmojiMap } from '../lib/emojis';
import { describeError } from '../lib/errors';
import { compactNumber, dateTime, relativeTime } from '../lib/format';
import { profileHref } from '../lib/nav';
import {
  isNormalTopicType,
  loadTopicDetail,
  setTopicFavorite,
  topicNodeHref,
  topicTypeLabel,
  type TopicDetail as TopicDetailData,
} from '../lib/topics';
import type { Topic } from '../lib/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { TopicMarkdown } from './TopicMarkdown';

interface TopicDetailProps {
  topic: Topic;
  emojis: EmojiMap;
  signedIn: boolean;
  /** 未登录点收藏时跳到设置页完成授权。 */
  onLogin: () => void;
  /** 外部触发重新拉取（弹窗 Header 的刷新按钮）。 */
  refreshToken?: number;
  /** 把加载状态交给外层，让刷新按钮的旋转动画跟着详情走。 */
  onLoadingChange?: (loading: boolean) => void;
}

type LoadStatus = 'loading' | 'ready' | 'error';

/**
 * 弹窗二级页里的帖子详情。
 *
 * 只拉 `GET /v1/topics/:short_id`（标题、正文、类型、分区、作者、发布时间），
 * 不请求评论；评论区固定在原帖，底部只给一个跳转入口。
 */
export function TopicDetail({
  topic,
  emojis,
  signedIn,
  onLogin,
  refreshToken = 0,
  onLoadingChange,
}: TopicDetailProps) {
  const [detail, setDetail] = useState<TopicDetailData | null>(null);
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [error, setError] = useState<unknown>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [favorited, setFavorited] = useState(false);
  const [favoritePending, setFavoritePending] = useState(false);
  const [favoriteError, setFavoriteError] = useState<unknown>(null);
  const [favoriteNotice, setFavoriteNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setStatus('loading');
    setError(null);
    setDetail(null);
    onLoadingChange?.(true);

    loadTopicDetail(topic.short_id, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setDetail(data);
        setFavorited(data.favorited === true);
        setStatus('ready');
        onLoadingChange?.(false);
      })
      .catch((cause) => {
        if (controller.signal.aborted) return;
        if (cause instanceof DOMException && cause.name === 'AbortError') return;
        setError(cause);
        setStatus('error');
        onLoadingChange?.(false);
      });

    return () => {
      controller.abort();
      onLoadingChange?.(false);
    };
    // onLoadingChange 由外层传稳定的 setState；放进依赖会让每次渲染都重新请求。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic.short_id, refreshToken, reloadToken]);

  // 「已收藏 / 已取消」这类反馈只停留一小会儿，不占着正文空间。
  useEffect(() => {
    if (!favoriteNotice) return;
    const timer = window.setTimeout(() => setFavoriteNotice(null), 2200);
    return () => window.clearTimeout(timer);
  }, [favoriteNotice]);

  const retryDetail = useCallback(() => setReloadToken((value) => value + 1), []);

  const handleFavorite = useCallback(async () => {
    if (!signedIn) {
      onLogin();
      return;
    }
    if (favoritePending) return;

    const target = !favorited;
    setFavoritePending(true);
    setFavoriteError(null);
    setFavoriteNotice(null);

    try {
      await setTopicFavorite(topic.short_id, target);
      setFavorited(target);
      setFavoriteNotice(target ? '已加入收藏' : '已取消收藏');
    } catch (cause) {
      // 重复收藏 / 取消收藏服务端可能回 409；目标状态已经成立，按成功处理。
      if (cause instanceof ApiError && cause.status === 409) {
        setFavorited(target);
        setFavoriteNotice(target ? '这条帖子已经在收藏里了' : '已取消收藏');
      } else {
        setFavoriteError(cause);
      }
    } finally {
      setFavoritePending(false);
    }
  }, [favorited, favoritePending, onLogin, signedIn, topic.short_id]);

  const meta = detail ?? topic;
  // 普通帖是绝大多数，不挂类型标签；只把匿名 / 动态这类特殊类型标出来。
  const typeLabel = isNormalTopicType(meta.type) ? null : topicTypeLabel(meta.type);
  const nodeLabel = meta.node?.name || meta.node?.slug || '未分区';
  const author = meta.author?.username?.trim() ?? '';
  const authorName = author || '匿名';
  const createdAt = meta.created_at;
  const views = meta.views;

  const detailErrorInfo = error ? describeError(error) : null;
  const favoriteErrorInfo = favoriteError ? describeError(favoriteError) : null;

  const postscripts = useMemo(
    () =>
      (detail?.postscripts ?? []).filter(
        (item): item is { id?: string; content: string; created_at?: string } =>
          typeof item?.content === 'string' && item.content.trim().length > 0,
      ),
    [detail?.postscripts],
  );

  return (
    <section className="topic-detail" aria-label="帖子详情">
      <header className="topic-detail__head">
        <div className="topic-detail__badges">
          {typeLabel && <span className="chip chip--leaf">{typeLabel}</span>}
          <a
            className="topic-detail__node"
            href={topicNodeHref(meta.node)}
            target="_blank"
            rel="noreferrer"
            title={`打开节点：${nodeLabel}`}
          >
            {nodeLabel}
          </a>
          {meta.is_pinned && <span className="chip chip--pin">置顶</span>}
          {detail?.comments_closed && <span className="chip">评论已关闭</span>}
        </div>

        <div className="topic-detail__meta">
          <span className="topic-detail__avatar">
            <Avatar src={meta.author?.avatar_url} name={authorName} />
          </span>
          {author ? (
            <a
              className="topic-detail__author"
              href={profileHref(author)}
              target="_blank"
              rel="noreferrer"
              title={`打开 @${author} 的主页`}
            >
              @{author}
            </a>
          ) : (
            <span className="topic-detail__author">匿名</span>
          )}
          <span className="topic-detail__dot" aria-hidden="true">
            ·
          </span>
          <time
            className="topic-detail__time"
            dateTime={createdAt}
            title={createdAt ? `发布于 ${relativeTime(createdAt)}` : undefined}
          >
            {dateTime(createdAt) || '发布时间未知'}
          </time>
          {typeof views === 'number' && views > 0 && (
            <>
              <span className="topic-detail__dot" aria-hidden="true">
                ·
              </span>
              <span className="topic-detail__views t2-mono">{compactNumber(views)} 浏览</span>
            </>
          )}
          <button
            type="button"
            className={`topic-detail__favorite${favorited ? ' is-on' : ''}`}
            onClick={() => void handleFavorite()}
            disabled={favoritePending}
            aria-pressed={favorited}
            title={
              !signedIn
                ? '登录后可收藏帖子'
                : favorited
                  ? '取消收藏'
                  : '加入收藏（同步到站点）'
            }
          >
            <Icon name={favorited ? 'check' : 'bookmark'} size={11} />
            <span>
              {favoritePending
                ? '处理中…'
                : !signedIn
                  ? '登录后收藏'
                  : favorited
                    ? '已收藏'
                    : '收藏'}
            </span>
          </button>
        </div>
      </header>

      <h2 className="topic-detail__title">{meta.title || topic.title || '（无标题）'}</h2>

      {status === 'loading' ? (
        <div className="topic-detail__loading" aria-label="正在加载帖子详情" aria-busy="true">
          <span className="skeleton skeleton--line" />
          <span className="skeleton skeleton--line" />
          <span className="skeleton skeleton--line skeleton--short" />
        </div>
      ) : status === 'error' && detailErrorInfo ? (
        <div className="banner banner--error topic-detail__banner" role="alert">
          <Icon name="alert" size={15} className="banner__icon" />
          <div className="banner__body">
            <strong className="banner__title">{detailErrorInfo.title}</strong>
            {detailErrorInfo.detail && <span>{detailErrorInfo.detail}</span>}
            <div className="banner__actions">
              {detailErrorInfo.action === 'login' && (
                <button type="button" className="btn btn--sm btn--primary" onClick={onLogin}>
                  登录
                </button>
              )}
              {detailErrorInfo.action !== 'none' && (
                <button type="button" className="btn btn--sm" onClick={retryDetail}>
                  重试
                </button>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          <TopicMarkdown content={detail?.content} emojis={emojis} />
          {postscripts.map((item, index) => (
            <div className="topic-detail__postscript" key={item.id ?? `postscript-${index}`}>
              <span className="topic-detail__postscript-label">
                附言
                {item.created_at ? ` · ${dateTime(item.created_at)}` : ''}
              </span>
              <TopicMarkdown content={item.content} emojis={emojis} />
            </div>
          ))}
        </>
      )}

      {favoriteNotice && (
        <p className="topic-detail__notice" role="status">
          {favoriteNotice}
        </p>
      )}

      {favoriteErrorInfo && (
        <div className="topic-detail__action-error" role="alert">
          <span>
            {favoriteErrorInfo.title}
            {favoriteErrorInfo.detail ? `：${favoriteErrorInfo.detail}` : ''}
          </span>
          {favoriteErrorInfo.action === 'login' && (
            <button type="button" className="btn btn--sm btn--primary" onClick={onLogin}>
              重新授权
            </button>
          )}
          {favoriteErrorInfo.action === 'retry' && (
            <button type="button" className="btn btn--sm" onClick={() => void handleFavorite()}>
              重试
            </button>
          )}
        </div>
      )}
    </section>
  );
}
