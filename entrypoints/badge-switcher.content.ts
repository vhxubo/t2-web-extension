/**
 * 2libra 评论徽章助手（content script）。
 *
 * 合并自油猴脚本 `2libra-badge-switcher.user.js` v1.6.7：
 * 在 2libra.com 帖子页 / 帖子弹窗的评论框上方插入一条状态栏，
 * 实时显示字数、预计发评金币，并在有更划算的徽章时提供一键切换。
 *
 * 与油猴版的差异：
 * - 开关改由扩展设置 `badgeSwitcher` 控制（默认开启），设置页即时生效；
 * - 去掉 GM_* API 与油猴菜单，状态同步走 `settingsItem.watch`；
 * - 接口改用扩展内 OAuth 令牌调用 `/api/v1` 公开端点（徽章 / 佩戴 / 盲盒），
 *   不再读取站点 Cookie；未登录扩展时不显示状态栏。
 */
import { defineContentScript } from '#imports';
import { ApiError, apiDelete, apiGet, apiPost } from '@/lib/api';
import {
  activityGain,
  activityLabel,
  activityName,
  badgeIdOf,
  badgeName,
  barModel,
  classifyBadges,
  findActivityBadge,
  fmtTime,
  isPostDetail,
  normalizeEquipped,
  pandoraEffect,
  type BadgePair,
  type BarAction,
  type PandoraBox,
  type UserBadge,
} from '@/lib/badge-switcher/logic';
import { normalizeSettings, readSettings, settingsItem, tokensItem } from '@/lib/storage';

const BAR_FLAG = 'data-badge-switcher';

const EDITOR_SELECTOR = '.w-md-editor';
const INPUT_SELECTOR = '.w-md-editor-text-input, .w-md-editor-text textarea, textarea';
/** 原生 `<dialog>`（daisyUI 的 modal 也基于它），以及老式的 `.modal.modal-open` 容器。 */
const DIALOG_SELECTOR = 'dialog[open], .modal.modal-open, [role="dialog"]';
/** 不看开合状态的容器选择器：关掉的弹窗里编辑器仍然在 DOM 里。 */
const DIALOG_ANY_SELECTOR = 'dialog, .modal, [role="dialog"]';

/**
 * 弹窗里同样带 markdown 编辑器的还有「编辑帖子」「追加附言」「搜索」等，
 * 用 id / class 排除掉，免得在这些非评论场景里也插一条费用估算。
 */
const NON_COMMENT_DIALOG_RE =
  /(edit-post|postscript|compose|draft|search|login|register|settings|node-select|rule|redeem|vote|bet|collection|pin-manage|anonymous|pandora|sign|avatar|profile|violation)/i;

/** 每种宽度下保持定高，输入和推荐变化不会推动编辑器。 */
const BAR_HEIGHT = 28;
const BAR_BTN_HEIGHT = 22;

/* ------------------------------------------------------------------
   状态
------------------------------------------------------------------ */

let enabled = true;
/** 初始设置读取完成后，才接受 storage.watch 的切换事件。 */
let started = false;
/** 是否已在扩展内登录：徽章 / 佩戴 / 潘多拉都是「我的」接口，未登录时整条状态栏不出现。 */
let signedIn = false;
/** 当前令牌是否带 `read:economy`：没有就跳过盲盒接口，避免必然的 403。 */
let canReadEconomy = false;
/** 徽章列表 / 佩戴状态是否至少成功拉取过一次：没有数据时不插状态栏，避免显示错误的「未佩戴」估算。 */
let badgesReady = false;
let equippedReady = false;
let pair: BadgePair = { fixed: [], percent: [] };
/** 「走个面」活跃度徽章（仅在状态栏最左提供快捷开关）。 */
let activityBadge: UserBadge | null = null;
/** 当前已佩戴徽章的 badge_id 集合。 */
let equipped = new Set<string>();
/** 今日潘多拉盒子。 */
let pandoraBox: PandoraBox | null = null;
let activityPending = '';
let busy = false;

let syncTimer: ReturnType<typeof setTimeout> | null = null;

/* ------------------------------------------------------------------
   DOM 类型
------------------------------------------------------------------ */

