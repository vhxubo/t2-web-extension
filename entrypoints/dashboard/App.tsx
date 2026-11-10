import { useCallback, useEffect, useState } from 'react';
import { AccountChip } from '@/components/AccountChip';
import { BoardCard } from '@/components/BoardCard';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { SectionRail } from '@/components/SectionRail';
import { SettingsDialog } from '@/components/SettingsDialog';
import { Toast } from '@/components/Toast';
import { useNodes } from '@/hooks/useNodes';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { BOARDS } from '@/lib/boards';
import { LINKS } from '@/lib/config';
import { todayLabel } from '@/lib/format';
import { parseSectionKey, sectionPath } from '@/lib/section';
import { nodesCacheItem, storageAvailable } from '@/lib/storage';
import type { Section } from '@/lib/types';

export default function Dashboard() {
  const { settings, update } = useSettings();
  const { nodes, status: nodesStatus, reload: reloadNodes } = useNodes();
  const { tokens, profile, signedIn, loading: sessionLoading, signOut } = useSession();

  const [section, setSection] = useState<Section>({ kind: 'all' });
  const [applied, setApplied] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const limit = settings?.pageSize ?? 20;
  const nodesReady = nodesStatus !== 'loading';

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // 打开时套用一次默认分区；之后页面上切换分区不再写回默认值。
  useEffect(() => {
    if (!settings || applied) return;
    setSection(parseSectionKey(settings.section));
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
    document.title = `${sectionName} · 全部榜单 — 2Libra 帖子浏览`;
  }, [sectionName]);

  const handleSection = useCallback((next: Section) => {
    setSection(next);
  }, []);

  const refreshAll = useCallback(() => {
    setRefreshKey((current) => current + 1);
  }, []);

  const handleSignedIn = useCallback(() => {
    // 令牌变化会让 useSession 自动刷新资料；这里把带个性化字段的榜单全部重新拉一遍。
    refreshAll();
  }, [refreshAll]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    showToast('已退出登录');
    refreshAll();
  }, [signOut, showToast, refreshAll]);

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
        <aside className="side">
          <div className="section-card">
            <SectionRail
              nodes={nodes}
              value={section}
              onChange={handleSection}
              loading={nodesStatus === 'loading'}
              failed={nodesStatus === 'error'}
              onRetry={() => void reloadNodes(true)}
            />
          </div>
        </aside>

        <main className="main">
          <header className="page-head">
            <div className="page-head__copy">
              <span className="t2-eyebrow page-head__eyebrow">全部榜单</span>
              <h1 className="page-head__title t2-serif">{sectionName}</h1>
              <p className="page-head__sub">并排展示，不用切换 · 分区筛选同步到支持的榜单</p>
            </div>
            <button
              type="button"
              className="btn page-head__refresh"
              onClick={refreshAll}
              title="刷新全部榜单"
            >
              <Icon name="refresh" size={16} />
              全部刷新
            </button>
          </header>

          <div className="board-grid">
            {BOARDS.map((meta) => (
              <BoardCard
                key={`${meta.id}:${refreshKey}`}
                meta={meta}
                section={section}
                sectionName={sectionName}
                nodes={nodes}
                nodesReady={nodesReady}
                limit={limit}
                enabled={applied}
                onLogin={() => setSettingsOpen(true)}
                onResetSection={() => handleSection({ kind: 'all' })}
              />
            ))}
          </div>
        </main>
      </div>

      <SettingsDialog
        open={settingsOpen}
        onClose={closeSettings}
        settings={settings ?? { board: 'latest', section: 'all', pageSize: 20 }}
        nodes={nodes}
        signedIn={signedIn}
        tokens={tokens ?? null}
        profile={profile}
        onUpdateSettings={update}
        onSignedIn={handleSignedIn}
        onSignOut={() => void handleSignOut()}
        onToast={showToast}
        onClearCache={handleClearCache}
      />

      <Toast message={toast} />
    </>
  );
}
