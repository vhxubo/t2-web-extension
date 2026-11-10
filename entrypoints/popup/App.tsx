import { useCallback, useEffect, useState } from 'react';
import { AccountChip } from '@/components/AccountChip';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { PostList } from '@/components/PostList';
import { Toast } from '@/components/Toast';
import { useFeed } from '@/hooks/useFeed';
import { useNodes } from '@/hooks/useNodes';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { BOARDS, BOARD_MAP, isBoardId } from '@/lib/boards';
import { compactNumber } from '@/lib/format';
import { groupNodes } from '@/lib/nodes';
import { openDashboard } from '@/lib/nav';
import { parseSectionKey, sectionKey, sectionOptions, sectionPath } from '@/lib/section';
import { storageAvailable, type Settings } from '@/lib/storage';
import type { BoardId, Section } from '@/lib/types';

export default function Popup() {
  const { settings, update } = useSettings();
  const { nodes, status: nodesStatus, reload: reloadNodes } = useNodes();
  const { profile, signedIn, loading: sessionLoading, signOut } = useSession();

  const [board, setBoard] = useState<BoardId>('latest');
  const [section, setSection] = useState<Section>({ kind: 'all' });
  const [initialized, setInitialized] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const feed = useFeed({
    board,
    section,
    nodes,
    nodesReady: nodesStatus !== 'loading',
    limit: 5,
    enabled: initialized,
  });

  useEffect(() => {
    if (!settings || initialized) return;
    const nextBoard = isBoardId(settings.board) ? settings.board : 'latest';
    const nextSection = parseSectionKey(settings.section);
    setBoard(nextBoard);
    setSection(
      !BOARD_MAP[nextBoard].supportsSection && nextSection.kind !== 'all'
        ? { kind: 'all' }
        : nextSection,
    );
    setInitialized(true);
  }, [settings, initialized]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const persist = useCallback(
    async (patch: Partial<Settings>) => {
      await update(patch);
    },
    [update],
  );

  const handleBoard = async (next: BoardId) => {
    const meta = BOARD_MAP[next];
    const keepSection = meta.supportsSection;
    setBoard(next);
    if (!keepSection) {
      setSection({ kind: 'all' });
      await persist({ board: next, section: 'all' });
      if (section.kind !== 'all') setToast(`「${meta.label}」只在全站可用，已切回全站`);
      return;
    }
    await persist({ board: next });
  };

  const handleSection = async (key: string) => {
    const next = parseSectionKey(key);
    setSection(next);
    let nextBoard = board;
    if (next.kind !== 'all' && !BOARD_MAP[board].supportsSection) {
      nextBoard = 'latest';
      setBoard('latest');
      setToast(`「${BOARD_MAP[board].label}」不分区，已切换到「新发表」`);
    }
    await persist({ section: key, board: nextBoard });
  };

  const goDashboard = (hash?: string) => {
    void openDashboard(hash).finally(() => window.close());
  };

  const handleSignOut = async () => {
    await signOut();
    setToast('已退出登录');
    void feed.reload();
  };

  const currentKey = sectionKey(section);
  const options = sectionOptions(nodes);
  const optionsWithFallback = options.some((option) => option.value === currentKey)
    ? options
    : [{ value: currentKey, label: sectionPath(section, nodes), group: null, depth: 0 }, ...options];
  const groups = groupNodes(nodes);
  const boardMeta = BOARD_MAP[board];

  return (
    <div className="popup">
      <header className="popup__head">
        <Brand compact />
        <div className="popup__head-actions">
          <AccountChip
            signedIn={signedIn}
            loading={sessionLoading}
            profile={profile}
            compact
            onLogin={() => goDashboard('login')}
            onSignOut={() => void handleSignOut()}
          />
          <button
            type="button"
            className="btn btn--icon"
            onClick={() => goDashboard('settings')}
            title="打开设置"
            aria-label="打开设置"
          >
            <Icon name="settings" size={17} />
          </button>
        </div>
      </header>

      {!storageAvailable && (
        <p className="popup__warn" role="alert">
          storage 权限未生效，设置不会保存。请在扩展管理页重新加载后刷新。
        </p>
      )}

      <div className="popup__defaults">
        <label className="popup__select popup__select--board">
          <span className="popup__select-label">榜单</span>
          <select
            className="select select--sm"
            value={board}
            onChange={(event) => {
              if (isBoardId(event.target.value)) void handleBoard(event.target.value as BoardId);
            }}
            aria-label="默认榜单"
          >
            {BOARDS.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        <label className="popup__select popup__select--section">
          <span className="popup__select-label">分区</span>
          <select
            className="select select--sm"
            value={currentKey}
            onChange={(event) => void handleSection(event.target.value)}
            aria-label="默认分区"
          >
            {groups.length === 0 ? (
              optionsWithFallback.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))
            ) : (
              <>
                <option value="all">全站</option>
                {!options.some((option) => option.value === currentKey) && (
                  <option value={currentKey}>{sectionPath(section, nodes)}</option>
                )}
                {groups.map((group) => (
                  <optgroup key={group.dimension} label={group.label}>
                    {group.nodes.map((node) => (
                      <option key={`p:${node.slug}`} value={`p:${node.slug}`}>
                        {node.name}
                      </option>
                    ))}
                    {group.nodes.flatMap((node) =>
                      (node.children ?? []).map((child) => (
                        <option key={`n:${child.slug}`} value={`n:${child.slug}`}>
                          {`　${child.name}`}
                        </option>
                      )),
                    )}
                  </optgroup>
                ))}
              </>
            )}
          </select>
        </label>

        <span className="chip popup__default-chip" title="这两个选项会作为弹窗与新标签页的默认视图">
          默认
        </span>
      </div>

      <section className="popup__feed">
        <div className="popup__feed-head">
          <span className="popup__feed-title t2-serif">{sectionPath(section, nodes)}</span>
          <span className="popup__feed-meta t2-mono">
            {boardMeta.label}
            {feed.status === 'ready' ? ` · ${compactNumber(feed.total)}` : ''}
          </span>
          <button
            type="button"
            className="btn btn--icon popup__refresh"
            onClick={() => {
              void feed.reload();
              void reloadNodes(false);
            }}
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
            sectionFiltered={section.kind !== 'all'}
            sectionName={sectionPath(section, nodes)}
            onRetry={() => void feed.reload()}
            onLogin={() => goDashboard('login')}
            onResetSection={() => void handleSection('all')}
          />
        </div>
      </section>

      <footer className="popup__foot">
        <button
          type="button"
          className="btn btn--primary"
          onClick={() => goDashboard()}
          title="在新标签页浏览完整列表"
        >
          <span>在新标签页打开发帖列表</span>
          <Icon name="arrow" size={15} />
        </button>
      </footer>

      <Toast message={toast} />
    </div>
  );
}