interface BarElement extends HTMLDivElement {
  __editor?: Element;
  __countEl: HTMLSpanElement;
  __statusEl: HTMLSpanElement;
  __hintEl: HTMLSpanElement;
  __actionBtn: ActionButton;
  __actionBtn2: ActionButton;
  __activityBtn: HTMLButtonElement;
  __activityLabel: HTMLSpanElement;
}

interface ActionButton extends HTMLButtonElement {
  __action?: BarAction | null;
}

type StyleProp = 'color' | 'display' | 'fontWeight' | 'opacity';

/* ------------------------------------------------------------------
   工具
------------------------------------------------------------------ */

function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

function isElement(node: EventTarget | Node | null): node is Element {
  return node instanceof Element;
}

/** 幂等键：`[A-Za-z0-9_-]`、≤255 字符；徽章佩戴 / 取消佩戴是 🔑 端点，必须带。 */
function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
  }
}

/** 从令牌里读出登录状态与 `read:economy`（scope 是空格分隔字符串，可能为 null）。 */
function tokenState(tokens: { accessToken?: string; scope?: string | null } | null): {
  signedIn: boolean;
  canReadEconomy: boolean;
} {
  return {
    signedIn: Boolean(tokens?.accessToken),
    canReadEconomy: (tokens?.scope ?? '').split(/\s+/).includes('read:economy'),
  };
}

/* ------------------------------------------------------------------
   API
------------------------------------------------------------------ */

/** 各接口独立缓存、合并并发请求；失败保留旧数据并退避至最多 10 分钟。 */
function cachedRefresh(
  interval: number,
  load: () => Promise<void>,
): (force?: boolean) => Promise<void> {
  let pending: Promise<void> | null = null;
  let nextAt = 0;
  let failures = 0;

  return function refresh(force = false): Promise<void> {
    if (pending) return pending;
    if (!signedIn) return Promise.resolve();
    if (!force && Date.now() < nextAt) return Promise.resolve();

    pending = Promise.resolve()
      .then(load)
      .then(() => {
        failures = 0;
        nextAt = Date.now() + interval;
      })
      .catch((error: unknown) => {
        failures++;
        // 401 / 403 是令牌或 scope 问题，短时间重试没有意义，直接等到 10 分钟后再试。
        const authIssue =
          error instanceof ApiError && (error.status === 401 || error.status === 403);
        const backoff = authIssue ? 600000 : 60000 * 2 ** Math.min(failures, 4);
        nextAt = Date.now() + Math.min(600000, backoff);
      })
      .finally(() => {
        pending = null;
        requestRender();
      });
    return pending;
  };
}

/** 我拥有的徽章：`/v1/me/badges`（数组，元素是 user_badge 包 badge）。 */
const refreshBadges = cachedRefresh(600000, async () => {
  const my = await apiGet<UserBadge[]>('/v1/me/badges');
  pair = classifyBadges(my);
  activityBadge = findActivityBadge(my);
  badgesReady = true;
});

/** 我当前佩戴的徽章：`/v1/me/badges/equipped`。 */
const refreshEquipped = cachedRefresh(60000, async () => {
  const eq = await apiGet<UserBadge[]>('/v1/me/badges/equipped');
  equipped = new Set(normalizeEquipped(eq));
  equippedReady = true;
});

/** 今日盲盒：`/v1/pandora/today`，需要 `read:economy` 且应用已开通该能力。 */
const refreshPandora = cachedRefresh(300000, async () => {
  if (!canReadEconomy) {
    pandoraBox = null;
    return;
  }
  const d = await apiGet<{ has_box?: boolean; box?: PandoraBox | null }>('/v1/pandora/today');
  pandoraBox = d?.has_box === false ? null : (d?.box ?? null);
});

function initData(force = false): Promise<unknown> {
  if (!signedIn) return Promise.resolve();
  return Promise.all([refreshBadges(force), refreshEquipped(force), refreshPandora(force)]);
}

/* ------------------------------------------------------------------
   同步循环
------------------------------------------------------------------ */

function hasOpenCommentEditor(): boolean {
  return Array.from(document.querySelectorAll<HTMLElement>(EDITOR_SELECTOR)).some(
    (editor) =>
      inCommentContext(editor) && (!dialogOf(editor) || !!openDialogOf(editor)),
  );
}

