import { useCallback, useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { BoardTabs } from '@/components/BoardTabs';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { PostList } from '@/components/PostList';
import { useFeed } from '@/hooks/useFeed';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { BOARD_MAP, POPUP_BOARDS, isPopupBoardId } from '@/lib/boards';
import { openDashboard } from '@/lib/nav';
import { storageAvailable, type Settings } from '@/lib/storage';
import type { ApiNode, BoardId, Section } from '@/lib/types';

/** 弹窗只看全站；分区筛选留给完整页面，避免弹窗里出现隐藏的筛选状态。 */
const ALL_SITES: Section = { kind: 'all' };
const NO_NODES: ApiNode[] = [];
/** 弹窗里每个榜单固定展示 20 条，超出后在列表内滚动。 */
const POPUP_LIMIT = 20;

export default function Popup() {
  const { settings, update } = useSettings();
  const { profile, signedIn, loading: sessionLoading } = useSession();

  const [board, setBoard] = useState<BoardId>('latest');
  const [initialized, setInitialized] = useState(false);

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
    // 弹窗不再提供评分榜；旧版本存下的评分榜回落到「新发表」。
    setBoard(isPopupBoardId(settings.board) ? settings.board : 'latest');
    setInitialized(true);
  }, [settings, initialized]);

  const persist = useCallback(
    async (patch: Partial<Settings>) => {
      await update(patch);
    },
    [update],
  );

  const handleBoard = async (next: BoardId) => {
    setBoard(next);
    await persist({ board: next });
  };

  // 弹窗只留一个账号入口：登录、退出、默认值都在完整页面的设置弹窗里。
  const goDashboard = (hash?: string) => {
    void openDashboard(hash).finally(() => window.close());
  };

  const boardMeta = BOARD_MAP[board];

  return (
    <div className="popup">
      <header className="popup__head">
        <Brand compact markOnly />
        <div className="popup__head-actions">
          <button
            type="button"
            className="popup__full"
            onClick={() => goDashboard()}
            title="在新标签页打开完整列表"
            aria-label="在新标签页打开完整列表"
          >
            <span>完整列表</span>
            <Icon name="external" size={12} />
          </button>
          <button
            type="button"
            className="popup__account"
            onClick={() => goDashboard('settings')}
            disabled={sessionLoading}
            title={signedIn ? '账号与设置' : '登录与设置'}
            aria-label={signedIn ? '账号与设置' : '登录与设置'}
          >
            {sessionLoading ? (
              <span className="skeleton skeleton--line popup__account-skeleton" aria-hidden="true" />
            ) : signedIn ? (
              <>
                <Avatar src={profile?.avatar_url} name={profile?.username ?? '已登录'} />
                <span className="account__name">{profile?.username ?? '已登录'}</span>
              </>
            ) : (
              <>
                <Icon name="user" size={15} />
                <span>登录</span>
              </>
            )}
          </button>
        </div>
      </header>

      {!storageAvailable && (
        <p className="popup__warn" role="alert">
          storage 权限未生效，设置不会保存。请在扩展管理页重新加载后刷新。
        </p>
      )}

      <section
        className="popup__feed"
        id="feed-panel"
        role="tabpanel"
        aria-labelledby={`board-tab-${board}`}
      >
        <div className="popup__feed-head">
          <span className="popup__feed-title t2-serif">{boardMeta.label}</span>
          <button
            type="button"
            className="btn btn--icon popup__refresh"
            onClick={() => void feed.reload()}
            title="刷新"
            aria-label="刷新列表"
            data-spinning={feed.status === 'loading'}
          >
            <Icon name="refresh" size={15} />
          </button>
        </div>

        <div className="popup__feed-body">
          <PostList
            items={feed.items}
            status={feed.status}
            error={feed.error}
            compact
            showRank={false}
            titleOnly
            sectionFiltered={false}
            onRetry={() => void feed.reload()}
            onLogin={() => goDashboard('settings')}
          />
        </div>
      </section>

      <div className="popup__bottom">
        <BoardTabs
          boards={POPUP_BOARDS}
          value={board}
          onChange={(next) => void handleBoard(next)}
          sectionFiltered={false}
        />
      </div>
    </div>
  );
}
