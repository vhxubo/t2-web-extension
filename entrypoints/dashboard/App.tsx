import { useCallback, useEffect, useState } from 'react';
import { AccountChip } from '@/components/AccountChip';
import { BoardCard } from '@/components/BoardCard';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { NotificationsDialog } from '@/components/NotificationsDialog';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Toast } from '@/components/Toast';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { BOARDS } from '@/lib/boards';
import { LINKS } from '@/lib/config';
import { storageAvailable } from '@/lib/storage';

export default function Dashboard() {
  const { settings, update } = useSettings();
  const { profile, signedIn, loading: sessionLoading, signOut } = useSession();
  const unread = useUnreadNotifications(signedIn);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const limit = settings?.pageSize ?? 20;
  const ready = settings !== null;

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // #settings / #login / #notifications 用于从弹窗 Dock 直接跳到对应面板。
  useEffect(() => {
    const openFromHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'notifications') {
        setNotificationsOpen(true);
        setSettingsOpen(false);
        return;
      }
      if (hash === 'settings' || hash === 'login') {
        setSettingsOpen(true);
        setNotificationsOpen(false);
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

  const handleSignedIn = useCallback(() => {
    // 令牌变化会让 useSession 自动刷新资料；这里把带个性化字段的榜单全部重新拉一遍。
    refreshAll();
  }, [refreshAll]);

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

  const openNotifications = useCallback(() => {
    setNotificationsOpen(true);
    setSettingsOpen(false);
    if (window.location.hash !== '#notifications') {
      window.history.replaceState(null, '', '#notifications');
    }
    void unread.refresh();
  }, [unread.refresh]);

  const goLoginFromNotifications = useCallback(() => {
    setNotificationsOpen(false);
    setSettingsOpen(true);
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
            <Brand sub={null} />
            <span className="masthead__page">Dashboard</span>
          </a>

          <div className="masthead__actions">
            <button
              type="button"
              className="btn masthead__refresh"
              onClick={handleRefreshAll}
              title="刷新全部榜单"
            >
              <Icon name="refresh" size={15} />
              <span>全部刷新</span>
            </button>
            <button
              type="button"
              className="btn btn--icon masthead__bell"
              onClick={openNotifications}
              title={
                unread.count > 0 ? `通知（${unread.count} 条未读）` : '通知'
              }
              aria-label={unread.count > 0 ? `通知，${unread.count} 条未读` : '通知'}
            >
              <Icon name="bell" size={17} />
              {unread.count > 0 && <span className="masthead__bell-dot" aria-hidden="true" />}
            </button>
            <AccountChip
              signedIn={signedIn}
              loading={sessionLoading}
              profile={profile}
              onLogin={() => setSettingsOpen(true)}
              onSignOut={() => void handleSignOut()}
            />
            <button
              type="button"
              className="btn btn--icon"
              onClick={() => setSettingsOpen(true)}
              title="设置"
              aria-label="打开设置"
            >
              <Icon name="settings" size={17} />
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
              limit={limit}
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

      <SettingsDialog
        open={settingsOpen}
        onClose={closeSettings}
        settings={settings ?? { board: 'latest', section: 'all', pageSize: 20 }}
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
