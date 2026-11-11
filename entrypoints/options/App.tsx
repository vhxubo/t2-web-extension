import { browser } from '#imports';
import { useCallback, useEffect, useState } from 'react';
import { Brand } from '@/components/Brand';
import { Icon, type IconName } from '@/components/Icon';
import { SettingsPanel } from '@/components/SettingsPanel';
import { Toast } from '@/components/Toast';
import { useNodes } from '@/hooks/useNodes';
import { useSession } from '@/hooks/useSession';
import { useSettings } from '@/hooks/useSettings';
import { useTheme } from '@/hooks/useTheme';
import { AUTHOR } from '@/lib/config';
import { dashboardUrl, profileHref } from '@/lib/nav';
import { storageAvailable } from '@/lib/storage';

interface NavItem {
  href: string;
  label: string;
  icon: IconName;
}

const NAV_ITEMS: readonly NavItem[] = [
  { href: '#settings-account', label: '账号', icon: 'user' },
  { href: '#settings-nodes', label: '节点配置', icon: 'settings' },
  { href: '#settings-appearance', label: '外观', icon: 'palette' },
];

const FALLBACK_SECTION = NAV_ITEMS[0]?.href ?? '#settings-account';

/** 独立的设置页（同时是扩展的选项页），不再塞进仪表盘的弹窗里。 */
export default function SettingsPage() {
  const { settings, update } = useSettings();
  useTheme(settings?.theme);
  const { profile, signedIn, signOut, reloadProfile } = useSession();
  const {
    nodes,
    status: nodesStatus,
    error: nodesError,
    reload: reloadNodes,
  } = useNodes();

  const [toast, setToast] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState(FALLBACK_SECTION);

  const manifest = browser.runtime.getManifest();

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2800);
    return () => window.clearTimeout(timer);
  }, [toast]);

  /* 滚动时高亮当前卡片：顶部留出 sticky 顶栏的高度，取最后一处越过标记线的标题。 */
  useEffect(() => {
    if (!settings) return;

    let frame = 0;
    const updateActive = () => {
      frame = 0;
      const marker = window.scrollY + 136;
      let current = FALLBACK_SECTION;

      for (const item of NAV_ITEMS) {
        const target = document.getElementById(item.href.slice(1));
        if (!target) continue;
        if (target.getBoundingClientRect().top + window.scrollY <= marker) {
          current = item.href;
        }
      }
      setActiveSection(current);
    };

    const onScroll = () => {
      if (frame) return;
      frame = window.requestAnimationFrame(updateActive);
    };

    updateActive();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [settings]);

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

  const handleReloadNodes = useCallback(() => {
    void reloadNodes(true);
  }, [reloadNodes]);

  return (
    <div className="settings-page">
      <a className="settings-skip-link" href="#settings-main">
        跳到主要内容
      </a>

      <header className="settings-topbar">
        <div className="settings-topbar__inner">
          <a
            className="settings-topbar__brand"
            href={dashboardUrl()}
            title="打开数据仪表盘"
          >
            <Brand compact sub={null} />
          </a>

          <div className="settings-topbar__actions">
            <a
              className="settings-dashboard-btn"
              href={dashboardUrl()}
              target="_blank"
              rel="noreferrer"
              title="在新标签页打开数据仪表盘"
            >
              <Icon name="chart" size={15} />
              <span>数据仪表盘</span>
              <Icon name="external" size={12} className="settings-dashboard-btn__arrow" />
            </a>
          </div>
        </div>
      </header>

      <div className="settings-shell">
        <aside className="settings-nav" aria-label="设置导航">
          <div className="settings-nav__inner">
            <p className="settings-nav__label">Settings</p>

            <nav className="settings-nav__links">
              {NAV_ITEMS.map((item) => {
                const active = activeSection === item.href;
                return (
                  <a
                    key={item.href}
                    className={`settings-nav__link${active ? ' is-active' : ''}`}
                    href={item.href}
                    aria-current={active ? 'location' : undefined}
                    onClick={() => setActiveSection(item.href)}
                  >
                    <span className="settings-nav__icon" aria-hidden="true">
                      <Icon name={item.icon} size={16} />
                    </span>
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </nav>

            <div className="settings-nav__save">
              <span className="settings-nav__save-dot" aria-hidden="true" />
              <div>
                <strong>改动即时保存</strong>
                <span>仅保存在本地设备</span>
              </div>
            </div>
          </div>
        </aside>

        <main className="settings-content" id="settings-main" tabIndex={-1}>
          <header className="settings-hero">
            <div>
              <p className="settings-hero__eyebrow">Settings · 偏好设置</p>
              <h1 className="settings-hero__title">设置</h1>
              <p className="settings-hero__desc">
                配置账号、弹窗 Tab、仪表盘卡片与外观。所有改动会立即保存，不需要「保存」按钮。
              </p>
            </div>

            <span className="settings-hero__meta" title="扩展版本与开发者主页">
              <span className="settings-hero__meta-dot" aria-hidden="true" />
              v{manifest.version} · MV{manifest.manifest_version}
              <span className="settings-hero__meta-divider" aria-hidden="true" />
              <a
                className="settings-hero__profile"
                href={profileHref(AUTHOR.name)}
                target="_blank"
                rel="noreferrer"
                title="打开开发者 vhxubo 的 2Libra 主页"
              >
                <Icon name="user" size={12} />
                开发者主页
                <Icon name="external" size={10} />
              </a>
            </span>
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
              nodes={nodes}
              nodesStatus={nodesStatus}
              nodesError={nodesError}
              onReloadNodes={handleReloadNodes}
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

          <footer className="settings-foot-note">
            <span>T2 Web Extension</span>
            <span>设置仅保存在本地设备</span>
          </footer>
        </main>
      </div>

      <Toast message={toast} />
    </div>
  );
}
