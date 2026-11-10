import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { BoardTabs } from '@/components/BoardTabs';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { PostList } from '@/components/PostList';
import { SearchDialog } from '@/components/SearchDialog';
import { useFeed } from '@/hooks/useFeed';
import { useSearchHotkey } from '@/hooks/useSearch';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { useTheme } from '@/hooks/useTheme';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { BOARD_MAP, BOARDS, isBoardId } from '@/lib/boards';
import { FEED_PAGE_SIZE } from '@/lib/feed';
import { openDashboard } from '@/lib/nav';
import { storageAvailable } from '@/lib/storage';
import type { ApiNode, BoardId, Section } from '@/lib/types';

/** 弹窗只看全站。 */
const ALL_SITES: Section = { kind: 'all' };
const NO_NODES: ApiNode[] = [];

/**
 * 方案 C：顶部 Header + 榜单 Tab，中部单行标题列表，底部固定 Dock。
 * 三个 Dock 入口分别是「快捷热榜 / 数据仪表盘 / 设置」，
 * 仪表盘入口上的小红点来自未读通知数。
 */
export default function Popup() {
  const { settings, update } = useSettings();
  const resolvedTheme = useTheme(settings?.theme);
  const { profile, signedIn, loading: sessionLoading, profileLoading } = useSession();
  const unread = useUnreadNotifications(signedIn);

  const [board, setBoard] = useState<BoardId>('latest');
  const [initialized, setInitialized] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const openSearch = useCallback(() => setSearchOpen(true), []);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  useSearchHotkey(openSearch);

  const feed = useFeed({
    board,
    section: ALL_SITES,
    nodes: NO_NODES,
    nodesReady: true,
    limit: FEED_PAGE_SIZE,
    enabled: initialized,
  });

  // 只在弹窗打开时读取一次默认榜单；切换 Tab 只影响当次浏览，
  // 不改写设置 —— 默认进入只能在完整页面的设置弹窗里修改。
  useEffect(() => {
    if (!settings || initialized) return;
    // 旧版本存下的榜单若已下线，回落到「最新」。
    setBoard(isBoardId(settings.board) ? settings.board : 'latest');
    setInitialized(true);
  }, [settings, initialized]);

  const handleBoard = useCallback((next: BoardId) => {
    setBoard(next);
  }, []);

  // Header 快捷键：在浅色 / 深色之间直接切换（想恢复跟随系统仍可到设置弹窗里选）。
  const toggleTheme = useCallback(() => {
    void update({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' });
  }, [resolvedTheme, update]);

  // 弹窗只留一个账号入口：登录、退出、默认值都在完整页面的设置弹窗里。
  const goDashboard = useCallback((hash?: string) => {
    void openDashboard(hash).finally(() => window.close());
  }, []);

  const handleDashboard = useCallback(() => {
    // 有未读提醒时直接落在通知面板，否则停留在榜单仪表盘。
    goDashboard(unread.count > 0 ? 'notifications' : undefined);
  }, [goDashboard, unread.count]);

  const handleQuick = useCallback(() => {
    listRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const boardMeta = BOARD_MAP[board];
  const unreadLabel = unread.count > 0 ? `，${unread.count} 条未读通知` : '';
  const accountLoading = sessionLoading || (signedIn && !profile && profileLoading);
  const themePreference = settings?.theme ?? 'system';
  const currentThemeLabel = resolvedTheme === 'dark' ? '深色' : '浅色';
  const nextThemeLabel = resolvedTheme === 'dark' ? '浅色' : '深色';
  const themeTitle =
    themePreference === 'system'
      ? `外观：跟随系统（当前${currentThemeLabel}），点击改为${nextThemeLabel}`
      : `外观：当前${currentThemeLabel}，点击切换为${nextThemeLabel}`;

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
            onClick={() => goDashboard('settings')}
            disabled={sessionLoading}
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

      <div className="popup__tabs">
        <BoardTabs
          boards={BOARDS}
          value={board}
          onChange={(next) => void handleBoard(next)}
          sectionFiltered={false}
          shortLabels
        />
      </div>

      <section
        className="popup__feed"
        id="feed-panel"
        role="tabpanel"
        aria-labelledby={`board-tab-${board}`}
        aria-label={`${boardMeta.label}列表`}
      >
        <div className="popup__feed-body" ref={listRef}>
          <PostList
            items={feed.items}
            status={feed.status}
            error={feed.error}
            compact
            showRank={false}
            titleOnly
            oneLine
            sectionFiltered={false}
            onRetry={() => void feed.reload()}
            onLogin={() => goDashboard('settings')}
          />
        </div>
      </section>

      <nav className="popup__dock" aria-label="弹窗导航">
        <button
          type="button"
          className="popup__dock-item popup__dock-item--active"
          onClick={handleQuick}
          aria-current="page"
          title="回到快捷热榜顶部"
        >
          <Icon name="flame" size={16} />
          <span>快捷热榜</span>
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
          onClick={() => goDashboard('settings')}
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
          goDashboard('settings');
        }}
      />
    </div>
  );
}
