import { useState } from 'react';
import { startLogin, startSignup } from '../lib/auth';
import {
  DISCLAIMER,
  LIABILITY_NOTE,
  OAUTH_CONFIGURED,
  PERMISSION_NOTE,
  REVOKE_HINT,
  SIGNUP_URL,
} from '../lib/config';
import { describeError } from '../lib/errors';
import {
  COMMENT_RUN_DEFAULT_LENGTH,
  COMMENT_RUN_MAX_LENGTH,
  COMMENT_RUN_MIN_LENGTH,
} from '../lib/comment-runs';
import { requestNotificationPermission } from '../lib/native-notifications';
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

/** 连续评论折叠阈值可选值：2–10 条。 */
const COLLAPSE_THRESHOLD_OPTIONS = Array.from(
  { length: COMMENT_RUN_MAX_LENGTH - COMMENT_RUN_MIN_LENGTH + 1 },
  (_, index) => COMMENT_RUN_MIN_LENGTH + index,
);

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
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void handleLogin()}
                  disabled={loginBusy}
                  title="重新走一次授权，补齐新增 scope（如收藏所需的 interact）"
                >
                  <Icon name="refresh" size={14} />
                  {loginBusy ? '等待授权…' : '重新授权'}
                </button>
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
                  设置会保存在本机，登录只用于读取个人资料与消息。
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
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => void startSignup()}
                  disabled={loginBusy}
                  title={`在新标签页打开注册页（${SIGNUP_URL}）`}
                >
                  <Icon name="external" size={14} />
                  注册账号
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

          {/* 2Libra《第三方应用接入说明》part 2 §3.1 + 附录：用户可见的开发者声明与权限说明。 */}
          <div className="settings-legal" role="note">
            <p>{DISCLAIMER}</p>
            <p>{LIABILITY_NOTE}</p>
            <p>{REVOKE_HINT}</p>
            <p>{PERMISSION_NOTE}</p>
          </div>
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

      {/* ---------------- 最新评论 ---------------- */}
      <section
        className="settings-card settings-card--comments"
        aria-labelledby="settings-comments"
      >
        <header className="settings-card__head">
          <span className="settings-card__icon" aria-hidden="true">
            <Icon name="hash" size={17} />
          </span>
          <div className="settings-card__heading">
            <h2 className="settings-card__title" id="settings-comments">
              最新评论
            </h2>
            <p className="settings-card__desc">调整「最新评论」时间线的展示方式。</p>
          </div>
        </header>

        <div className="settings-card__body">
          <div className="appearance-panel">
            <div className="appearance-panel__copy">
              <span className="appearance-panel__label" id="collapse-comments-label">
                折叠连续评论
              </span>
              <p className="appearance-panel__hint">
                同一用户连续发布达到设定条数时，只展示第一条，其余收在展开按钮后面。默认关闭。
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.collapseRepeatedComments}
              aria-labelledby="collapse-comments-label"
              className={`node-config__switch${
                settings.collapseRepeatedComments ? ' is-on' : ''
              }`}
              onClick={() =>
                void onUpdateSettings({
                  collapseRepeatedComments: !settings.collapseRepeatedComments,
                })
              }
            >
              <span>{settings.collapseRepeatedComments ? '已开启' : '已关闭'}</span>
              <span className="node-config__track" aria-hidden="true">
                <span className="node-config__thumb" />
              </span>
            </button>
          </div>

          <div className="appearance-panel">
            <div className="appearance-panel__copy">
              <label
                className="appearance-panel__label"
                htmlFor="collapse-comments-threshold"
              >
                折叠阈值
              </label>
              <p className="appearance-panel__hint">
                同一用户连续发布达到这个条数时折叠，只展示第一条。默认{' '}
                {COMMENT_RUN_DEFAULT_LENGTH} 条。
              </p>
            </div>

            <select
              id="collapse-comments-threshold"
              className="select select--sm settings-comments__select"
              value={settings.collapseRepeatedCommentsThreshold}
              onChange={(event) =>
                void onUpdateSettings({
                  collapseRepeatedCommentsThreshold: Number(event.target.value),
                })
              }
            >
              {COLLAPSE_THRESHOLD_OPTIONS.map((value) => (
                <option key={value} value={value}>
                  {value} 条
                </option>
              ))}
            </select>
          </div>

          <p className="settings-inline-note">
            在站点的「最新评论」页、弹窗与仪表盘的最新评论视图同时生效；展开 / 收起状态只在当前页面有效。
          </p>
        </div>
      </section>

      {/* ---------------- 站点菜单 ---------------- */}
      <section
        className="settings-card settings-card--menu"
        aria-labelledby="settings-site-menu"
      >
        <header className="settings-card__head">
          <span className="settings-card__icon" aria-hidden="true">
            <Icon name="folder" size={17} />
          </span>
          <div className="settings-card__heading">
            <h2 className="settings-card__title" id="settings-site-menu">
              站点菜单
            </h2>
            <p className="settings-card__desc">
              在站点的「自定义菜单」弹窗里按节点级联选择，一键填入菜单名称和链接。
            </p>
          </div>
        </header>

        <div className="settings-card__body">
          <div className="appearance-panel">
            <div className="appearance-panel__copy">
              <span className="appearance-panel__label" id="node-picker-label">
                节点选择器
              </span>
              <p className="appearance-panel__hint">
                按「分区 → 父节点 → 子节点」展开，也可直接搜索节点名称或 slug。默认开启。
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.customMenuNodePicker}
              aria-labelledby="node-picker-label"
              className={`node-config__switch${
                settings.customMenuNodePicker ? ' is-on' : ''
              }`}
              onClick={() =>
                void onUpdateSettings({
                  customMenuNodePicker: !settings.customMenuNodePicker,
                })
              }
            >
              <span>{settings.customMenuNodePicker ? '已开启' : '已关闭'}</span>
              <span className="node-config__track" aria-hidden="true">
                <span className="node-config__thumb" />
              </span>
            </button>
          </div>

          <p className="settings-inline-note">
            选择父节点填入 `/node/&lt;slug&gt;`，子节点填入 `/node/&lt;父&gt;/&lt;子&gt;`；只读取公开节点树，不写入站点数据。
          </p>
        </div>
      </section>

      {/* ---------------- 评论徽章助手 ---------------- */}
      <section
        className="settings-card settings-card--badges"
        aria-labelledby="settings-badges"
      >
        <header className="settings-card__head">
          <span className="settings-card__icon" aria-hidden="true">
            <Icon name="coin" size={17} />
          </span>
          <div className="settings-card__heading">
            <h2 className="settings-card__title" id="settings-badges">
              评论徽章助手
            </h2>
            <p className="settings-card__desc">
              在 2libra.com 帖子页的评论框上方显示字数、预计发评金币与更划算的徽章，可一键切换；佩戴徽章不消耗金币。
            </p>
          </div>
        </header>

        <div className="settings-card__body">
          <div className="appearance-panel">
            <div className="appearance-panel__copy">
              <span className="appearance-panel__label" id="badge-switcher-label">
                徽章助手
              </span>
              <p className="appearance-panel__hint">
                关闭后不再注入状态栏，也不会请求徽章与潘多拉接口。默认开启。
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.badgeSwitcher}
              aria-labelledby="badge-switcher-label"
              className={`node-config__switch${settings.badgeSwitcher ? ' is-on' : ''}`}
              onClick={() =>
                void onUpdateSettings({ badgeSwitcher: !settings.badgeSwitcher })
              }
            >
              <span>{settings.badgeSwitcher ? '已开启' : '已关闭'}</span>
              <span className="node-config__track" aria-hidden="true">
                <span className="node-config__thumb" />
              </span>
            </button>
          </div>

          <p className="settings-inline-note">
            助手使用扩展内登录的账号调用公开 API；未登录时不显示状态栏。只读取徽章、佩戴状态与今日潘多拉事件，不保存任何站点数据。
          </p>
        </div>
      </section>

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

      {/* ---------------- 通知 ---------------- */}
      <section
        className="settings-card settings-card--notifications"
        aria-labelledby="settings-notifications"
      >
        <header className="settings-card__head">
          <span className="settings-card__icon" aria-hidden="true">
            <Icon name="bell" size={17} />
          </span>
          <div className="settings-card__heading">
            <h2 className="settings-card__title" id="settings-notifications">
              通知
            </h2>
            <p className="settings-card__desc">
              收到新消息时，除工具栏角标外，再弹一条系统桌面通知。
            </p>
          </div>
        </header>

        <div className="settings-card__body">
          <div className="appearance-panel">
            <div className="appearance-panel__copy">
              <span className="appearance-panel__label" id="desktop-notif-label">
                桌面通知
              </span>
              <p className="appearance-panel__hint">
                关闭后只在扩展图标上显示未读角标，不再弹系统通知。
              </p>
            </div>

            <button
              type="button"
              role="switch"
              aria-checked={settings.desktopNotifications}
              aria-labelledby="desktop-notif-label"
              className={`node-config__switch${settings.desktopNotifications ? ' is-on' : ''}`}
              onClick={() => {
                const next = !settings.desktopNotifications;
                // 打开时顺手要一次浏览器通知授权：只有用户手势里 requestPermission()
                // 才会真的弹授权框，后台自己请求只会静默返回 default。
                if (next) void requestNotificationPermission();
                void onUpdateSettings({ desktopNotifications: next });
              }}
            >
              <span>{settings.desktopNotifications ? '已开启' : '已关闭'}</span>
              <span className="node-config__track" aria-hidden="true">
                <span className="node-config__thumb" />
              </span>
            </button>
          </div>

          <p className="settings-inline-note">
            点击系统通知会跳到对应内容：回复 / 提及直达评论，表态打开原文，没有链接则进入消息界面；
            通知正文取自最新的未读消息。
          </p>
        </div>
      </section>
    </div>
  );
}
