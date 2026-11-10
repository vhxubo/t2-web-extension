import { browser } from '#imports';
import { useEffect, useRef, useState } from 'react';
import { getMe } from '../lib/api';
import { getRedirectUri, logout, setManualToken, startLogin } from '../lib/auth';
import { BOARDS, BOARD_MAP, isBoardId } from '../lib/boards';
import { LINKS, REQUESTED_SCOPE } from '../lib/config';
import { describeError } from '../lib/errors';
import { dateTime } from '../lib/format';
import { groupNodes } from '../lib/nodes';
import { PAGE_SIZES, type Settings, type TokenSet } from '../lib/storage';
import type { ApiNode, Profile } from '../lib/types';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

interface SettingsDialogProps {
  open: boolean;
  onClose: () => void;
  settings: Settings;
  nodes: ApiNode[];
  signedIn: boolean;
  tokens: TokenSet | null;
  profile: Profile | null;
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void> | void;
  onSignedIn: () => void;
  onSignOut: () => void;
  onToast: (message: string) => void;
  onClearCache: () => Promise<void>;
}

export function SettingsDialog({
  open,
  onClose,
  settings,
  nodes,
  signedIn,
  tokens,
  profile,
  onUpdateSettings,
  onSignedIn,
  onSignOut,
  onToast,
  onClearCache,
}: SettingsDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const clientInputRef = useRef<HTMLInputElement | null>(null);
  const connectionRef = useRef<HTMLDivElement | null>(null);

  const [clientId, setClientId] = useState(settings.clientId);
  const [redirectUri, setRedirectUri] = useState('');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [manualToken, setManualTokenValue] = useState('');
  const [manualBusy, setManualBusy] = useState(false);
  const [manualOpen, setManualOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setClientId(settings.clientId);
    setRedirectUri(getRedirectUri());
    setLoginError(null);
    setCopied(null);
  }, [open, settings.clientId]);

  useEffect(() => {
    if (!saved) return;
    const timer = window.setTimeout(() => setSaved(false), 1600);
    return () => window.clearTimeout(timer);
  }, [saved]);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const manifest = browser.runtime.getManifest();

  const flashSaved = () => {
    setSaved(true);
  };

  const saveClientId = async () => {
    const next = clientId.trim();
    if (next === settings.clientId) return;
    await onUpdateSettings({ clientId: next });
    setClientId(next);
    flashSaved();
  };

  const focusConnection = () => {
    connectionRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    window.setTimeout(() => clientInputRef.current?.focus(), 220);
  };

  const handleLogin = async () => {
    setLoginError(null);
    const id = clientId.trim();

    if (!id) {
      setLoginError('先填写 client_id：在 2Libra 的设置 → OAuth 应用里创建一个公开客户端。');
      focusConnection();
      return;
    }
    if (id !== settings.clientId) {
      await onUpdateSettings({ clientId: id });
    }

    setLoginBusy(true);
    try {
      await startLogin(id);
      onSignedIn();
      onToast('已登录 2Libra');
      setLoginError(null);
    } catch (error) {
      const info = describeError(error);
      setLoginError(info.detail || info.title);
    } finally {
      setLoginBusy(false);
    }
  };

  const handleSignOut = () => {
    onSignOut();
  };

  const handleManualToken = async () => {
    setLoginError(null);
    setManualBusy(true);
    try {
      await setManualToken(manualToken);
      const me = await getMe();
      setManualTokenValue('');
      onSignedIn();
      onToast(`已以 @${me.username ?? '用户'} 的身份登录`);
    } catch (error) {
      await logout();
      const info = describeError(error);
      setLoginError(info.detail || info.title);
    } finally {
      setManualBusy(false);
    }
  };

  const copy = async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      onToast('复制失败，请手动选中文本复制');
    }
  };

  const handleClearCache = async () => {
    setClearing(true);
    try {
      await onClearCache();
      onToast('节点缓存已清除');
    } finally {
      setClearing(false);
    }
  };

  const boardMeta = BOARD_MAP[settings.board] ?? BOARD_MAP.latest;
  const groups = groupNodes(nodes);
  const sectionOptionsList: Array<{ value: string; label: string; group: string }> = [];
  for (const group of groups) {
    for (const node of group.nodes) {
      sectionOptionsList.push({ value: `p:${node.slug}`, label: node.name, group: group.label });
      for (const child of node.children ?? []) {
        sectionOptionsList.push({
          value: `n:${child.slug}`,
          label: `　${child.name}`,
          group: group.label,
        });
      }
    }
  }

  const currentSectionKnown =
    settings.section === 'all' ||
    sectionOptionsList.some((option) => option.value === settings.section);

  const expiry =
    tokens && tokens.source === 'oauth'
      ? `访问令牌有效至 ${dateTime(new Date(tokens.expiresAt).toISOString())}`
      : '手动填入的令牌';

  return (
    <dialog
      ref={dialogRef}
      className="t2-dialog"
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
        <div>
          <h2 className="dialog__title" id="settings-title">
            设置
          </h2>
          <p className="dialog__desc">默认视图、账号与授权配置都保存在这台设备上。</p>
        </div>
        <button type="button" className="btn btn--icon" onClick={onClose} aria-label="关闭设置">
          <Icon name="close" size={16} />
        </button>
      </header>

      <div className="dialog__body">
        {/* ---------------- 账号 ---------------- */}
        <section className="dialog__section" aria-labelledby="settings-account">
          <h3 className="dialog__section-title" id="settings-account">
            账号
          </h3>

          {signedIn ? (
            <div className="account-card">
              <Avatar
                className="avatar--lg"
                src={profile?.avatar_url}
                name={profile?.username}
              />
              <div className="account-card__body">
                <div className="account-card__name">
                  <span className="t2-serif">{profile?.username ?? '已登录'}</span>
                  {profile?.is_pro && <span className="chip chip--gold">PRO</span>}
                  {typeof profile?.level === 'number' && (
                    <span className="chip">Lv.{profile.level}</span>
                  )}
                </div>
                <p className="dialog__note">
                  {expiry}
                  {tokens?.scope ? ` · 已授权 ${tokens.scope}` : ''}
                </p>
              </div>
              <div className="account-card__actions">
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={handleLogin}
                  disabled={loginBusy}
                >
                  重新授权
                </button>
                <button type="button" className="btn btn--sm btn--danger" onClick={handleSignOut}>
                  退出登录
                </button>
              </div>
            </div>
          ) : (
            <div className="account-login">
              <p className="dialog__note">
                登录后可以带上个性化字段（收藏、投票状态等）。登录用的是 2Libra
                的公开客户端 + PKCE，扩展里不保存任何 client_secret。
              </p>
              <div className="account-login__actions">
                <button
                  type="button"
                  className="btn btn--primary"
                  onClick={handleLogin}
                  disabled={loginBusy}
                >
                  <Icon name="user" size={15} />
                  {loginBusy ? '等待授权…' : '登录 2Libra'}
                </button>
                <span className="dialog__note">会打开 2Libra 授权窗口，完成后回到这里。</span>
              </div>
            </div>
          )}

          {loginError && (
            <div className="banner banner--error dialog__banner" role="alert">
              <Icon name="alert" size={16} className="banner__icon" />
              <div className="banner__body">{loginError}</div>
            </div>
          )}
        </section>

        {/* ---------------- 默认视图 ---------------- */}
        <section className="dialog__section" aria-labelledby="settings-defaults">
          <h3 className="dialog__section-title" id="settings-defaults">
            默认视图
          </h3>
          <p className="dialog__note dialog__note--lead">
            弹窗和每次新开的标签页都会从这个组合开始。
          </p>

          <div className="form-grid">
            <div className="field">
              <label className="field__label" htmlFor="default-board">
                默认榜单
              </label>
              <select
                id="default-board"
                className="select"
                value={settings.board}
                onChange={(event) => {
                  const value = event.target.value;
                  if (isBoardId(value)) {
                    void onUpdateSettings({ board: value });
                    flashSaved();
                  }
                }}
              >
                {BOARDS.map((board) => (
                  <option key={board.id} value={board.id}>
                    {board.label}
                  </option>
                ))}
              </select>
              <span className="field__hint">
                {boardMeta.hint}
                {!boardMeta.supportsSection ? '；这个榜单只在全站可用' : '；支持按分区筛选'}
              </span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="default-section">
                默认分区
              </label>
              <select
                id="default-section"
                className="select"
                value={settings.section}
                onChange={(event) => {
                  void onUpdateSettings({ section: event.target.value });
                  flashSaved();
                }}
              >
                {!currentSectionKnown && (
                  <option value={settings.section}>{settings.section}</option>
                )}
                <option value="all">全站</option>
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
              </select>
              <span className="field__hint">全部分区都可以选，包括子分区。</span>
            </div>

            <div className="field">
              <label className="field__label" htmlFor="default-size">
                每页条数
              </label>
              <select
                id="default-size"
                className="select"
                value={String(settings.pageSize)}
                onChange={(event) => {
                  void onUpdateSettings({ pageSize: Number(event.target.value) });
                  flashSaved();
                }}
              >
                {PAGE_SIZES.map((size) => (
                  <option key={size} value={String(size)}>
                    {size} 条
                  </option>
                ))}
              </select>
              <span className="field__hint">评分榜单页上限是 30 条。</span>
            </div>
          </div>
        </section>

        {/* ---------------- 授权应用 ---------------- */}
        <section className="dialog__section" aria-labelledby="settings-oauth" ref={connectionRef}>
          <h3 className="dialog__section-title" id="settings-oauth">
            授权应用
          </h3>

          <div className="field">
            <label className="field__label" htmlFor="client-id">
              client_id
            </label>
            <input
              id="client-id"
              ref={clientInputRef}
              className="input input--mono"
              value={clientId}
              spellCheck={false}
              autoComplete="off"
              placeholder="在 2Libra → 设置 → OAuth 应用里创建后获得"
              onChange={(event) => setClientId(event.target.value)}
              onBlur={() => void saveClientId()}
            />
          </div>

          <div className="field dialog__field">
            <span className="field__label">回调地址（redirect_uri）</span>
            <div className="copy-row">
              <code className="copy-row__value">{redirectUri || '当前环境不支持 identity 回调'}</code>
              <button
                type="button"
                className="btn btn--sm"
                onClick={() => void copy(redirectUri, 'redirect')}
                disabled={!redirectUri}
              >
                <Icon name={copied === 'redirect' ? 'check' : 'copy'} size={14} />
                {copied === 'redirect' ? '已复制' : '复制'}
              </button>
            </div>
            <span className="field__hint">
              必须与 2Libra 应用里登记的值完全一致。权限选 <code>{REQUESTED_SCOPE}</code>。
            </span>
          </div>

          <ol className="steps">
            <li>打开 2Libra，进入「设置 → OAuth 应用」，新建一个应用。</li>
            <li>形态选「无服务端（公开客户端）」，这样就不用 client_secret。</li>
            <li>把上面的回调地址原样填进去，权限勾选 read 与 profile。</li>
            <li>审核通过后，把 client_id 填到上面，再回到「账号」点登录。</li>
          </ol>

          <div className="link-row">
            <a className="link" href={LINKS.settings} target="_blank" rel="noreferrer">
              打开 2Libra（设置 → OAuth 应用） <Icon name="external" size={13} />
            </a>
            <a className="link" href={LINKS.oauth} target="_blank" rel="noreferrer">
              OAuth 接入文档 <Icon name="external" size={13} />
            </a>
          </div>

          <div className="manual">
            <button
              type="button"
              className="manual__toggle"
              aria-expanded={manualOpen}
              onClick={() => setManualOpen((current) => !current)}
            >
              <Icon
                name="chevron"
                size={13}
                className={`rail__chevron${manualOpen ? ' rail__chevron--open' : ''}`}
              />
              高级：手动填入 access token
            </button>
            {manualOpen && (
              <div className="manual__body">
                <p className="dialog__note">
                  调试用。令牌会保存在扩展的本地存储里，退出登录即可清除。生产环境请走上面的授权流程。
                </p>
                <div className="copy-row">
                  <input
                    className="input input--mono"
                    type="password"
                    value={manualToken}
                    placeholder="粘贴 access token"
                    autoComplete="off"
                    onChange={(event) => setManualTokenValue(event.target.value)}
                  />
                  <button
                    type="button"
                    className="btn btn--sm"
                    onClick={() => void handleManualToken()}
                    disabled={manualBusy || manualToken.trim().length === 0}
                  >
                    {manualBusy ? '验证中…' : '使用'}
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* ---------------- 关于 ---------------- */}
        <section className="dialog__section" aria-labelledby="settings-about">
          <h3 className="dialog__section-title" id="settings-about">
            关于
          </h3>
          <dl className="meta-list">
            <div>
              <dt>版本</dt>
              <dd className="t2-mono">
                {manifest.name} {manifest.version} · Manifest V{manifest.manifest_version}
              </dd>
            </div>
            <div>
              <dt>数据来源</dt>
              <dd>
                2Libra 开放 API v1 ·{' '}
                <a className="link" href={LINKS.docs} target="_blank" rel="noreferrer">
                  接口文档 <Icon name="external" size={12} />
                </a>
              </dd>
            </div>
            <div>
              <dt>节点缓存</dt>
              <dd>
                10 分钟
                <button
                  type="button"
                  className="btn btn--sm"
                  onClick={() => void handleClearCache()}
                  disabled={clearing}
                >
                  {clearing ? '清除中…' : '立即清除'}
                </button>
              </dd>
            </div>
          </dl>
          <p className="dialog__note dialog__note--lead">
            本扩展只做读取：帖子、节点、榜单。2Libra 的跨域策略不允许浏览器应用直接写数据，发帖 / 评论
            需要经过自己的服务端，因此这里不提供写操作。
          </p>
          <p className="dialog__note">
            2Libra 的跨域策略只放行它自己站点的来源，所以扩展用一条 declarativeNetRequest 规则，
            在「扩展自己发往 2libra.com/api 的请求」上移除浏览器自动附加的 Origin 头；规则按扩展 ID
            限定发起方，不会影响 2Libra 页面或其它网站的请求。
          </p>
        </section>
      </div>

      <footer className="dialog__foot">
        <span className="dialog__note dialog__saved">
          {saved ? '已保存' : '设置只保存在这台设备上。'}
        </span>
        <button type="button" className="btn btn--primary" onClick={onClose}>
          完成
        </button>
      </footer>
    </dialog>
  );
}
