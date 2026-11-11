import { useCallback, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { PostRow } from './PostRow';
import { useReadItemsContext } from './ReadItems';
import { useSearch } from '../hooks/useSearch';
import { describeError } from '../lib/errors';
import { compactNumber, relativeTime } from '../lib/format';
import {
  favoriteCreatedAt,
  favoriteHref,
  favoriteTitle,
  nodeHref,
  SEARCH_MAX_LENGTH,
  SEARCH_RATE_LIMITS,
  searchTypesFor,
  tagHref,
  type SearchFavorite,
  type SearchNode,
  type SearchResults,
  type SearchTag,
  type SearchType,
  type SearchUser,
} from '../lib/search';
import { profileHref } from '../lib/nav';

interface SearchDialogProps {
  open: boolean;
  onClose: () => void;
  signedIn: boolean;
  /** 弹窗（392×480）里空间更紧：缩小内边距，隐藏键盘提示。 */
  compact?: boolean;
  /** 令牌失效时的重新登录入口。 */
  onLogin?: () => void;
}

function summaryOf(results: SearchResults): string {
  switch (results.type) {
    case 'posts':
      return `共 ${compactNumber(results.total)} 条结果 · 展示前 ${results.posts.length} 条`;
    case 'users':
      return `${results.users.length} 个用户`;
    case 'nodes':
      return `${results.nodes.length} 个节点`;
    case 'tags':
      return `${results.tags.length} 个标签`;
    case 'favorites':
      return `${results.favorites.length} 条收藏`;
  }
}

const EMPTY_LABELS: Record<SearchType, string> = {
  posts: '相关帖子',
  users: '相关用户',
  nodes: '相关节点',
  tags: '相关标签',
  favorites: '相关收藏',
};

function SearchSkeleton() {
  return (
    <div className="search-skeleton" aria-hidden="true">
      {Array.from({ length: 5 }).map((_, index) => (
        <div className="search-skeleton__row" key={index}>
          <span className="skeleton search-skeleton__badge" />
          <div className="search-skeleton__body">
            <span className="skeleton skeleton--line" />
            <span className="skeleton skeleton--line skeleton--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

function UserRow({ user }: { user: SearchUser }) {
  const name = user.username?.trim();
  return (
    <a
      className="search-result"
      href={profileHref(name)}
      target="_blank"
      rel="noreferrer"
      title={name ? `打开 @${name} 的主页` : '打开站点'}
    >
      <Avatar src={user.avatar_url} name={name ?? '用户'} />
      <span className="search-result__body">
        <span className="search-result__title">
          <span className="search-result__name">{name ? `@${name}` : '未知用户'}</span>
          {user.is_pro && <span className="chip chip--gold">PRO</span>}
        </span>
        <span className="search-result__meta">
          {typeof user.level === 'number' ? `Lv.${user.level} · ` : ''}
          打开用户主页
        </span>
      </span>
      <Icon name="external" size={13} className="search-result__arrow" />
    </a>
  );
}

function NodeRow({ node }: { node: SearchNode }) {
  const name = node.name || node.slug || '未命名节点';
  const kind = node.parent_slug ? '子节点' : '父节点';
  const count =
    typeof node.post_count === 'number' ? `${compactNumber(node.post_count)} 帖` : '';
  return (
    <a
      className="search-result"
      href={nodeHref(node)}
      target="_blank"
      rel="noreferrer"
      title={`打开节点「${name}」`}
    >
      <span className="search-result__badge" aria-hidden="true">
        <Icon name="folder" size={15} />
      </span>
      <span className="search-result__body">
        <span className="search-result__title">
          <span className="search-result__name">{name}</span>
        </span>
        <span className="search-result__meta">
          {kind}
          {count ? ` · ${count}` : ''}
        </span>
      </span>
      <Icon name="external" size={13} className="search-result__arrow" />
    </a>
  );
}

function TagRow({ tag }: { tag: SearchTag }) {
  const name = tag.name?.trim();
  return (
    <a
      className="search-result"
      href={tagHref(name)}
      target="_blank"
      rel="noreferrer"
      title={name ? `打开标签「${name}」` : '打开站点'}
    >
      <span className="search-result__badge search-result__badge--tag" aria-hidden="true">
        #
      </span>
      <span className="search-result__body">
        <span className="search-result__title">
          <span className="search-result__name">{name ? `#${name}` : '未命名标签'}</span>
        </span>
        <span className="search-result__meta">
          {typeof tag.post_count === 'number' ? `${compactNumber(tag.post_count)} 帖` : '标签'}
        </span>
      </span>
      <Icon name="external" size={13} className="search-result__arrow" />
    </a>
  );
}

function FavoriteRow({ favorite }: { favorite: SearchFavorite }) {
  const href = favoriteHref(favorite);
  const title = favoriteTitle(favorite);
  const user = favorite.user ?? favorite.from_user ?? null;
  const author = user?.username?.trim();
  const createdAt = favoriteCreatedAt(favorite);
  const meta = [author ? `@${author}` : null, createdAt ? relativeTime(createdAt) : null]
    .filter(Boolean)
    .join(' · ');

  const body = (
    <>
      {author ? (
        <Avatar src={user?.avatar_url} name={author} />
      ) : (
        <span className="search-result__badge" aria-hidden="true">
          <Icon name="bookmark" size={15} />
        </span>
      )}
      <span className="search-result__body">
        <span className="search-result__title">
          <span className="search-result__name">{title}</span>
        </span>
        <span className="search-result__meta">{meta || '打开原帖'}</span>
      </span>
      {href && <Icon name="external" size={13} className="search-result__arrow" />}
    </>
  );

  if (!href) {
    return <div className="search-result search-result--static">{body}</div>;
  }

  return (
    <a
      className="search-result"
      href={href}
      target="_blank"
      rel="noreferrer"
      title={`${title} · 打开原帖`}
    >
      {body}
    </a>
  );
}

/**
 * 搜索弹窗：帖子 / 用户 / 节点 / 标签 / 收藏（登录后）。
 *
 * 搜索接口单独限流，所以这里只显示第一页，输入停顿 350ms 才发请求，
 * 结果在内存里缓存 5 分钟；429 会展示可读的等待时长。
 */
export function SearchDialog({
  open,
  onClose,
  signedIn,
  compact = false,
  onLogin,
}: SearchDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const { readKeys, markRead } = useReadItemsContext();

  const search = useSearch({ active: open, signedIn });
  const {
    query,
    setQuery,
    trimmed,
    type,
    setType,
    results,
    status,
    error,
    wait,
    submit,
    retry,
    clear,
    busy,
    minLength,
  } = search;

  const types = useMemo(() => searchTypesFor(signedIn), [signedIn]);
  const activeType = types.find((meta) => meta.id === type) ?? types[0];
  const activeId = activeType?.id ?? 'posts';

  // 退出登录后如果还停在「收藏」，回到第一个公开类型。
  useEffect(() => {
    if (!activeType) return;
    if (activeType.id !== type) setType(activeType.id);
  }, [activeType, type, setType]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const timer = window.setTimeout(() => {
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }, 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  const handleTabKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const current = types.findIndex((meta) => meta.id === activeId);
      if (current < 0) return;

      let next = current;
      if (event.key === 'ArrowRight') next = (current + 1) % types.length;
      else if (event.key === 'ArrowLeft') next = (current - 1 + types.length) % types.length;
      else if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = types.length - 1;
      else return;

      event.preventDefault();
      const target = types[next];
      if (!target) return;
      setType(target.id);
      tabRefs.current[next]?.focus();
    },
    [activeId, setType, types],
  );

  const currentResults =
    results && results.type === activeId && results.query === trimmed ? results : null;

  const errorInfo = status === 'error' ? describeError(error) : null;

  let content: ReactNode = null;

  if (trimmed.length === 0) {
    content = (
      <div className="search-empty search-empty--intro">
        <span className="search-empty__icon" aria-hidden="true">
          <Icon name="search" size={20} />
        </span>
        <strong className="search-empty__title">搜索 2Libra</strong>
        <span className="search-empty__desc">
          输入至少 {minLength} 个字符，停顿后自动搜索；按 Enter 立即搜索。
        </span>
        <div className="search-examples">
          {['职场', '前端', '读书'].map((word) => (
            <button
              key={word}
              type="button"
              className="search-example"
              onClick={() => {
                setType('posts');
                setQuery(word);
                inputRef.current?.focus();
              }}
            >
              {word}
            </button>
          ))}
        </div>
        <span className="search-empty__fine">
          搜索接口独立限流：未登录 {SEARCH_RATE_LIMITS.anonymous} 次/分，登录{' '}
          {SEARCH_RATE_LIMITS.signedIn} 次/分。
        </span>
      </div>
    );
  } else if (status === 'too-short') {
    content = (
      <div className="search-empty">
        <span className="search-empty__title">再输入一点</span>
        <span className="search-empty__desc">
          关键词至少 {minLength} 个字符，现在是 {trimmed.length} 个。
        </span>
      </div>
    );
  } else if (status === 'throttled') {
    content = (
      <div className="search-empty">
        <span className="search-empty__icon search-empty__icon--warn" aria-hidden="true">
          <Icon name="alert" size={19} />
        </span>
        <strong className="search-empty__title">搜索请求太频繁</strong>
        <span className="search-empty__desc">
          搜索接口单独限流：未登录 {SEARCH_RATE_LIMITS.anonymous} 次/分，登录{' '}
          {SEARCH_RATE_LIMITS.signedIn} 次/分。
          {wait > 0 ? `再等 ${wait} 秒后自动重试。` : '正在重试…'}
        </span>
        <div className="empty__actions">
          <button
            type="button"
            className="btn btn--sm"
            onClick={retry}
            disabled={wait > 0}
          >
            立即重试
          </button>
        </div>
      </div>
    );
  } else if (errorInfo) {
    content = (
      <div className="banner banner--error" role="alert">
        <Icon name="alert" size={17} className="banner__icon" />
        <div className="banner__body">
          <strong className="banner__title">{errorInfo.title}</strong>
          {errorInfo.detail && <span>{errorInfo.detail}</span>}
          <div className="banner__actions">
            {errorInfo.action === 'login' && onLogin && (
              <button type="button" className="btn btn--sm btn--primary" onClick={onLogin}>
                重新登录
              </button>
            )}
            <button type="button" className="btn btn--sm" onClick={retry}>
              重试
            </button>
          </div>
        </div>
      </div>
    );
  } else if (!currentResults) {
    content = <SearchSkeleton />;
  } else if (
    (currentResults.type === 'posts' && currentResults.posts.length === 0) ||
    (currentResults.type === 'users' && currentResults.users.length === 0) ||
    (currentResults.type === 'nodes' && currentResults.nodes.length === 0) ||
    (currentResults.type === 'tags' && currentResults.tags.length === 0) ||
    (currentResults.type === 'favorites' && currentResults.favorites.length === 0)
  ) {
    content = (
      <div className="search-empty">
        <span className="search-empty__title">没有找到{EMPTY_LABELS[currentResults.type]}</span>
        <span className="search-empty__desc">
          换个关键词试试，或者切换到其他搜索类型。
        </span>
      </div>
    );
  } else {
    content = (
      <div className="search-results">
        <p className="search-count" role="status">
          {summaryOf(currentResults)}
        </p>

        {currentResults.type === 'posts' && (
          <ol className="feed-list feed-list--compact feed-list--no-rank search-post-list">
            {currentResults.posts.map((topic, index) => {
              const readKey = `topic:${topic.short_id}`;
              return (
                <PostRow
                  key={topic.short_id || `post:${index}`}
                  topic={topic}
                  index={index}
                  compact
                  showRank={false}
                  oneLine={compact}
                  isRead={readKeys.has(readKey)}
                  onRead={() => markRead(readKey)}
                />
              );
            })}
          </ol>
        )}

        {currentResults.type === 'users' && (
          <div className="search-list">
            {currentResults.users.map((user, index) => (
              <UserRow key={user.id || user.username || `user:${index}`} user={user} />
            ))}
          </div>
        )}

        {currentResults.type === 'nodes' && (
          <div className="search-list">
            {currentResults.nodes.map((node, index) => (
              <NodeRow key={node.id || node.slug || `node:${index}`} node={node} />
            ))}
          </div>
        )}

        {currentResults.type === 'tags' && (
          <div className="search-list">
            {currentResults.tags.map((tag, index) => (
              <TagRow key={tag.id || tag.name || `tag:${index}`} tag={tag} />
            ))}
          </div>
        )}

        {currentResults.type === 'favorites' && (
          <div className="search-list">
            {currentResults.favorites.map((favorite, index) => (
              <FavoriteRow
                key={favorite.postUrl || favorite.short_id || `favorite:${index}`}
                favorite={favorite}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <dialog
      ref={dialogRef}
      className={`t2-dialog search-dialog${compact ? ' search-dialog--compact' : ''}`}
      aria-labelledby="search-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <h2 className="sr-only" id="search-title">
        搜索
      </h2>

      <div className="search-dialog__top">
        <div className="search-field">
          <Icon name="search" size={17} className="search-field__icon" />
          <input
            ref={inputRef}
            id="search-input"
            type="search"
            className="search-field__input"
            placeholder="搜索帖子、用户、节点或标签"
            value={query}
            maxLength={SEARCH_MAX_LENGTH}
            autoComplete="off"
            spellCheck={false}
            aria-label="搜索关键词"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== 'Enter') return;
              event.preventDefault();
              submit();
            }}
          />
          {busy && <span className="search-field__spinner" role="status" aria-label="正在搜索" />}
          {query.length > 0 && (
            <button
              type="button"
              className="search-field__clear"
              onClick={() => {
                clear();
                inputRef.current?.focus();
              }}
              aria-label="清空搜索"
              title="清空"
            >
              <Icon name="close" size={12} />
            </button>
          )}
        </div>
        <button
          type="button"
          className="btn btn--icon search-dialog__close"
          onClick={onClose}
          title="关闭搜索（Esc）"
          aria-label="关闭搜索"
        >
          <Icon name="close" size={17} />
        </button>
      </div>

      {types.length > 1 && (
        <div
          className="search-tabs"
          role="tablist"
          aria-label="搜索类型"
          onKeyDown={handleTabKeyDown}
        >
          {types.map((meta, index) => {
            const active = meta.id === activeId;
            return (
              <button
                key={meta.id}
                ref={(element) => {
                  tabRefs.current[index] = element;
                }}
                type="button"
                role="tab"
                id={`search-tab-${meta.id}`}
                aria-selected={active}
                aria-controls="search-results-panel"
                tabIndex={active ? 0 : -1}
                className={`search-tab${active ? ' search-tab--active' : ''}`}
                title={meta.hint}
                onClick={() => setType(meta.id)}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="search-progress" data-active={busy} aria-hidden="true" />

      <div
        className="search-dialog__body"
        id="search-results-panel"
        role="tabpanel"
        aria-labelledby={`search-tab-${activeId}`}
        aria-busy={busy}
      >
        {content}
      </div>

      <footer className="search-dialog__foot">
        <span className="search-dialog__note">
          {signedIn
            ? `已登录 · 搜索限流 ${SEARCH_RATE_LIMITS.signedIn} 次/分`
            : `未登录 · 搜索限流 ${SEARCH_RATE_LIMITS.anonymous} 次/分`}
        </span>
        {!compact && (
          <span className="search-dialog__kbd">
            <kbd>Enter</kbd> 立即搜索
            <kbd>Esc</kbd> 关闭
          </span>
        )}
      </footer>
    </dialog>
  );
}
