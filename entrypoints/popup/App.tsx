import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { NotificationFilters } from '@/components/NotificationFilters';
import { NotificationList } from '@/components/NotificationList';
import { PostList } from '@/components/PostList';
import { PrimaryTabs, type PrimaryTabItem } from '@/components/PrimaryTabs';
import { SearchDialog } from '@/components/SearchDialog';
import { TopicDetail } from '@/components/TopicDetail';
import { ViewTabs } from '@/components/ViewTabs';
import { useFeed } from '@/hooks/useFeed';
import { useEmojiMap } from '@/hooks/useEmojis';
import { useNodes } from '@/hooks/useNodes';
import { useNotifications } from '@/hooks/useNotifications';
import { useSearchHotkey } from '@/hooks/useSearch';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { useTheme } from '@/hooks/useTheme';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { LINKS } from '@/lib/config';
import { describeError } from '@/lib/errors';
import { openDashboard, openSettings } from '@/lib/nav';
import { notificationFilterMeta } from '@/lib/notification-filter';
import { BUILTIN_ME_VIEWS } from '@/lib/me';
import { DEFAULT_SETTINGS, storageAvailable } from '@/lib/storage';
import type { Section, Topic } from '@/lib/types';
import {
  POPUP_TAB_LIMIT,
  boardViewId,
  popupViewIds,
  viewDomId,
} from '@/lib/viewIds';
import { buildViewEntries, popupEntries } from '@/lib/views';

const ALL_SITES: Section = { kind: 'all' };

/** 登录后的一级 Tab：帖子沿用原来的可配置视图，我的固定 5 个系统视图。 */
const PRIMARY_TABS: PrimaryTabItem[] = [
  { id: 'posts', label: '帖子' },
  { id: 'me', label: '我的' },
];

type PrimaryMode = 'posts' | 'me';