function stopSync(): void {
  if (syncTimer !== null) clearTimeout(syncTimer);
  syncTimer = null;
}

function syncCommentState(): void {
  stopSync();
  if (!enabled || !signedIn || !started || document.hidden || !hasOpenCommentEditor()) return;
  // 避免旧的 GET 响应覆盖正在进行的佩戴操作。
  if (!busy) void initData();
  syncTimer = setTimeout(syncCommentState, 60000);
}

/* ------------------------------------------------------------------
   佩戴 / 切换
------------------------------------------------------------------ */

/**
 * 佩戴单枚徽章。
 *
 * v1 的 `POST /v1/me/badges/:badgeId/equip` 明确「不消耗金币」，
 * 所以不再查询 check-cost，也不弹扣费确认；只需带幂等键。
 * 返回 true 表示已佩戴。
 */
async function equipBadge(target: UserBadge): Promise<boolean> {
  const id = badgeIdOf(target);
  if (!id) return false;

  // 潘多拉「回归起点」期间徽章被锁定；数据有缓存，不为了切换强行重拉。
  const pe = pandoraEffect(pandoraBox);
  if (pe.active && pe.lockBadge) {
    throw new Error(`潘多拉「${pe.name}」生效中，无法佩戴徽章`);
  }

  await refreshEquipped(true);
  if (equipped.size === 1 && equipped.has(id)) return true;

  await apiPost(`/v1/me/badges/${encodeURIComponent(id)}/equip`, {
    headers: { 'Idempotency-Key': newIdempotencyKey() },
  });
  // 站点是否允许并戴多枚以服务端为准，刷新一次拿权威结果。
  await refreshEquipped(true);
  return true;
}

/** 切换费用徽章：统一通过单徽章佩戴入口替换当前徽章。 */
async function switchTo(target: UserBadge): Promise<void> {
  if (busy || !target) return;
  // 防御：回归起点生效期间佩戴请求必然失败，直接拦截。
  const pe = pandoraEffect(pandoraBox);
  if (pe.active && pe.lockBadge) {
    toast(`潘多拉「${pe.name}」生效中：下次开盒前无法佩戴徽章`, true);
    return;
  }
  busy = true;
  requestRender();
  try {
    if (!(await equipBadge(target))) return;
    toast(`已切换为「${badgeName(target)}」`);
  } catch (e) {
    toast(`切换失败：${errText(e)}`, true);
  } finally {
    busy = false;
    void refreshEquipped(true);
  }
}

/**
 * 「走个面」快捷开关：只看徽章是否佩戴，与评论字数 / 费用推荐完全无关。
 * 佩戴时同样会替换当前徽章，最多只能佩戴一枚。
 */
async function toggleActivityBadge(): Promise<void> {
  if (busy || !activityBadge) return;
  const pe = pandoraEffect(pandoraBox);
  if (pe.active && pe.lockBadge) {
    toast(`潘多拉「${pe.name}」生效中：下次开盒前无法佩戴徽章`, true);
    return;
  }
  const badge = activityBadge;
  const id = badgeIdOf(badge);
  const name = activityName(badge);
  const removing = equipped.has(id);
  activityPending = removing ? '摘下中…' : '佩戴中…';
  busy = true;
  requestRender();
  try {
    await refreshEquipped();
    if (removing) {
      await apiDelete(`/v1/me/badges/${encodeURIComponent(id)}/equip`, {
        headers: { 'Idempotency-Key': newIdempotencyKey() },
      });
      await refreshEquipped(true);
      toast(`已摘下「${name}」`);
    } else {
      if (!(await equipBadge(badge))) return;
      const gain = activityGain(badge);
      toast(`已佩戴「${name}」${gain == null ? '，活跃度加成已生效' : `，活跃度 +${gain}%`}`);
    }
  } catch (e) {
    toast(`${removing ? '摘下' : '佩戴'}「${name}」失败：${errText(e)}`, true);
  } finally {
    activityPending = '';
    busy = false;
    requestRender();
    void refreshEquipped(true);
  }
}

/* ------------------------------------------------------------------
   注入环境（整页 / 弹窗）
------------------------------------------------------------------ */

