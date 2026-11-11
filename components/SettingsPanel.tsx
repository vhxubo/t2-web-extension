import { useState } from 'react';
import { startLogin } from '../lib/auth';
import { OAUTH_CONFIGURED } from '../lib/config';
import { describeError } from '../lib/errors';
import { type Settings, type ThemePreference } from '../lib/storage';
import type { NodesStatus } from '../hooks/useNodes';
import type { ApiNode, Profile } from '../lib/types';
import { Avatar } from './Avatar';
import { Icon, type IconName } from './Icon';
import { NodeConfig } from './NodeConfig';

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  icon: IconName;
  label: string;
  hint: string;
}> = [
  { value: 'light', icon: 'sun', label: '浅色', hint: '始终使用浅色界面' },
  { value: 'dark', icon: 'moon', label: '深色', hint: '始终使用深色界面' },
  { value: 'system', icon: 'monitor', label: '跟随系统', hint: '跟随操作系统的深浅色外观' },
];

interface SettingsPanelProps {
  settings: Settings;
  nodes: ApiNode[];
  nodesStatus: NodesStatus;
  nodesError: unknown;
  onReloadNodes: () => void;
  signedIn: boolean;
  profile: Profile | null;
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void> | void;
  onSignedIn: () => void | Promise<void>;
  onSignOut: () => void;
  onToast: (message: string) => void;
}

export function SettingsPanel({
  settings,
  nodes,
  nodesStatus,
  nodesError,
  onReloadNodes,
  signedIn,
  profile,
  onUpdateSettings,
  onSignedIn,
  onSignOut,
  onToast,
}: SettingsPanelProps) {
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const accountName = profile?.display_name || profile?.username || '已登录';

  const handleLogin = async () => {
    setLoginError(null);
    if (!OAUTH_CONFIGURED) {
      setLoginError('登录暂不可用。');
      return;
    }
    setLoginBusy(true);
    try {
      await startLogin();
      // 登录成功后立刻触发一次资料刷新：头像不依赖 useSession 的 storage 监听是否触发。
      // 不阻塞「已登录」提示，资料拿到后界面会自己更新。
      void onSignedIn();
      onToast('已登录');
      setLoginError(null);
    } catch (error) {
      const info = describeError(error);
      setLoginError(info.detail || info.title);
    } finally {
      setLoginBusy(false);
    }
  };

  return (
    <div className="settings-panel">
      {/* ---------------- 账号 ---------------- */}
      <section className="settings-card settings-card--account" aria-labelledby="settings-account">
        <header className="settings-card__head">
          <span className="settings-card__icon" aria-hidden="true">
            <Icon name="user" size={17} />
          </span>
          <div className="settings-card__heading">
            <h2 className="settings-card__title" id="settings-account">
              账号
            </h2>
            <p className="settings-card__desc">
              查看当前登录账号。设置只保存在本机，不会上传。
            </p>
          </div>
        </header>

        <div className="settings-card__body">
          {signedIn ? (
            <div className="account-panel">
              <Avatar
                className="avatar--account"
                src={profile?.avatar_url}
                name={accountName}
              />

              <div className="account-panel__body">
                <div className="account-panel__name-row">
                  <span className="account-panel__name">{accountName}</span>
                  {profile?.is_pro && <span className="chip chip--gold">PRO</span>}
                  {typeof profile?.level === 'number' && (
                    <span className="chip">Lv.{profile.level}</span>
                  )}
                </div>
              </div>

              <div className="account-panel__actions">
                <button type="button" className="btn btn--ghost" onClick={onSignOut}>
                  <Icon name="logout" size={14} />
                  退出登录
                </button>
              </div>
            </div>
          ) : (
            <div className="account-panel account-panel--signed-out">
              <Avatar className="avatar--account" name={null} />

              <div className="account-panel__body">
                <div className="account-panel__name-row">
                  <span className="account-panel__name">尚未登录</span>
                </div>
                <p className="account-panel__hint">
                  设置会保存在本机，登录只用于读取个人资料与通知。
                </p>
              </div>

              <div className="account-panel__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleLogin}
                  disabled={loginBusy}
                >
                  {loginBusy ? '等待授权…' : '登录 2Libra'}
                </button>
              </div>
            </div>
          )}

          {loginError && (
            <div className="banner banner--error settings-banner" role="alert">
              <Icon name="alert" size={16} className="banner__icon" />
              <div className="banner__body">{loginError}</div>
            </div>
          )}
        </div>
      </section>

      {/* ---------------- 节点配置 ---------------- */}
      <NodeConfig
        settings={settings}
        nodes={nodes}
        nodesStatus={nodesStatus}
        nodesError={nodesError}
        onReloadNodes={onReloadNodes}
        onUpdateSettings={onUpdateSettings}
        onToast={onToast}
      />

      {/* ---------------- 外观 ---------------- */}
      <section
        className="settings-card settings-card--appearance"
        aria-labelledby="settings-appearance"
      >
        <header className="settings-card__head">
          <span className="settings-card__icon" aria-hidden="true">
            <Icon name="palette" size={17} />
          </span>
          <div className="settings-card__heading">
            <h2 className="settings-card__title" id="settings-appearance">
              外观
            </h2>
            <p className="settings-card__desc">选择界面主题；弹窗、仪表盘与设置页会一起变化。</p>
          </div>
        </header>

        <div className="settings-card__body">
          <div className="appearance-panel">
            <div className="appearance-panel__copy">
              <span className="appearance-panel__label" id="theme-label">
                主题模式
              </span>
              <p className="appearance-panel__hint">选定后立即生效，无需刷新页面。</p>
            </div>

            <div className="theme-segmented" role="radiogroup" aria-labelledby="theme-label">
              {THEME_OPTIONS.map((option) => {
                const active = settings.theme === option.value;
                return (
                  <label
                    key={option.value}
                    className={`theme-segmented__option${
                      active ? ' is-active' : ''
                    }`}
                    title={option.hint}
                  >
                    <input
                      className="sr-only"
                      type="radio"
                      name="theme-preference"
                      value={option.value}
                      checked={active}
                      onChange={() => void onUpdateSettings({ theme: option.value })}
                    />
                    <Icon name={option.icon} size={16} />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <p className="settings-inline-note">
            「跟随系统」会随操作系统的浅色 / 深色外观自动切换；主题偏好只保存在本地设备。
          </p>
        </div>
      </section>
    </div>
  );
}
