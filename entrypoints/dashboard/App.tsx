import { useCallback, useEffect, useMemo, useState } from 'react';
import { AccountChip } from '@/components/AccountChip';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { NotificationsDialog } from '@/components/NotificationsDialog';
import { SearchDialog } from '@/components/SearchDialog';
import { Toast } from '@/components/Toast';
import { ViewCard } from '@/components/ViewCard';
import { useNodes } from '@/hooks/useNodes';
import { useSearchHotkey } from '@/hooks/useSearch';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { useTheme } from '@/hooks/useTheme';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { LINKS } from '@/lib/config';
import { openSettings } from '@/lib/nav';
import { DEFAULT_SETTINGS, storageAvailable } from '@/lib/storage';
import { POPUP_TAB_LIMIT } from '@/lib/viewIds';
import { buildViewEntries, dashboardEntries } from '@/lib/views';

const SHORTCUT_LABEL =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    ? '⌘ K'
    : 'Ctrl K';

export default function Dashboard() {
  const { settings } = useSettings();
  useTheme(settings?.theme);
  const {
    profile,
    signedIn,
    loading: sessionLoading,
    profileLoading,
    signOut,
  } = useSession();
  const unread = useUnreadNotifications(signedIn);
  const nodeState = useNodes();

  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const ready = settings !== null;

  const entries = useMemo(
    () => buildViewEntries(settings?.views ?? DEFAULT_SETTINGS.views, nodeState.nodes),
    [settings?.views, nodeState.nodes],
  );
  const cards = useMemo(() => dashboardEntries(entries), [entries]);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // #notifications / #search 用于从弹窗 Dock 直接跳到对应面板；
  // 旧链接里的 #settings / #login / #nodes 现在改为打开独立设置页。
  useEffect(() => {
    const openFromHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'search') {
        setSearchOpen(true);
        setNotificationsOpen(false);
        return;
      }
      if (hash === 'notifications') {
        setNotificationsOpen(true);
        setSearchOpen(false);
        return;
      }
      if (hash === 'settings' || hash === 'login' || hash === 'nodes') {
        void openSettings();
        window.history.replaceState(null, '', window.location.pathname + window.location.search);
      }
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  const refreshAll = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  const handleRefreshAll = useCallback(() => {
    refreshAll();
    showToast('已刷新全部卡片');
  }, [refreshAll, showToast]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    setNotificationsOpen(false);
    showToast('已退出登录');
    refreshAll();
  }, [signOut, showToast, refreshAll]);

  const clearHash = useCallback(() => {
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  const goSettings = useCallback(() => {
    setNotificationsOpen(false);
    setSearchOpen(false);
    clearHash();
    void openSettings();
  }, [clearHash]);

  const closeNotifications = useCallback(() => {
    setNotificationsOpen(false);
    clearHash();
  }, [clearHash]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setNotificationsOpen(false);
    if (window.location.hash !== '#search') {
      window.history.replaceState(null, '', '#search');
    }
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    clearHash();
  }, [clearHash]);

  useSearchHotkey(openSearch);

  const openNotifications = useCallback(() => {
    setNotificationsOpen(true);
    setSearchOpen(false);
    if (window.location.hash !== '#notifications') {
      window.history.replaceState(null, '', '#notifications');
    }
    void unread.refresh();
  }, [unread.refresh]);

  const goLoginFromNotifications = useCallback(() => {
    setNotificationsOpen(false);
    setSearchOpen(false);
    clearHash();
    void openSettings();
  }, [clearHash]);

  const reloadNodes = useCallback(() => {
    void nodeState.reload(true);
  }, [nodeState]);

  return (
    <>
      <h1 className="sr-only">T2 Web Extension · Dashboard</h1>

      <header className="masthead">
        <div className="masthead__inner">
          <a
            className="masthead__brand"
            href={LINKS.site}
            target="_blank"
            rel="noreferrer"
            title="打开站点"
          >
            <Brand compact sub={null} />
          </a>

          <div className="masthead__actions" role="group" aria-label="页面操作">
            <button
              type="button"
              className="masthead__action masthead__search"
              onClick={openSearch}
              title="搜索（Ctrl / ⌘ K）"
              aria-label="搜索"
              aria-haspopup="dialog"
              aria-keyshortcuts="Control+K Meta+K"
            >
              <Icon name="search" size={16} />
              <span className="masthead__search-label">搜索</span>
              <kbd className="masthead__search-kbd">{SHORTCUT_LABEL}</kbd>
            </button>
            <button
              type="button"
              className="masthead__action"
              onClick={handleRefreshAll}
              title="刷新全部卡片"
              aria-label="刷新全部卡片"
            >
              <Icon name="refresh" size={16} />
            </button>
            <button
              type="button"
              className="masthead__action masthead__bell"
              onClick={openNotifications}
              title={unread.count > 0 ? `通知（${unread.count} 条未读）` : '通知'}
              aria-label={unread.count > 0 ? `通知，${unread.count} 条未读` : '通知'}
            >
              <Icon name="bell" size={16} />
              {unread.count > 0 && (
                <span className="masthead__bell-badge" aria-hidden="true">
                  {unread.count > 99 ? '99+' : unread.count}
                </span>
              )}
            </button>
            <AccountChip
              signedIn={signedIn}
              loading={sessionLoading || (signedIn && !profile && profileLoading)}
              profile={profile}
              onLogin={goSettings}
              onSignOut={() => void handleSignOut()}
            />
            <button
              type="button"
              className="masthead__action"
              onClick={goSettings}
              title="设置与节点配置"
              aria-label="打开设置与节点配置"
            >
              <Icon name="settings" size={16} />
            </button>
          </div>
        </div>
      </header>

      {!storageAvailable && (
        <div className="storage-note" role="alert">
          <Icon name="alert" size={15} />
          <span>
            扩展的 storage 权限还没生效：设置与登录不会保存。到 chrome://extensions 点「重新加载」，
            然后刷新本页。
          </span>
        </div>
      )}

      <main className="shell" aria-label="数据看板">
        {ready && cards.length === 0 ? (
          <section className="dashboard-empty">
            <span className="dashboard-empty__icon" aria-hidden="true">
              <Icon name="folder" size={22} />
            </span>
            <h2 className="dashboard-empty__title">仪表盘还是空的</h2>
            <p className="dashboard-empty__desc">
              到设置里的「节点配置」勾选要在仪表盘展示的榜单或节点。仪表盘不限数量，弹窗最多 {POPUP_TAB_LIMIT} 个 Tab。
            </p>
            <button type="button" className="btn btn--primary" onClick={goSettings}>
              打开节点配置
            </button>
          </section>
        ) : (
          <div className="board-grid">
            {cards.map((entry, index) => (
              <ViewCard
                key={`${entry.id}:${refreshKey}`}
                view={entry.view}
                nodes={nodeState.nodes}
                nodesStatus={nodeState.status}
                enabled={ready}
                index={index}
                onLogin={goSettings}
                onReloadNodes={reloadNodes}
              />
            ))}
          </div>
        )}
      </main>

      <NotificationsDialog
        open={notificationsOpen}
        onClose={closeNotifications}
        signedIn={signedIn}
        sessionLoading={sessionLoading}
        unread={unread.count}
        onLogin={goLoginFromNotifications}
        onRefreshUnread={unread.refresh}
      />

      <SearchDialog
        open={searchOpen}
        onClose={closeSearch}
        signedIn={signedIn}
        onLogin={() => {
          setSearchOpen(false);
          clearHash();
          void openSettings();
        }}
      />

      <Toast message={toast} />
    </>
  );
}