function openDialogOf(el: Element): Element | null {
  return el.closest(DIALOG_SELECTOR);
}

/** 编辑器所在的弹窗，不要求当前是打开状态。 */
function dialogOf(el: Element): Element | null {
  return el.closest(DIALOG_ANY_SELECTOR);
}

function dialogAllowsBar(id: string | null, cls: string | null): boolean {
  return !NON_COMMENT_DIALOG_RE.test(`${id || ''} ${cls || ''}`);
}

/**
 * 编辑器是否处在「帖子评论」语境：详情页整页，或列表页上弹出的帖子弹窗。
 * 弹窗已关闭也仍算「评论语境」——这样关掉再打开时状态栏还在原地。
 */
function inCommentContext(editor: Element): boolean {
  const dlg = dialogOf(editor);
  if (dlg) return dialogAllowsBar(dlg.id, dlg.className);
  return isPostDetail(window.location.pathname);
}

function editorText(editor: Element): string {
  const ta = editor.querySelector<HTMLTextAreaElement>(INPUT_SELECTOR);
  return ta?.value || '';
}

/* ------------------------------------------------------------------
   状态栏样式
------------------------------------------------------------------ */

function ensureBarStyles(): void {
  if (document.querySelector('#two-libra-badge-styles')) return;
  const style = document.createElement('style');
  style.id = 'two-libra-badge-styles';
  style.textContent = `
    [data-badge-switcher] {
      --badge-accent:var(--color-primary,#087f8c);
      --badge-soft:var(--color-base-100,#e8f5f5);
      --badge-border:var(--color-base-300,#d7e5e7);
      --badge-surface:var(--color-base-200,#f6fafb);
      --badge-ink:var(--color-base-content,#344d59);
      --badge-danger:color-mix(in oklab,var(--color-error,#dc2626) 65%,var(--badge-ink));
      --badge-success:color-mix(in oklab,var(--color-success,#15803d) 65%,var(--badge-ink));
      --badge-warning:color-mix(in oklab,var(--color-warning,#b45309) 65%,var(--badge-ink));
      --badge-activity-accent:var(--color-secondary,var(--badge-accent));
      --badge-action-ink:color-mix(in oklab,var(--badge-accent) 40%,var(--badge-ink));
      container-type:inline-size;
      color:var(--badge-ink);
      font-family:system-ui,-apple-system,"PingFang SC","Microsoft YaHei",sans-serif;
    }
    [data-badge-switcher] button {
      color:var(--badge-ink); background:var(--badge-soft);
      border-color:var(--badge-border);
    }
    [data-badge-switcher] button:hover:not(:disabled) {
      background:var(--badge-border);
    }
    [data-badge-switcher] button:focus-visible {
      outline:2px solid var(--badge-accent); outline-offset:2px;
    }
    [data-badge-switcher] button:disabled { cursor:wait; opacity:.55; }
    [data-badge-switcher] .badge-count {
      color:var(--badge-ink); font-weight:600; font-size:11px;
      width:auto; min-width:8ch; text-align:right;
      font-family:ui-monospace,"SFMono-Regular",Consolas,monospace;
    }
    [data-badge-switcher] .badge-status { flex:1 1 auto; }
    [data-badge-switcher] .badge-hint { max-width:26%; }
    [data-badge-switcher] .badge-activity {
      width:auto;
      color:color-mix(in oklab,var(--badge-activity-accent) 40%,var(--badge-ink));
      background:var(--badge-soft);
      border-color:color-mix(in oklab,var(--badge-activity-accent) 30%,var(--badge-border));
      border-style:dashed;
    }
    [data-badge-switcher] .badge-activity[aria-pressed="true"] {
      background:color-mix(in oklab,var(--badge-activity-accent) 10%,var(--badge-soft));
      border-style:solid;
    }
    [data-badge-switcher] .badge-activity:hover:not(:disabled) {
      background:color-mix(in oklab,var(--badge-activity-accent) 16%,var(--badge-soft));
    }
    [data-badge-switcher] .badge-hint:empty { display:none; }
    [data-badge-switcher] .badge-action {
      width:auto; max-width:30%;
      background:color-mix(in oklab,var(--badge-accent) 8%,var(--badge-soft));
      color:var(--badge-action-ink);
      border-color:color-mix(in oklab,var(--badge-accent) 20%,var(--badge-border));
    }
    [data-badge-switcher] .badge-action:hover:not(:disabled) {
      background:color-mix(in oklab,var(--badge-accent) 14%,var(--badge-soft));
    }
    [data-badge-switcher] .badge-action-pair {
      width:auto; max-width:22%;
    }
    @container (max-width:620px) {
      [data-badge-switcher] .badge-hint { display:none; }
      [data-badge-switcher] button { max-width:35%; }
      [data-badge-switcher] .badge-action-pair { max-width:26%; }
      /* 两枚并重按钮并排时窄屏让位：先收起「走个面」入口 */
      [data-badge-switcher].has-action-pair .badge-activity { display:none; }
    }
  `;
  (document.head || document.body).appendChild(style);
}

