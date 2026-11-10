import { useCallback, useEffect, useRef, useState } from 'react';
import { AccountChip } from '@/components/AccountChip';
import { BoardTabs } from '@/components/BoardTabs';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { PostList } from '@/components/PostList';
import { SectionRail } from '@/components/SectionRail';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Toast } from '@/components/Toast';
import { useFeed } from '@/hooks/useFeed';
import { useNodes } from '@/hooks/useNodes';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { BOARD_MAP, isBoardId } from '@/lib/boards';
import { LINKS } from '@/lib/config';
import { describeError } from '@/lib/errors';
import { clockLabel, compactNumber, todayLabel } from '@/lib/format';
import { sectionKey, sectionOptions, parseSectionKey, sectionPath } from '@/lib/section';
import { nodesCacheItem, storageAvailable, type Settings } from '@/lib/storage';
import type { BoardId, Section } from '@/lib/types';

export default function Dashboard() {
  const { settings, update } = useSettings();
  const { nodes, status: nodesStatus, reload: reloadNodes } = useNodes();
  const { tokens, profile, signedIn, loading: sessionLoading, signOut } = useSession();

  const [board, setBoard] = useState<BoardId>('latest');
  const [section, setSection] = useState<Section>({ kind: 'all' });
  const [applied, setApplied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  const limit = settings?.pageSize ?? 20;
  const nodesReady = nodesStatus !== 'loading';

  const feed = useFeed({
    board,
    section,
    nodes,
    nodesReady,
    limit,
    enabled: applied,
  });

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // 打开时套用一次默认视图；之后视图切换不再写回默认值。
  useEffect(() => {
    if (!settings || applied) return;
    const nextBoard = isBoardId(settings.board) ? settings.board : 'latest';
    const nextSection = parseSectionKey(settings.section);
    setBoard(nextBoard);
    setSection(
      !BOARD_MAP[nextBoard].supportsSection && nextSection.kind !== 'all'
        ? { kind: 'all' }
        : nextSection,
    );
    setApplied(true);
  }, [settings, applied]);

  // #settings / #login 用于从弹窗跳到对应面板。
  useEffect(() => {
    const openFromHash = () => {
      const hash = window.location.hash.replace('#', '');
      if (hash === 'settings' || hash === 'login') setSettingsOpen(true);
    };
    openFromHash();
    window.addEventListener('hashchange', openFromHash);
    return () => window.removeEventListener('hashchange', openFromHash);
  }, []);

  const sectionName = sectionPath(section, nodes);

  useEffect(() => {
    document.title = `${sectionName} · ${BOARD_MAP[board].label} — 2Libra 帖子浏览`;
  }, [sectionName, board]);

  const handleBoard = useCallback(
    (next: BoardId) => {
      const meta = BOARD_MAP[next];
      if (!meta.supportsSection && section.kind !== 'all') {
        setSection({ kind: 'all' });
        showToast(`「${meta.label}」只支持全站，已切回全站`);
      }
      setBoard(next);
    },
    [section.kind, showToast],
  );

  const handleSection = useCallback(
    (next: Section) => {
      setSection(next);
      if (next.kind !== 'all' && !BOARD_MAP[board].supportsSection) {
        setBoard('latest');
        showToast(`「${BOARD_MAP[board].label}」不分区，已切换到「新发表」`);
      }
    },
    [board, showToast],
  );

  // 默认值里保存了「热议榜 + 具体分区」这种组合时，自动收敛为全站。
  const handleUpdateSettings = useCallback(
    async (patch: Partial<Settings>) => {
      const next: Partial<Settings> = { ...patch };
      const targetSection = next.section ?? settings?.section ?? 'all';
      if (next.board && !BOARD_MAP[next.board].supportsSection && targetSection !== 'all') {
        next.section = 'all';
      }
      if (
        next.section &&
        next.section !== 'all' &&
        !(BOARD_MAP[settings?.board ?? 'latest'] ?? BOARD_MAP.latest).supportsSection
      ) {
        next.board = 'latest';
      }
      await update(next);
    },
    [update, settings],
  );

  const handleSignedIn = useCallback(() => {
    // 令牌变化会让 useSession 自动刷新资料，这里只需要重新拉一次列表拿个性化字段。
    void feed.reload();
  }, [feed]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    showToast('已退出登录');
    void feed.reload();
  }, [signOut, showToast, feed]);

  const handleClearCache = useCallback(async () => {
    await nodesCacheItem.setValue(null);
    await reloadNodes(true);
  }, [reloadNodes]);

  const closeSettings = useCallback(() => {
    setSettingsOpen(false);
    if (window.location.hash) {
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, []);

  // 触底自动加载；出错后停下来，等用户点重试。
  useEffect(() => {
    const element = sentinelRef.current;
    if (!element || !feed.hasMore || feed.moreError) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void feed.loadMore();
      },
      { rootMargin: '320px 0px' },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [feed.hasMore, feed.moreError, feed.loadMore]);

  const moreError = feed.moreError ? describeError(feed.moreError) : null;
  const options = sectionOptions(nodes);
  const currentKey = sectionKey(section);
  const optionsWithFallback = options.some((option) => option.value === currentKey)
    ? options
    : [{ value: currentKey, label: sectionName, group: null, depth: 0 }, ...options];

  return (
    <>
      <header className="masthead">
        <div className="masthead__inner">
          <a
            className="masthead__brand"
            href={LINKS.site}
            target="_blank"
            rel="noreferrer"
            title="打开 2Libra"
          >
            <Brand />
          </a>
          <span className="masthead__date">{todayLabel()}</span>
          <div className="masthead__actions">
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
        <div className="masthead__rule" aria-hidden="true" />
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

      <div className="shell">
        <div className="rail-wrap">
          <SectionRail
            nodes={nodes}
            value={section}
            onChange={handleSection}
            loading={nodesStatus === 'loading'}
            failed={nodesStatus === 'error'}
            onRetry={() => void reloadNodes(true)}
          />
        </div>

        <main className="feed-wrap">
          <div className="feed-tabs">
            <BoardTabs
              value={board}
              onChange={handleBoard}
              sectionFiltered={section.kind !== 'all'}
            />
            <button
              type="button"
              className="btn btn--icon feed-tabs__refresh"
              onClick={() => void feed.reload()}
              title="刷新列表"
              aria-label="刷新列表"
              data-spinning={feed.status === 'loading'}
            >
              <Icon name="refresh" size={16} />
            </button>
          </div>

          <div className="mobile-sections">
            <span className="mobile-sections__label">分区</span>
            <select
              className="select select--sm mobile-sections__select"
              aria-label="切换分区"
              value={currentKey}
              onChange={(event) => {
                const next = parseSectionKey(event.target.value);
                handleSection(next);
              }}
            >
              {optionsWithFallback.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.group ? `${option.group} · ${option.label}` : option.label}
                </option>
              ))}
            </select>
          </div>

          <header className="feed-head">
            <div>
              <span className="t2-eyebrow feed-head__eyebrow">
                榜单 · {BOARD_MAP[board].label}
              </span>
              <h1 className="feed-head__title t2-serif">{sectionName}</h1>
              <p className="feed-head__sub">
                {BOARD_MAP[board].hint}
                {section.kind === 'all' ? ' · 全站' : ' · 已按分区筛选'}
              </p>
            </div>
            <div className="feed-head__meta">
              <span>
                共 <b>{feed.status === 'ready' ? compactNumber(feed.total) : '—'}</b> 条
              </span>
              <span>{feed.updatedAt ? `${clockLabel(new Date(feed.updatedAt))} 更新` : '等待加载'}</span>
            </div>
          </header>

          <div role="tabpanel" id="feed-panel" aria-labelledby={`board-tab-${board}`}>
            <PostList
              items={feed.items}
              status={feed.status}
              error={feed.error}
              sectionFiltered={section.kind !== 'all'}
              sectionName={sectionName}
              onRetry={() => void feed.reload()}
              onLogin={() => setSettingsOpen(true)}
              onResetSection={() => handleSection({ kind: 'all' })}
            />

            {feed.status === 'ready' && feed.items.length > 0 && (
              <div className="feed-foot">
                {moreError && (
                  <div className="banner banner--error feed-foot__error" role="alert">
                    <Icon name="alert" size={16} className="banner__icon" />
                    <div className="banner__body">
                      <strong className="banner__title">{moreError.title}</strong>
                      {moreError.detail && <span>{moreError.detail}</span>}
                      <div className="banner__actions">
                        <button
                          type="button"
                          className="btn btn--sm"
                          onClick={() => void feed.loadMore()}
                        >
                          继续加载
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {feed.hasMore ? (
                  <>
                    <button
                      type="button"
                      className="btn load-more"
                      onClick={() => void feed.loadMore()}
                      disabled={feed.loadingMore}
                    >
                      {feed.loadingMore ? '加载中…' : '加载更多'}
                    </button>
                    <div ref={sentinelRef} className="feed-sentinel" aria-hidden="true" />
                  </>
                ) : (
                  <span className="feed-foot__end">
                    — 到底了 · 共 {compactNumber(feed.total)} 条 —
                  </span>
                )}
              </div>
            )}
          </div>
        </main>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={closeSettings}
        settings={settings ?? { board: 'latest', section: 'all', pageSize: 20, clientId: '' }}
        nodes={nodes}
        signedIn={signedIn}
        tokens={tokens ?? null}
        profile={profile}
        onUpdateSettings={handleUpdateSettings}
        onSignedIn={handleSignedIn}
        onSignOut={() => void handleSignOut()}
        onToast={showToast}
        onClearCache={handleClearCache}
      />

      <Toast message={toast} />
    </>
  );
}
