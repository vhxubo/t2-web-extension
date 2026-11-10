import { useCallback, useEffect, useState } from 'react';
import { AccountChip } from '@/components/AccountChip';
import { BoardCard } from '@/components/BoardCard';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { NotificationsDialog } from '@/components/NotificationsDialog';
import { SearchDialog } from '@/components/SearchDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Toast } from '@/components/Toast';
import { useSearchHotkey } from '@/hooks/useSearch';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { BOARDS } from '@/lib/boards';
import { LINKS } from '@/lib/config';
import { storageAvailable } from '@/lib/storage';

const SHORTCUT_LABEL =
  typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
    ? '⌘ K'
    : 'Ctrl K';

export default function Dashboard() {
  const { settings, update } = useSettings();
  const {
    profile,
    signedIn,
    loading: sessionLoading,
    profileLoading,
    signOut,
    reloadProfile,
  } = useSession();
  const unread = useUnreadNotifications(signedIn);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const ready = settings !== null;

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // #settings / #login / #notifications / #search 用于从弹窗 Dock 直接跳到对应面板。
  useEffect(() => {
    const openFromHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'search') {
        setSearchOpen(true);
        setNotificationsOpen(false);
        setSettingsOpen(false);
        return;
      }
      if (hash === 'notifications') {
        setNotificationsOpen(true);
        setSettingsOpen(false);
        setSearchOpen(false);
        return;
      }
      if (hash === 'settings' || hash === 'login') {
        setSettingsOpen(true);
        setNotificationsOpen(false);
        setSearchOpen(false);
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
    showToast('已刷新全部榜单');
  }, [refreshAll, showToast]);

  const handleSignedIn = useCallback(async () => {
    // 拿到头像 / 昵称，再把带个性化字段的榜单重新拉一遍。
    await reloadProfile();
    refreshAll();
  }, [reloadProfile, refreshAll]);

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

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    clearHash();
  }, [clearHash]);

  const closeNotifications = useCallback(() => {
    setNotificationsOpen(false);
    clearHash();
  }, [clearHash]);

  const openSearch = useCallback(() => {
    setSearchOpen(true);
    setSettingsOpen(false);
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
    setSettingsOpen(false);
    setSearchOpen(false);
    if (window.location.hash !== '#notifications') {
      window.history.replaceState(null, '', '#notifications');
    }
    void unread.refresh();
  }, [unread.refresh]);

  const goLoginFromNotifications = useCallback(() => {
    setNotificationsOpen(false);
    setSettingsOpen(true);
    setSearchOpen(false);
    if (window.location.hash !== '#settings') {
      window.history.replaceState(null, '', '#settings');
    }
  }, []);

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
              title="刷新全部榜单"
              aria-label="刷新全部榜单"
            >
              <Icon name="refresh" size={16} />
            </button>
            <button
              type="button"
              className="masthead__action masthead__bell"
              onClick={openNotifications}
              title={
                unread.count > 0 ? `通知（${unread.count} 条未读）` : '通知'
              }
              aria-label={unread.count > 0 ? `通知，${unread.count} 条未读` : '通知'}
            >
              <Icon name="bell" size={16} />
              {unread.count > 0 && <span className="masthead__bell-dot" aria-hidden="true" />}
            </button>
            <AccountChip
              signedIn={signedIn}
              loading={sessionLoading || (signedIn && !profile && profileLoading)}
              profile={profile}
              onLogin={() => setSettingsOpen(true)}
              onSignOut={() => void handleSignOut()}
            />
            <button
              type="button"
              className="masthead__action"
              onClick={() => setSettingsOpen(true)}
              title="设置"
              aria-label="打开设置"
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

      <main className="shell" aria-label="榜单看板">
        <div className="board-grid">
          {BOARDS.map((meta) => (
            <BoardCard
              key={`${meta.id}:${refreshKey}`}
              meta={meta}
              enabled={ready}
              onLogin={() => setSettingsOpen(true)}
            />
          ))}
        </div>
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
          setSettingsOpen(true);
          if (window.location.hash !== '#settings') {
            window.history.replaceState(null, '', '#settings');
          }
        }}
      />

      <SettingsDialog
        open={settingsOpen}
        onClose={closeSettings}
        settings={settings ?? { board: 'latest', section: 'all' }}
        signedIn={signedIn}
        profile={profile}
        onUpdateSettings={update}
        onSignedIn={handleSignedIn}
        onSignOut={() => void handleSignOut()}
        onToast={showToast}
      />

      <Toast message={toast} />
    </>
  );
}