function barCss(): string {
  return [
    'display:flex',
    'flex-wrap:nowrap',
    'align-items:center',
    'justify-content:flex-end',
    'gap:0 6px',
    'box-sizing:border-box',
    `height:${BAR_HEIGHT}px`,
    `min-height:${BAR_HEIGHT}px`,
    `max-height:${BAR_HEIGHT}px`,
    'overflow:hidden',
    'font-size:11px',
    'line-height:18px',
    'white-space:nowrap',
    'margin:0 0 4px',
    'padding:2px 0',
    'user-select:none',
  ].join(';');
}

/** 按钮使用稳定宽度，长文案省略，避免推荐变化时挤动其他信息。 */
function barBtnCss(extra?: string): string {
  return [
    'flex:0 0 auto',
    'box-sizing:border-box',
    `height:${BAR_BTN_HEIGHT}px`,
    'padding:0 6px',
    'border:1px solid',
    'border-radius:4px',
    'font-family:inherit',
    'font-size:11px',
    'font-weight:600',
    'line-height:20px',
    'white-space:nowrap',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'cursor:pointer',
    extra || '',
  ].join(';');
}

/** 可变长文案：min-width:0 + 省略号，宽度不够时优先压缩它们而不是换行。 */
function barTextCss(kind: 'count' | 'text'): string {
  return kind === 'count'
    ? 'flex:0 0 auto;font-variant-numeric:tabular-nums;'
    : 'flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;';
}

function makeBar(): BarElement {
  ensureBarStyles();
  const bar = document.createElement('div') as BarElement;
  bar.setAttribute(BAR_FLAG, '');
  bar.style.cssText = barCss();

  // 最左侧的「走个面」快捷开关：右侧自动间距让其他内容保持右对齐，
  // 未持有该徽章时整颗按钮隐藏（不占位、不影响原有布局）。
  const activityBtn = document.createElement('button');
  activityBtn.type = 'button';
  activityBtn.className = 'badge-activity';
  activityBtn.style.cssText = barBtnCss('margin-right:auto;display:none;max-width:30%');
  const activityLabelEl = document.createElement('span');
  activityLabelEl.className = 'badge-activity-label';
  activityBtn.appendChild(activityLabelEl);
  activityBtn.addEventListener('click', () => void toggleActivityBadge());
  bar.__activityBtn = activityBtn;
  bar.__activityLabel = activityLabelEl;
  bar.appendChild(activityBtn);

  const countEl = document.createElement('span');
  const statusEl = document.createElement('span');
  const hintEl = document.createElement('span');
  countEl.className = 'badge-count';
  statusEl.className = 'badge-status';
  hintEl.className = 'badge-hint';
  countEl.style.cssText = barTextCss('count');
  statusEl.style.cssText = barTextCss('text');
  hintEl.style.cssText = barTextCss('text');
  bar.__countEl = countEl;
  bar.__statusEl = statusEl;
  bar.__hintEl = hintEl;
  bar.appendChild(countEl);
  bar.appendChild(statusEl);
  bar.appendChild(hintEl);

  // 动作按钮最多两颗：并重徽章同为最优时「二选一」。
  const makeActionBtn = (): ActionButton => {
    const btn = document.createElement('button') as ActionButton;
    btn.type = 'button';
    btn.className = 'badge-action';
    btn.style.cssText = barBtnCss('display:none');
    btn.addEventListener('click', () => {
      const act = btn.__action;
      if (act?.type === 'switch') void switchTo(act.badge);
    });
    return btn;
  };
  const btn = makeActionBtn();
  const btn2 = makeActionBtn();
  bar.__actionBtn = btn;
  bar.__actionBtn2 = btn2;
  bar.appendChild(btn);
  bar.appendChild(btn2);
  return bar;
}

