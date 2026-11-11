import { useCallback, useEffect, useState } from 'react';
import { Brand } from '@/components/Brand';
import { Icon } from '@/components/Icon';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Toast } from '@/components/Toast';
import { useNodes } from '@/hooks/useNodes';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { useTheme } from '@/hooks/useTheme';
import { dashboardUrl } from '@/lib/nav';
import { storageAvailable } from '@/lib/storage';

const NAV_ITEMS = [
  { href: '#settings-account', label: '账号' },
  { href: '#settings-nodes', label: '节点配置' },
  { href: '#settings-appearance', label: '外观' },
  { href: '#settings-about', label: '关于' },
] as const;

/** 独立的设置页（同时是扩展的选项页），不再塞进仪表盘的弹窗里。 */
export default function SettingsPage() {
  const { settings, update } = useSettings();
  useTheme(settings?.theme);
  const { profile, signedIn, signOut, reloadProfile } = useSession();
  const nodeState = useNodes();

  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const showToast = useCallback((message: string) => {
    setToast(message);
  }, []);

  const handleSignedIn = useCallback(async () => {
    await reloadProfile();
  }, [reloadProfile]);

  const handleSignOut = useCallback(async () => {
    await signOut();
    showToast('已退出登录');
  }, [showToast, signOut]);

  const reloadNodes = useCallback(() => {
    void nodeState.reload(true);
  }, [nodeState]);

  return (
    <div className="settings-page">
      <header className="settings-topbar">
        <a
          className="settings-topbar__brand"
          href={dashboardUrl()}
          title="打开数据仪表盘"
        >
          <Brand compact sub={null} />
        </a>

        <div className="settings-topbar__actions">
          <a className="btn btn--sm" href={dashboardUrl()}>
            <Icon name="chart" size={14} />
            <span>数据仪表盘</span>
          </a>
        </div>
      </header>

      <div className="settings-shell">
        <aside className="settings-nav" aria-label="设置导航">
          <p className="settings-nav__label">Settings</p>
          <nav className="settings-nav__links">
            {NAV_ITEMS.map((item) => (
              <a key={item.href} href={item.href}>
                {item.label}
              </a>
            ))}
          </nav>
          <p className="settings-nav__note">改动即时保存，只留在本地设备。</p>
        </aside>

        <main className="settings-content">
          <header className="settings-hero">
            <p className="settings-hero__eyebrow">T2 WEB EXTENSION</p>
            <h1 className="settings-hero__title">设置</h1>
            <p className="settings-hero__desc">
              配置弹窗 Tab、仪表盘卡片、默认视图与外观。所有改动立即保存，不需要「保存」按钮。
            </p>
          </header>

          {!storageAvailable && (
            <div className="banner banner--error settings-storage-note" role="alert">
              <Icon name="alert" size={16} className="banner__icon" />
              <div className="banner__body">
                storage 权限还没生效：这里的改动不会保存。到 chrome://extensions 重新加载扩展后再试。
              </div>
            </div>
          )}

          {settings ? (
            <SettingsPanel
              settings={settings}
              nodes={nodeState.nodes}
              nodesStatus={nodeState.status}
              nodesError={nodeState.error}
              onReloadNodes={reloadNodes}
              signedIn={signedIn}
              profile={profile}
              onUpdateSettings={update}
              onSignedIn={handleSignedIn}
              onSignOut={() => void handleSignOut()}
              onToast={showToast}
            />
          ) : (
            <div className="settings-loading" aria-hidden="true">
              <span className="skeleton settings-loading__title" />
              <div className="settings-loading__card">
                <span className="skeleton skeleton--line" />
                <span className="skeleton skeleton--line skeleton--short" />
                <span className="skeleton skeleton--line" />
              </div>
              <div className="settings-loading__card">
                <span className="skeleton skeleton--line" />
                <span className="skeleton skeleton--line skeleton--short" />
              </div>
            </div>
          )}

          <p className="settings-foot-note">T2 Web Extension · 设置仅保存在本地设备。</p>
        </main>
      </div>

      <Toast message={toast} />
    </div>
  );
}
