import { useCallback, useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { BoardTabs } from '@/components/BoardTabs';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { PostList } from '@/components/PostList';
import { useFeed } from '@/hooks/useFeed';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { useUnreadNotifications } from '@/hooks/useUnreadNotifications';
import { BOARD_MAP, BOARDS, isBoardId } from '@/lib/boards';
import { openDashboard } from '@/lib/nav';
import { storageAvailable } from '@/lib/storage';
import type { ApiNode, BoardId, Section } from '@/lib/types';

/** 弹窗只看全站。 */
const ALL_SITES: Section = { kind: 'all' };
const NO_NODES: ApiNode[] = [];
/** 弹窗里每个榜单固定展示 20 条，超出后在列表内滚动。 */
const POPUP_LIMIT = 20;

/**
 * 方案 C：顶部 Header + 榜单 Tab，中部单行标题列表，底部固定 Dock。
 * 三个 Dock 入口分别是「快捷热榜 / 数据仪表盘 / 设置」，
 * 仪表盘入口上的小红点来自未读通知数。
 */
export default function Popup() {
  const { settings, update } = useSettings();
  const { profile, signedIn, loading: sessionLoading } = useSession();
  const unread = useUnreadNotifications(signedIn);

  const [board, setBoard] = useState<BoardId>('latest');
  const [initialized, setInitialized] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);

  const feed = useFeed({
    board,
    section: ALL_SITES,
    nodes: NO_NODES,
    nodesReady: true,
    limit: POPUP_LIMIT,
    enabled: initialized,
  });

  useEffect(() => {
    if (!settings || initialized) return;
    // 旧版本存下的榜单若已下线，回落到「最新」。
    setBoard(isBoardId(settings.board) ? settings.board : 'latest');
    setInitialized(true);
  }, [settings, initialized]);

  const handleBoard = useCallback(
    async (next: BoardId) => {
      if (next === board) return;
      setBoard(next);
      await update({ board: next });
    },
    [board, update],
  );

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

  return (
    <div className="popup">
      <h1 className="sr-only">社区热榜</h1>

      <header className="popup__head">
        <Brand compact name="社区热榜" />
        <div className="popup__head-actions">
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
            className="popup__account"
            onClick={() => goDashboard('settings')}
            disabled={sessionLoading}
            title={signedIn ? `账号与设置（@${profile?.username ?? '已登录'}）` : '登录与设置'}
            aria-label={signedIn ? '账号与设置' : '登录与设置'}
          >
            {sessionLoading ? (
              <span className="skeleton popup__account-skeleton" aria-hidden="true" />
            ) : signedIn ? (
              <Avatar src={profile?.avatar_url} name={profile?.username ?? '已登录'} />
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
    </div>
  );
}