/**
 * 状态栏与编辑器一一对应，归属记在 `bar.__editor` 上。
 * 站点重渲染时可能在两者之间插入别的节点（上传遮罩、emoji 面板…），
 * 这时不搬动状态栏，只要它仍归这个编辑器用，就留在原地继续更新。
 */
function barFor(editor: Element): BarElement | null {
  const reusable = (el: Element | null): el is BarElement => {
    if (!el || !el.hasAttribute(BAR_FLAG)) return false;
    const bar = el as BarElement;
    return !bar.__editor || !bar.__editor.isConnected || bar.__editor === editor;
  };

  const previous = editor.previousElementSibling;
  if (reusable(previous)) {
    previous.__editor = editor;
    return previous;
  }
  const parent = editor.parentNode;
  if (!parent) return null; // 编辑器暂未挂载，等下一次渲染
  for (const child of Array.from(parent.children)) {
    if (reusable(child)) {
      child.__editor = editor;
      return child;
    }
  }
  const bar = makeBar();
  bar.__editor = editor;
  parent.insertBefore(bar, editor);
  return bar;
}

function setText(el: HTMLElement, text: string): void {
  if (el.textContent !== text) el.textContent = text;
}

/** 只在值真正变化时写样式，避免无谓的样式重算。 */
function setStyle(el: HTMLElement, prop: StyleProp, value: string): void {
  if (el.style[prop] !== value) el.style[prop] = value;
}

/** 只在文案 / 显隐真正变化时写 DOM，避免状态栏自身改动触发观察器循环。 */
function updateBar(editor: Element, bar: BarElement | null): void {
  if (!bar) return;
  const pe = pandoraEffect(pandoraBox);
  const model = barModel(editorText(editor).length, pair, equipped, pe);
  const countEl = bar.__countEl;
  const statusEl = bar.__statusEl;
  const hintEl = bar.__hintEl;
  const btnEl = bar.__actionBtn;
  const btnEl2 = bar.__actionBtn2;

  setText(countEl, model.count);
  setStyle(countEl, 'color', model.warn ? 'var(--badge-danger)' : '');
  setStyle(countEl, 'fontWeight', model.warn ? '600' : '');
  setText(statusEl, model.status);
  statusEl.title = [model.status, model.hint].filter(Boolean).join(' · ');
  // 单行省略后长文案可能被截断，把完整内容放进 title。
  const hintText = model.hint;
  setText(hintEl, hintText);
  hintEl.title = hintText;
  setStyle(
    hintEl,
    'color',
    model.warn
      ? 'var(--badge-danger)'
      : model.hint.startsWith('✓')
        ? 'var(--badge-success)'
        : model.hint
          ? 'var(--badge-warning)'
          : '',
  );
  setStyle(hintEl, 'fontWeight', model.warn ? '600' : '');

  // 「走个面」入口：与字数、费用模型无关，只看是否持有 / 佩戴。
  const activityBtn = bar.__activityBtn;
  if (activityBadge) {
    const worn = equipped.has(badgeIdOf(activityBadge));
    const gain = activityGain(activityBadge);
    const locked = Boolean(pe.active && pe.lockBadge);
    const until = pe.expireAt ? fmtTime(pe.expireAt) : '';
    const lockLabel = `潘多拉锁定中${until ? ` · 至 ${until}` : ''}`;
    const label =
      activityPending || (locked ? lockLabel : activityLabel(activityBadge, worn));
    setText(bar.__activityLabel, label);
    activityBtn.setAttribute('aria-busy', String(Boolean(activityPending)));
    activityBtn.setAttribute('aria-disabled', String(locked || busy));
    setStyle(activityBtn, 'display', '');
    activityBtn.setAttribute('aria-pressed', String(worn));
    setStyle(activityBtn, 'fontWeight', worn ? '600' : '');
    setStyle(activityBtn, 'opacity', locked ? '.5' : '');
    activityBtn.disabled = locked || busy;
    activityBtn.title = locked
      ? `潘多拉「${pe.name}」锁定中${until ? `，至 ${until}` : '，下次开盒前无法佩戴徽章'}`
      : `${worn ? '摘下' : '佩戴'}「${activityName(activityBadge)}」${gain == null ? '' : `，活跃度 +${gain}%`}（点击${worn ? '摘下' : '佩戴'}）`;
    activityBtn.setAttribute('aria-label', `${label}，${activityBtn.title}`);
  } else {
    setStyle(activityBtn, 'display', 'none');
  }

  const showPending = busy && !activityPending;
  const actions = showPending ? [] : model.actions;
  for (const [i, el] of [btnEl, btnEl2].entries()) {
    const act = actions[i];
    if (showPending && i === 0) {
      setText(el, '处理中…');
      setStyle(el, 'display', '');
      el.disabled = true;
      el.__action = null;
    } else if (act) {
      setText(el, act.label);
      el.title = act.title || act.label;
      setStyle(el, 'display', '');
      el.disabled = busy;
      el.__action = act;
    } else {
      setStyle(el, 'display', 'none');
      el.__action = null;
    }
  }
  // 两个同价最优动作并排时收窄按钮，避免把状态文字挤没。
  const isPair = !showPending && actions.length > 1;
  for (const el of [btnEl, btnEl2]) el.classList.toggle('badge-action-pair', isPair);
  bar.classList.toggle('has-action-pair', isPair);
}

