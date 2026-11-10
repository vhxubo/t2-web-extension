import { browser } from '#imports';
import { useEffect, useRef, useState } from 'react';
import { startLogin } from '../lib/auth';
import { BOARDS, isBoardId } from '../lib/boards';
import { LINKS, OAUTH_CONFIGURED } from '../lib/config';
import { describeError } from '../lib/errors';
import { PAGE_SIZES, type Settings } from '../lib/storage';
import type { Profile } from '../lib/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  signedIn: boolean;
  profile: Profile | null;
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void> | void;
  onSignedIn: () => void;
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
      onSignedIn();
      onToast('已登录');
      setLoginError(null);
    } catch (error) {
      const info = describeError(error);
      setLoginError(info.detail || info.title);
    } finally {
      setLoginBusy(false);
    }
  };

  const defaultBoard = isBoardId(settings.board) ? settings.board : 'latest';

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
                name={profile?.username}
              />
              <div className="settings-account__body">
                <div className="settings-account__name">
                  <span>{profile?.username ?? '已登录'}</span>
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

        {/* ---------------- 默认视图 ---------------- */}
        <section className="settings-card" aria-labelledby="settings-defaults">
          <h3 className="settings-card__title" id="settings-defaults">
            默认视图
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

            <div className="settings-row">
              <label className="settings-row__label" htmlFor="default-size">
                每页条数
              </label>
              <select
                id="default-size"
                className="select"
                value={String(settings.pageSize)}
                onChange={(event) => {
                  void onUpdateSettings({ pageSize: Number(event.target.value) });
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={String(size)}>
                    {size} 条
                  </option>
                ))}
              </select>
            </div>
          </div>
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
