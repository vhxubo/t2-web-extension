import { browser } from '#imports';
import { useEffect, useRef, useState } from 'react';
import { startLogin } from '../lib/auth';
import { BOARDS, isBoardId } from '../lib/boards';
import { AUTHOR, LINKS, OAUTH_CONFIGURED } from '../lib/config';
import { describeError } from '../lib/errors';
import type { Settings, ThemePreference } from '../lib/storage';
import type { Profile } from '../lib/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

const THEME_OPTIONS: ReadonlyArray<{
  value: ThemePreference;
  emoji: string;
  label: string;
  hint: string;
}> = [
  { value: 'light', emoji: '☀️', label: '浅色', hint: '始终使用浅色界面' },
  { value: 'dark', emoji: '🌙', label: '深色', hint: '始终使用深色界面' },
  { value: 'system', emoji: '💻', label: '跟随系统', hint: '跟随操作系统的深浅色外观' },
];

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  signedIn: boolean;
  profile: Profile | null;
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void> | void;
  onSignedIn: () => void | Promise<void>;
  onSignOut: () => void;
  onToast: (message: string) => void;
}

export function SettingsDialog({
  open,
  onClose,
  settings,
  signedIn,
  profile,
  onUpdateSettings,
  onSignedIn,
  onSignOut,
  onToast,
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setLoginError(null);
  }, [open]);

  const manifest = browser.runtime.getManifest();

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

  const defaultBoard = isBoardId(settings.board) ? settings.board : 'home';

  return (
    <dialog
      ref={dialogRef}
      className="t2-dialog settings-dialog"
      aria-labelledby="settings-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <header className="dialog__head">
        <h2 className="dialog__title" id="settings-title">
          设置
        </h2>
        <button type="button" className="btn btn--icon" onClick={onClose} aria-label="关闭设置">
          <Icon name="close" size={16} />
        </button>
      </header>

      <div className="dialog__body">
        {/* ---------------- 账号 ---------------- */}
        <section className="settings-card" aria-labelledby="settings-account">
          <h3 className="settings-card__title" id="settings-account">
            账号
          </h3>

          {signedIn ? (
            <div className="settings-account">
              <Avatar
                className="avatar--lg"
                src={profile?.avatar_url}
                name={profile?.display_name || profile?.username}
              />
              <div className="settings-account__body">
                <div className="settings-account__name">
                  <span>{profile?.display_name || profile?.username || '已登录'}</span>
                  {profile?.is_pro && <span className="chip chip--gold">PRO</span>}
                  {typeof profile?.level === 'number' && (
                    <span className="chip">Lv.{profile.level}</span>
                  )}
                </div>
              </div>
              <div className="settings-account__actions">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={handleLogin}
                  disabled={loginBusy}
                >
                  重新授权
                </button>
                <button type="button" className="btn btn--sm btn--danger" onClick={onSignOut}>
                  退出登录
                </button>
              </div>
            </div>
          ) : (
            <div className="settings-login">
              <p className="settings-note">
                登录后可同步个性化字段、收藏状态及未读通知红点。
              </p>
              <button
                type="button"
                className="btn btn--primary"
                onClick={handleLogin}
                disabled={loginBusy}
              >
                {loginBusy ? '等待授权…' : '登录'}
              </button>
            </div>
          )}

          {loginError && (
            <div className="banner banner--error settings-banner" role="alert">
              <Icon name="alert" size={16} className="banner__icon" />
              <div className="banner__body">{loginError}</div>
            </div>
          )}
        </section>

        {/* ---------------- 默认进入 ---------------- */}
        <section className="settings-card" aria-labelledby="settings-defaults">
          <h3 className="settings-card__title" id="settings-defaults">
            默认进入
          </h3>

          <div className="settings-rows">
            <div className="settings-row">
              <label className="settings-row__label" htmlFor="default-board">
                弹窗默认榜单
              </label>
              <select
                id="default-board"
                className="select"
                value={defaultBoard}
                onChange={(event) => {
                  const value = event.target.value;
                  if (isBoardId(value)) void onUpdateSettings({ board: value });
                }}
              >
                {BOARDS.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.shortLabel ?? board.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="settings-note settings-defaults__hint">
            只决定之后打开弹窗时先显示哪个榜单；在弹窗里切换 Tab 只影响当次浏览，不会改动这里。
          </p>
        </section>

        {/* ---------------- 外观 ---------------- */}
        <section className="settings-card" aria-labelledby="settings-appearance">
          <h3 className="settings-card__title" id="settings-appearance">
            外观
          </h3>

          <div className="settings-row settings-row--theme">
            <div className="settings-row__intro">
              <span className="settings-row__label" id="theme-label">
                主题模式
              </span>
              <p className="settings-row__hint">夜间使用深色界面可减少眩光。</p>
            </div>

            <div className="theme-choice" role="radiogroup" aria-labelledby="theme-label">
              {THEME_OPTIONS.map((option) => {
                const active = settings.theme === option.value;
                return (
                  <label
                    key={option.value}
                    className={`theme-choice__option${
                      active ? ' theme-choice__option--active' : ''
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
                    <span className="theme-choice__emoji" aria-hidden="true">
                      {option.emoji}
                    </span>
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <p className="settings-note settings-defaults__hint">
            「跟随系统」会随操作系统的浅色 / 深色外观自动切换；选择只保存在本地设备。
          </p>
        </section>

        {/* ---------------- 关于 ---------------- */}
        <section className="settings-card" aria-labelledby="settings-about">
          <h3 className="settings-card__title" id="settings-about">
            关于
          </h3>

          <dl className="settings-meta">
            <div>
              <dt>版本</dt>
              <dd>
                {manifest.version} · Manifest V{manifest.manifest_version}
              </dd>
            </div>
            <div>
              <dt>数据来源</dt>
              <dd>开放 API v1</dd>
            </div>
            <div>
              <dt>作者</dt>
              <dd>
                {AUTHOR.name} ·{' '}
                <a className="settings-meta__mail" href={`mailto:${AUTHOR.email}`}>
                  {AUTHOR.email}
                </a>
              </dd>
            </div>
          </dl>

          <a className="settings-link" href={LINKS.docs} target="_blank" rel="noreferrer">
            接口文档
            <Icon name="external" size={12} />
          </a>
        </section>
      </div>

      <footer className="dialog__foot">
        <span className="settings-foot__note">设置仅保存在本地设备。</span>
        <button type="button" className="btn btn--primary" onClick={onClose}>
          完成
        </button>
      </footer>
    </dialog>
  );
}