function removeBars(): void {
  for (const el of Array.from(document.querySelectorAll(`[${BAR_FLAG}]`))) el.remove();
}

/* ------------------------------------------------------------------
   渲染
------------------------------------------------------------------ */

function render(): void {
  if (!started) return;
  syncCommentState();
  if (!enabled || !signedIn || !badgesReady || !equippedReady) {
    removeBars();
    return;
  }
  const bars = Array.from(document.querySelectorAll<BarElement>(`[${BAR_FLAG}]`));
  for (const editor of Array.from(document.querySelectorAll<HTMLElement>(EDITOR_SELECTOR))) {
    if (!inCommentContext(editor)) continue;
    updateBar(editor, barFor(editor));
  }
  // 编辑器被站点移除、或已不在评论语境时清理孤儿状态栏。
  // 弹窗只是关闭、编辑器还在 DOM 里时保留状态栏：再次打开无需重新插入。
  for (const bar of bars) {
    const editor = bar.__editor;
    if (
      !editor ||
      !editor.isConnected ||
      editor.parentNode !== bar.parentNode ||
      !inCommentContext(editor)
    ) {
      bar.remove();
    }
  }
}

let renderQueued = false;
let fullRenderNeeded = false;
const dirtyEditors = new Set<Element>();

function requestRender(editor?: Element): void {
  if (editor) dirtyEditors.add(editor);
  else fullRenderNeeded = true;
  if (renderQueued) return;
  renderQueued = true;
  requestAnimationFrame(() => {
    renderQueued = false;
    const full = fullRenderNeeded;
    fullRenderNeeded = false;
    const editors = Array.from(dirtyEditors);
    dirtyEditors.clear();
    if (full) {
      render();
    } else if (enabled && signedIn && badgesReady && equippedReady) {
      for (const el of editors) {
        if (el.isConnected && inCommentContext(el)) updateBar(el, barFor(el));
      }
    }
  });
}

function onInput(e: Event): void {
  if (!enabled || !started) return;
  const target = e.target;
  const editor = isElement(target) ? target.closest(EDITOR_SELECTOR) : null;
  if (editor && inCommentContext(editor)) {
    requestRender(editor);
    syncCommentState();
  }
}

let observedPath = window.location.pathname;