function NotificationSkeleton() {
  return (
    <div className="notice-skeleton notice-skeleton--popup" aria-hidden="true">
      {Array.from({ length: 3 }).map((_, index) => (
        <div className="notice-skeleton__row" key={index}>
          <span className="skeleton notice-skeleton__avatar" />
          <div className="notice-skeleton__body">
            <span className="skeleton skeleton--line" />
            <span className="skeleton skeleton--line skeleton--short" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * 方案 C：顶部 Header + 可配置的视图 Tab，中部单行标题列表，底部固定 Dock。
 * Tab 来自设置里的节点配置（最多 6 个），节点可以是内置榜单、全站、父节点或子节点。
 */
export default function Popup() {
  const { settings, update } = useSettings();
  const resolvedTheme = useTheme(settings?.theme);
  const { profile, signedIn, loading: sessionLoading, profileLoading } = useSession();
  const unread = useUnreadNotifications(signedIn);
  const nodeState = useNodes();

  const [mode, setMode] = useState<PrimaryMode>('posts');
  const [activeId, setActiveId] = useState<string | null>(null);
  const [activeMeId, setActiveMeId] = useState<string>(
    BUILTIN_ME_VIEWS[0]?.id ?? '',
  );
  const [initialized, setInitialized] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  // 非空时进入二级详情页：盖住 Tab 与列表，返回后回到原来的列表位置。
  const [detailTopic, setDetailTopic] = useState<Topic | null>(null);
  const [detailRefreshToken, setDetailRefreshToken] = useState(0);
  const [detailLoading, setDetailLoading] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const noticesRef = useRef<HTMLDivElement | null>(null);
  const detailRef = useRef<HTMLDivElement | null>(null);
  const listScroll = useRef(0);

  const notifications = useNotifications({
    enabled: notificationsOpen,
    signedIn,
    sessionLoading,
    limit: 20,
  });

  const entries = useMemo(
    () => buildViewEntries(settings?.views ?? DEFAULT_SETTINGS.views, nodeState.nodes),
    [settings?.views, nodeState.nodes],
  );

  // 「帖子」沿用原来的可配置视图；登录后保证首页固定作为第一个二级项。
  const tabs = useMemo(() => {
    const configured = popupEntries(entries);
    if (!signedIn) return configured;
    if (configured.some((entry) => entry.id === boardViewId('home'))) return configured;
    // 只在还有空位时补首页，别挤掉用户自己挑的 Tab。
    if (configured.length >= POPUP_TAB_LIMIT) return configured;
    const home = entries.find((entry) => entry.id === boardViewId('home'));
    return home ? [{ ...home, popup: true }, ...configured] : configured;
  }, [entries, signedIn]);

  // 「我的」是 5 个系统视图，不走设置里的节点配置。
  const meEntries = useMemo(() => {
    const prefs = BUILTIN_ME_VIEWS.map((view) => ({
      id: view.id,
      popup: true,
      dashboard: false,
    }));
    return buildViewEntries(prefs, nodeState.nodes);
  }, [nodeState.nodes]);

  const activeMeEntry = useMemo(
    () => meEntries.find((entry) => entry.id === activeMeId) ?? meEntries[0] ?? null,
    [meEntries, activeMeId],
  );
  const secondaryEntries = mode === 'me' ? meEntries : tabs;
  const activeEntry = useMemo(
    () =>
      mode === 'me'
        ? activeMeEntry
        : (tabs.find((entry) => entry.id === activeId) ?? tabs[0] ?? null),
    [activeId, activeMeEntry, mode, tabs],
  );
  const activeView = activeEntry?.view ?? null;
  const feedVariant =
    activeView?.me?.kind === 'comments' || activeView?.board === 'comments'
      ? 'comment'
      : activeView?.me?.kind === 'collections'
        ? 'collection'
        : 'topic';
  // 关注流把取回的条目直接平铺（标题 + 分区 / 作者 / 时间 / 回复数），
  // 不再挂行尾箭头进二级详情。其它视图保持原来的详情入口。
  const followsView = activeView?.me?.id === 'builtin:me_follows';
  // 详情正文或评论列表里的表情短码也要渲染成图片，所以提前把映射拉好。
  const emojis = useEmojiMap(feedVariant === 'comment' || detailTopic !== null || followsView);

  const needsNodes =
    activeView?.kind === 'section' && activeView.section.kind !== 'all';
  const nodePending = needsNodes && nodeState.status === 'loading';
  const nodeMissing = needsNodes && nodeState.status !== 'loading' && !activeView?.available;

  const feed = useFeed({
    board: activeView?.kind === 'board' ? activeView.board : undefined,
    me: activeView?.kind === 'me' ? activeView.me?.id : undefined,
    section: activeView?.section ?? ALL_SITES,
    nodes: nodeState.nodes,
    nodesReady: !needsNodes || nodeState.status !== 'loading',
    limit: activeView?.pageSize ?? 50,
    // 「我的」必须登录后才能读取；退出登录时不要拿匿名请求去碰 /v1/me。
    enabled:
      initialized &&
      Boolean(activeView) &&
      !nodePending &&
      !nodeMissing &&
      (activeView?.kind !== 'me' || signedIn),
  });

  const openSearch = useCallback(() => {
    setNotificationsOpen(false);
    setSearchOpen(true);
  }, []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  useSearchHotkey(openSearch);

  // 二级详情：先记住列表滚动位置，返回时原样恢复。
  const openDetail = useCallback((topic: Topic) => {
    listScroll.current = listRef.current?.scrollTop ?? 0;
    setSearchOpen(false);
    setNotificationsOpen(false);
    setDetailTopic(topic);
  }, []);

  const closeDetail = useCallback(() => {
    setDetailTopic(null);
    setDetailLoading(false);
  }, []);

  useEffect(() => {
    if (detailTopic) return;
    const element = listRef.current;
    if (element) element.scrollTop = listScroll.current;
  }, [detailTopic]);

  // 进入详情后从顶部开始读，不继承列表的滚动位置。
  useEffect(() => {
    if (detailTopic) detailRef.current?.scrollTo({ top: 0 });
  }, [detailTopic]);

  useEffect(() => {
    if (!detailTopic || searchOpen || notificationsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') closeDetail();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeDetail, detailTopic, notificationsOpen, searchOpen]);

  // 通知预览是独立于榜单 Tab 的层级：打开时盖住 Tab + 列表，再点铃铛或 Esc 返回。
  const toggleNotifications = useCallback(() => {
    if (notificationsOpen) {
      setNotificationsOpen(false);
      return;
    }
    setSearchOpen(false);
    setNotificationsOpen(true);
    void unread.refresh();
  }, [notificationsOpen, unread.refresh]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setNotificationsOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [notificationsOpen]);

  // 只在弹窗打开时读取一次默认视图；之后切换 Tab 只影响当次浏览。
  useEffect(() => {
    if (!settings || initialized) return;
    const ids = popupViewIds(settings.views).slice(0, POPUP_TAB_LIMIT);
    setActiveId(ids.includes(settings.defaultView) ? settings.defaultView : (ids[0] ?? null));
    setInitialized(true);
  }, [settings, initialized]);

  const handleActive = useCallback(
    (id: string) => {
      if (mode === 'me') setActiveMeId(id);
      else setActiveId(id);
    },
    [mode],
  );

  // 切换一级 Tab 时收起通知 / 搜索 / 详情，回到对应模式的列表。
  const handleMode = useCallback(
    (id: string) => {
      const next: PrimaryMode = id === 'me' ? 'me' : 'posts';
      if (next === 'me' && !signedIn) return;
      setMode(next);
      setNotificationsOpen(false);
      setSearchOpen(false);
      setDetailTopic(null);
    },
    [signedIn],
  );

  // 退出登录 / 令牌失效后「我的」不可用，自动回到帖子。
  useEffect(() => {
    if (!signedIn && mode === 'me') setMode('posts');
  }, [mode, signedIn]);

  // Header 快捷键：在浅色 / 深色之间直接切换（想恢复跟随系统仍可到设置弹窗里选）。
  const toggleTheme = useCallback(() => {
    void update({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' });
  }, [resolvedTheme, update]);

  // 弹窗只留一个账号入口：登录、退出、节点配置都在独立的设置页里。
  const goDashboard = useCallback((hash?: string) => {
    void openDashboard(hash).finally(() => window.close());
  }, []);

  const goSettings = useCallback(() => {
    void openSettings().finally(() => window.close());
  }, []);

  const handleDashboard = useCallback(() => {
    // 有未读提醒时直接落在通知面板，否则停留在榜单仪表盘。
    goDashboard(unread.count > 0 ? 'notifications' : undefined);
  }, [goDashboard, unread.count]);

  const handleQuick = useCallback(() => {
    const target = notificationsOpen
      ? noticesRef.current
      : detailTopic
        ? detailRef.current
        : listRef.current;
    target?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [detailTopic, notificationsOpen]);

  const handleRefresh = useCallback(() => {
    if (notificationsOpen) {
      void notifications.reload();
      void unread.refresh();
      return;
    }
    if (detailTopic) {
      setDetailRefreshToken((value) => value + 1);
      return;
    }
    void feed.reload();
  }, [detailTopic, feed.reload, notifications.reload, notificationsOpen, unread.refresh]);

  const handleRead = useCallback(
    async (id: string) => {
      if (await notifications.markRead(id)) void unread.refresh();
    },
    [notifications.markRead, unread.refresh],
  );

  const handleMarkAllRead = useCallback(async () => {
    const ok = await notifications.markAllRead();
    if (ok) void unread.refresh();
  }, [notifications.markAllRead, unread.refresh]);

  const handleRetry = useCallback(() => {
    if (nodeMissing) {
      void nodeState.reload(true);
      return;
    }
    void feed.reload();
  }, [feed, nodeMissing, nodeState]);

  const unreadLabel = unread.count > 0 ? `，${unread.count} 条未读通知` : '';
  const accountLoading = sessionLoading || (signedIn && !profile && profileLoading);
  const themePreference = settings?.theme ?? 'system';
  const currentThemeLabel = resolvedTheme === 'dark' ? '深色' : '浅色';
  const nextThemeLabel = resolvedTheme === 'dark' ? '浅色' : '深色';
  const themeTitle =
    themePreference === 'system'
      ? `外观：跟随系统（当前${currentThemeLabel}），点击改为${nextThemeLabel}`
      : `外观：当前${currentThemeLabel}，点击切换为${nextThemeLabel}`;

  const nodeError = nodeMissing
    ? new Error(
        nodeState.status === 'error'
          ? '节点列表加载失败，暂时没法读取这个节点。'
          : `节点「${activeView?.label ?? ''}」已经不存在，请到节点配置里移除。`,
      )
    : null;

  const notificationsError =
    notifications.status === 'error' ? describeError(notifications.error) : null;
  const actionErrorInfo = notifications.actionError
    ? describeError(notifications.actionError)
    : null;
  const activeFilterMeta = notificationFilterMeta(notifications.filter);
  const hasUnreadInList = notifications.items.some((item) => !item.is_read);
  const canMarkAll = signedIn && !sessionLoading && (unread.count > 0 || hasUnreadInList);

  return (
    <div className="popup">
      <h1 className="sr-only">T2 Web Extension</h1>

      <header className={`popup__head${signedIn ? ' popup__head--signed' : ''}`}>
        {detailTopic && !notificationsOpen ? (
          <button
            type="button"
            className="popup__detail-back"
            onClick={closeDetail}
            title="返回列表"
            aria-label="返回列表"
          >
            <Icon name="chevron" size={13} />
            <span>返回列表</span>
          </button>
        ) : signedIn ? (
          <>
            <Brand markOnly />
            <PrimaryTabs tabs={PRIMARY_TABS} value={mode} onChange={handleMode} />
          </>
        ) : (
          <Brand compact />
        )}
        <div className="popup__head-actions">
          <button
            type="button"
            className="popup__icon-btn popup__notice-btn"
            onClick={toggleNotifications}
            title={
              notificationsOpen
                ? '关闭通知预览，返回榜单'
                : unread.count > 0
                  ? `通知预览（${unread.count} 条未读）`
                  : '通知预览'
            }
            aria-label={
              notificationsOpen
                ? '关闭通知预览'
                : unread.count > 0
                  ? `通知预览，${unread.count} 条未读`
                  : '通知预览'
            }
            aria-expanded={notificationsOpen}
            aria-controls="notifications-preview"
            data-active={notificationsOpen}
          >
            <Icon name="bell" size={16} />
            {unread.count > 0 && (
              <span className="popup__notice-badge" aria-hidden="true">
                {unread.count > 99 ? '99+' : unread.count}
              </span>
            )}
          </button>
          <button
            type="button"
            className="popup__icon-btn"
            onClick={openSearch}
            title="搜索（Ctrl / ⌘ K）"
            aria-label="搜索"
            aria-haspopup="dialog"
            aria-keyshortcuts="Control+K Meta+K"
          >
            <Icon name="search" size={16} />
          </button>
          <button
            type="button"
            className="popup__icon-btn"
            onClick={handleRefresh}
            title={
              notificationsOpen ? '刷新通知' : detailTopic ? '刷新详情' : '刷新列表'
            }
            aria-label={
              notificationsOpen ? '刷新通知' : detailTopic ? '刷新详情' : '刷新列表'
            }
            data-spinning={
              notificationsOpen
                ? notifications.status === 'loading'
                : detailTopic
                  ? detailLoading
                  : feed.status === 'loading'
            }
            disabled={!notificationsOpen && !detailTopic && !activeView}
          >
            <Icon name="refresh" size={15} />
          </button>
          <button
            type="button"
            className="popup__icon-btn"
            onClick={toggleTheme}
            title={themeTitle}
            aria-label={themeTitle}
            aria-pressed={resolvedTheme === 'dark'}
          >
            <Icon name={resolvedTheme === 'dark' ? 'moon' : 'sun'} size={16} />
          </button>
          <button
            type="button"
            className="popup__account"
            onClick={goSettings}
            title={signedIn ? `账号与设置（@${profile?.username ?? '已登录'}）` : '登录与设置'}
            aria-label={signedIn ? '账号与设置' : '登录与设置'}
          >
            {accountLoading ? (
              <span className="skeleton popup__account-skeleton" aria-hidden="true" />
            ) : signedIn ? (
              <Avatar
                src={profile?.avatar_url}
                name={profile?.display_name || profile?.username || '已登录'}
              />
            ) : (
              <Icon name="user" size={16} />
            )}
          </button>
        </div>
      </header>

      {!storageAvailable && (
        <p className="popup__warn" role="alert">
          storage 权限未生效，设置不会保存。请在扩展管理页重新加载后刷新。
        </p>
      )}

      {notificationsOpen ? (
        <section className="popup__notices" id="notifications-preview" aria-label="通知预览">
          <div className="popup__notices-head">
            <span className="popup__notices-title">
              <Icon name="bell" size={13} />
              通知预览
            </span>
            <span className="popup__notices-count">
              {unread.count > 0 ? `${unread.count} 条未读` : '最近通知'}
            </span>
            <a
              className="popup__notices-link"
              href={LINKS.notifications}
              target="_blank"
              rel="noreferrer"
            >
              在站点查看
              <Icon name="external" size={11} />
            </a>
            {signedIn && (
              <button
                type="button"
                className="popup__notices-read"
                onClick={() => void handleMarkAllRead()}
                disabled={!canMarkAll || notifications.markingAll}
                title="全部标记为已读（同步到站点）"
              >
                {notifications.markingAll ? '处理中…' : '全部已读'}
              </button>
            )}
          </div>

          {signedIn && !sessionLoading && (
            <div className="popup__notices-filters">
              <NotificationFilters
                value={notifications.filter}
                onChange={notifications.setFilter}
                variant="popup"
              />
            </div>
          )}

          <div className="popup__notices-body" ref={noticesRef}>
            {sessionLoading ? (
              <NotificationSkeleton />
            ) : !signedIn ? (
              <div className="empty notifications-empty">
                <span className="empty__title">还没有登录</span>
                <span className="empty__desc">登录后可以在弹窗里直接看回复、提及和表态。</span>
                <div className="empty__actions">
                  <button type="button" className="btn btn--primary btn--sm" onClick={goSettings}>
                    登录
                  </button>
                </div>
              </div>
            ) : notifications.status === 'loading' || notifications.status === 'idle' ? (
              <NotificationSkeleton />
            ) : notificationsError ? (
              <div className="banner banner--error" role="alert">
                <Icon name="alert" size={16} className="banner__icon" />
                <div className="banner__body">
                  <strong className="banner__title">{notificationsError.title}</strong>
                  {notificationsError.detail && <span>{notificationsError.detail}</span>}
                  <div className="banner__actions">
                    {notificationsError.action === 'login' && (
                      <button type="button" className="btn btn--sm btn--primary" onClick={goSettings}>
                        重新授权
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => void notifications.reload()}
                    >
                      重试
                    </button>
                  </div>
                </div>
              </div>
            ) : notifications.items.length === 0 ? (
              <div className="empty notifications-empty">
                <span className="empty__title">{activeFilterMeta.emptyTitle}</span>
                <span className="empty__desc">{activeFilterMeta.emptyHint}</span>
                {notifications.filter !== 'all' && (
                  <div className="empty__actions">
                    <button
                      type="button"
                      className="btn btn--sm"
                      onClick={() => notifications.setFilter('all')}
                    >
                      查看全部
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <NotificationList
                items={notifications.items}
                variant="popup"
                onRead={handleRead}
                pendingReadIds={notifications.readingIds}
              />
            )}
          </div>

          {actionErrorInfo && (
            <p className="popup__notices-foot popup__notices-foot--error">
              操作失败：{actionErrorInfo.title}
            </p>
          )}
        </section>
      ) : detailTopic ? (
        <section className="popup__detail" id="topic-detail-panel" aria-label="帖子详情">
          <div className="popup__detail-body" ref={detailRef}>
            <TopicDetail
              topic={detailTopic}
              emojis={emojis}
              signedIn={signedIn}
              onLogin={goSettings}
              refreshToken={detailRefreshToken}
              onLoadingChange={setDetailLoading}
            />
          </div>
        </section>
      ) : secondaryEntries.length > 0 ? (
        <>
          <div className="popup__tabs">
            <ViewTabs
              tabs={secondaryEntries.map((entry) => ({
                id: entry.id,
                label: entry.view.shortLabel,
                title: entry.view.hint,
              }))}
              value={activeEntry?.id ?? null}
              onChange={handleActive}
              ariaLabel={mode === 'me' ? '我的视图' : '帖子视图'}
              stretch
            />
          </div>

          <section
            className="popup__feed"
            id="feed-panel"
            role="tabpanel"
            aria-labelledby={`view-tab-${viewDomId(activeEntry?.id ?? '')}`}
            aria-label={`${activeView?.label ?? ''}列表`}
          >
            <div className="popup__feed-body" ref={listRef}>
              <PostList
                items={nodePending ? [] : feed.items}
                status={nodeMissing ? 'error' : nodePending ? 'loading' : feed.status}
                error={nodeError ?? feed.error}
                compact
                showRank={false}
                titleOnly={!followsView}
                oneLine={!followsView}
                variant={feedVariant}
                emojis={emojis}
                collectionOwner={profile?.username}
                emptyTitle={activeView?.me?.emptyTitle}
                emptyDesc={activeView?.me?.emptyDesc}
                sectionFiltered={activeView?.kind === 'section' && activeView.section.kind !== 'all'}
                sectionName={activeView?.label}
                onRetry={handleRetry}
                onLogin={goSettings}
                expandable={feedVariant === 'topic' && !followsView}
                onExpand={openDetail}
              />
            </div>
          </section>
        </>
      ) : (
        <div className="popup__empty">
          <span className="popup__empty-icon" aria-hidden="true">
            <Icon name="folder" size={20} />
          </span>
          <p className="popup__empty-title">还没有弹窗 Tab</p>
          <p className="popup__empty-desc">到设置里的「节点配置」添加榜单或节点，最多展示 {POPUP_TAB_LIMIT} 个。</p>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={goSettings}
          >
            打开节点配置
          </button>
        </div>
      )}

      <nav className="popup__dock" aria-label="弹窗导航">
        <button
          type="button"
          className="popup__dock-item popup__dock-item--active"
          onClick={handleQuick}
          aria-current="page"
          title="回到当前列表顶部"
          disabled={secondaryEntries.length === 0 && !notificationsOpen}
        >
          <Icon name="flame" size={16} />
          <span>回到顶部</span>
        </button>

        <button
          type="button"
          className="popup__dock-item"
          onClick={handleDashboard}
          title={`数据仪表盘${unreadLabel}`}
          aria-label={`数据仪表盘${unreadLabel}`}
        >
          <span className="popup__dock-icon">
            <Icon name="chart" size={16} />
            {unread.count > 0 && <span className="popup__dock-dot" aria-hidden="true" />}
          </span>
          <span>数据仪表盘</span>
        </button>

        <button
          type="button"
          className="popup__dock-item"
          onClick={goSettings}
          title="打开设置"
        >
          <Icon name="settings" size={16} />
          <span>设置</span>
        </button>
      </nav>

      <SearchDialog
        open={searchOpen}
        onClose={closeSearch}
        signedIn={signedIn}
        compact
        onLogin={() => {
          setSearchOpen(false);
          goSettings();
        }}
      />
    </div>
  );
}
