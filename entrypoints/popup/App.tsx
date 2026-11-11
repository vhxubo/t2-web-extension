import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { PostList } from '@/components/PostList';
import { SearchDialog } from '@/components/SearchDialog';
import { ViewTabs } from '@/components/ViewTabs';
import { useFeed } from '@/hooks/useFeed';
import { useEmojiMap } from '@/hooks/useEmojis';
import { useNodes } from '@/hooks/useNodes';
import { useSearchHotkey } from '@/hooks/useSearch';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { useTheme } from '@/hooks/useTheme';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { openDashboard, openSettings } from '@/lib/nav';
import { DEFAULT_SETTINGS, storageAvailable } from '@/lib/storage';
import type { Section } from '@/lib/types';
import { POPUP_TAB_LIMIT, popupViewIds, viewDomId } from '@/lib/viewIds';
import { buildViewEntries, popupEntries } from '@/lib/views';

const ALL_SITES: Section = { kind: 'all' };

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

  const [activeId, setActiveId] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const entries = useMemo(
    () => buildViewEntries(settings?.views ?? DEFAULT_SETTINGS.views, nodeState.nodes),
    [settings?.views, nodeState.nodes],
  );
  const tabs = useMemo(() => popupEntries(entries), [entries]);
  const activeEntry = useMemo(
    () => tabs.find((entry) => entry.id === activeId) ?? tabs[0] ?? null,
    [tabs, activeId],
  );
  const activeView = activeEntry?.view ?? null;
  const emojis = useEmojiMap(activeView?.board === 'comments');

  const needsNodes =
    activeView?.kind === 'section' && activeView.section.kind !== 'all';
  const nodePending = needsNodes && nodeState.status === 'loading';
  const nodeMissing = needsNodes && nodeState.status !== 'loading' && !activeView?.available;

  const feed = useFeed({
    board: activeView?.kind === 'board' ? activeView.board : undefined,
    section: activeView?.section ?? ALL_SITES,
    nodes: nodeState.nodes,
    nodesReady: !needsNodes || nodeState.status !== 'loading',
    limit: activeView?.pageSize ?? 50,
    enabled: initialized && Boolean(activeView) && !nodePending && !nodeMissing,
  });

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  useSearchHotkey(openSearch);

  // 只在弹窗打开时读取一次默认视图；之后切换 Tab 只影响当次浏览。
  useEffect(() => {
    if (!settings || initialized) return;
    const ids = popupViewIds(settings.views).slice(0, POPUP_TAB_LIMIT);
    setActiveId(ids.includes(settings.defaultView) ? settings.defaultView : (ids[0] ?? null));
    setInitialized(true);
  }, [settings, initialized]);

  const handleActive = useCallback((id: string) => {
    setActiveId(id);
  }, []);

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
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

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

  return (
    <div className="popup">
      <h1 className="sr-only">T2 Web Extension</h1>

      <header className="popup__head">
        <Brand compact />
        <div className="popup__head-actions">
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
            onClick={() => void feed.reload()}
            title="刷新列表"
            aria-label="刷新列表"
            data-spinning={feed.status === 'loading'}
            disabled={!activeView}
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

      {tabs.length > 0 ? (
        <>
          <div className="popup__tabs">
            <ViewTabs
              tabs={tabs.map((entry) => ({
                id: entry.id,
                label: entry.view.shortLabel,
                title: entry.view.hint,
              }))}
              value={activeEntry?.id ?? null}
              onChange={handleActive}
              ariaLabel="视图"
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
                titleOnly
                oneLine
                variant={activeView?.board === 'comments' ? 'comment' : 'topic'}
                emojis={emojis}
                sectionFiltered={Boolean(activeView?.section.kind !== 'all')}
                sectionName={activeView?.label}
                onRetry={handleRetry}
                onLogin={goSettings}
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
          disabled={tabs.length === 0}
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