function onMutations(records: MutationRecord[]): void {
  const pathChanged = observedPath !== window.location.pathname;
  observedPath = window.location.pathname;
  if (!enabled || !started) return;
  if (pathChanged) {
    requestRender();
    return;
  }
  const selector = `${EDITOR_SELECTOR}, [${BAR_FLAG}], ${DIALOG_ANY_SELECTOR}`;
  const relevant = (node: Node): boolean =>
    node.nodeType === 1 &&
    ((node as Element).matches(selector) || Boolean((node as Element).querySelector(selector)));
  for (const record of records) {
    // textContent 更新会产生 childList 记录，忽略助手自己的内部改动。
    if (isElement(record.target) && record.target.closest(`[${BAR_FLAG}]`)) continue;
    if (
      Array.from(record.addedNodes).some(relevant) ||
      Array.from(record.removedNodes).some(relevant)
    ) {
      requestRender();
      return;
    }
  }
}

/* ------------------------------------------------------------------
   轻提示
------------------------------------------------------------------ */

function toast(msg: string, isErr?: boolean): void {
  if (!document.body) return;
  const el = document.createElement('div');
  el.textContent = msg;
  el.setAttribute('role', isErr ? 'alert' : 'status');
  el.style.cssText = [
    'position:fixed',
    'right:16px',
    'bottom:16px',
    'z-index:99999',
    'padding:12px 16px',
    'box-shadow:0 8px 28px #0002',
    'line-height:1.6',
    'font-family:system-ui,sans-serif',
    'border-radius:8px',
    'font-size:13px',
    isErr ? 'color:var(--color-error-content,#fff)' : 'color:var(--color-primary-content,#fff)',
    'max-width:80vw',
    isErr ? 'background:var(--color-error,#dc2626)' : 'background:var(--color-primary,#176773)',
  ].join(';');
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2500);
}

/* ------------------------------------------------------------------
   启动
------------------------------------------------------------------ */

export default defineContentScript({
  matches: ['https://2libra.com/*'],
  runAt: 'document_idle',
  async main() {
    // 观察器与输入监听先挂上：读取设置只是一瞬，但期间新增的编辑器也不能漏掉。
    // 真正的渲染要等 `started`，避免在用户已关闭助手时先插一条状态栏。
    document.addEventListener('input', onInput, true);

    // 原生 <dialog> 的打开 / 关闭不一定伴随 DOM 增删，靠 toggle 事件补一次渲染。
    document.addEventListener(
      'toggle',
      (e) => {
        if (enabled && started && isElement(e.target) && e.target.matches(DIALOG_ANY_SELECTOR)) {
          requestRender();
        }
      },
      true,
    );

    new MutationObserver(onMutations).observe(document.documentElement, {
      childList: true,
      subtree: true,
    });

    // 回到前台也遵守同一冷却时间，不因频繁切换标签页增加请求。
    document.addEventListener('visibilitychange', syncCommentState);
    document.addEventListener('focusin', onInput, true);

    // 开关存在扩展设置里：设置页切换后，所有已打开的帖子页立即跟进。
    settingsItem.watch((value) => {
      const next = normalizeSettings(value).badgeSwitcher;
      if (!started || next === enabled) return;
      enabled = next;
      if (enabled) {
        render();
        void initData(true);
        syncCommentState();
      } else {
        stopSync();
        removeBars();
      }
    });

    // 登录 / 退出 / 重新授权都会换令牌：登录后补数据并显示，退出后清空并收起状态栏。
    tokensItem.watch((value) => {
      const next = tokenState(value);
      if (!started) return;
      const changed = next.signedIn !== signedIn || next.canReadEconomy !== canReadEconomy;
      signedIn = next.signedIn;
      canReadEconomy = next.canReadEconomy;
      if (!canReadEconomy) pandoraBox = null;
      if (!changed) return;
      if (!enabled) return;
      if (signedIn) {
        render();
        void initData(true);
        syncCommentState();
      } else {
        stopSync();
        removeBars();
        pair = { fixed: [], percent: [] };
        activityBadge = null;
        equipped = new Set();
        pandoraBox = null;
        badgesReady = false;
        equippedReady = false;
      }
    });

    const [settings, tokens] = await Promise.all([
      readSettings().catch(() => null),
      tokensItem.getValue().catch(() => null),
    ]);
    enabled = settings?.badgeSwitcher ?? true;
    const token = tokenState(tokens);
    signedIn = token.signedIn;
    canReadEconomy = token.canReadEconomy;
    started = true;

    render();
    if (enabled && signedIn) void initData();
  },
});
