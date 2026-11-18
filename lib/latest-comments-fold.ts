/**
 * 站点「最新评论」页（`/post/latest-comments`）的连续评论折叠。
 *
 * 这里只操作 DOM，不碰设置、观察器或扩展 API，方便在 bun test 里用
 * linkedom 构造最小页面验证；入口 `entrypoints/latest-comments.content.ts`
 * 负责读取开关与阈值、监听列表变化与清理。
 *
 * 页面结构（站点当前实现）：
 * ```html
 * <ul>
 *   <li class="group ...">
 *     <a href="/user/alice/about">alice</a>
 *     ...
 *     <a href="/post/node/short?commentId=...">帖子标题</a>
 *   </li>
 * </ul>
 * ```
 * 判定一条评论依赖「带 commentId 的帖子链接」；作者取 li 里第一个用户链接。
 * 不绑定任何 Tailwind 类名，站点改样式时不会失效。
 */
import {
  COMMENT_RUN_DEFAULT_LENGTH,
  commentAuthorKeyFromHref,
  commentIdFromHref,
  findConsecutiveGroups,
} from './comment-runs';

/** 默认折叠阈值：同一作者连续 3 条及以上时折叠。 */
export const FOLD_DEFAULT_LENGTH = COMMENT_RUN_DEFAULT_LENGTH;

/** 插入的折叠按钮容器标记。 */
export const FOLD_ATTR = 'data-t2-comment-fold';
/** 被隐藏的评论行标记。 */
export const HIDDEN_ATTR = 'data-t2-comment-folded';
const STYLE_ID = 't2-comment-fold-styles';
const SVG_NS = 'http://www.w3.org/2000/svg';

const FOLD_CSS = `
  [${HIDDEN_ATTR}] { display: none !important; }
  .t2-comment-fold {
    /*
     * 全部从站点主题变量派生：文字用 base-content，线条 / 底色用它的透明度，
     * 深色主题自动跟随；主色只在悬停箭头时点一下。
     */
    --t2-fold-ink: var(--color-base-content, currentColor);
    --t2-fold-line: color-mix(in srgb, var(--t2-fold-ink) 16%, transparent);
    --t2-fold-line-strong: color-mix(in srgb, var(--t2-fold-ink) 30%, transparent);
    --t2-fold-bg: color-mix(in srgb, var(--t2-fold-ink) 5%, transparent);
    --t2-fold-bg-hover: color-mix(in srgb, var(--t2-fold-ink) 9%, transparent);
    --t2-fold-muted: color-mix(in srgb, var(--t2-fold-ink) 62%, transparent);
    margin-top: 9px;
  }
  .t2-comment-fold__btn {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px 10px;
    border: 1px solid var(--t2-fold-line);
    border-radius: 9px;
    background: var(--t2-fold-bg);
    color: var(--t2-fold-ink);
    font: inherit;
    font-size: 12.5px;
    font-weight: 500;
    line-height: 1.5;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .t2-comment-fold__btn:hover,
  .t2-comment-fold__btn:focus-visible {
    background: var(--t2-fold-bg-hover);
    border-color: var(--t2-fold-line-strong);
  }
  .t2-comment-fold__icon {
    display: grid;
    place-items: center;
    flex: none;
    color: var(--t2-fold-muted);
    transform: rotate(90deg);
    transition: transform 0.18s, color 0.15s;
  }
  .t2-comment-fold__btn:hover .t2-comment-fold__icon,
  .t2-comment-fold__btn:focus-visible .t2-comment-fold__icon {
    color: var(--color-primary, var(--t2-fold-ink));
  }
  .t2-comment-fold__btn[aria-expanded="true"] .t2-comment-fold__icon {
    transform: rotate(-90deg);
  }
  .t2-comment-fold__text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .t2-comment-fold__author,
  .t2-comment-fold__count {
    color: var(--t2-fold-ink);
    font-weight: 700;
  }
  .t2-comment-fold__action {
    flex: none;
    margin-left: auto;
    padding: 2px 10px;
    border: 1px solid var(--t2-fold-line-strong);
    border-radius: 999px;
    background: var(--color-base-100, transparent);
    color: inherit;
    font-size: 11.5px;
    font-weight: 600;
    white-space: nowrap;
  }
  .t2-comment-fold__btn[aria-expanded="true"] .t2-comment-fold__action {
    border-color: var(--t2-fold-line);
    background: transparent;
    color: var(--t2-fold-muted);
  }
`;

/** 一条评论：直接子节点是 li，且底部有带 commentId 的帖子链接与作者链接。 */
export function isCommentItem(node: Element): node is HTMLElement {
  return (
    node.tagName === 'LI' &&
    node.querySelector('a[href*="commentId="]') !== null &&
    node.querySelector('a[href^="/user/"]') !== null
  );
}

function commentItemsIn(list: Element): HTMLElement[] {
  return Array.from(list.children).filter(isCommentItem);
}

/**
 * 时间线的全部行（含非评论行）。
 * 分组时把非评论行记为 null，既不会误并到同一组，也能正确打断连续片段。
 */
function timelineItemsIn(list: Element): HTMLElement[] {
  return Array.from(list.children).filter(
    (child): child is HTMLElement => child.tagName === 'LI',
  );
}

/** 评论列表：直接子节点里至少有一条完整评论的 ul。 */
export function findCommentLists(root: ParentNode): HTMLUListElement[] {
  return Array.from(root.querySelectorAll('ul')).filter(
    (ul) => commentItemsIn(ul).length > 0,
  );
}

function authorKeyOf(item: Element): string | null {
  const link = item.querySelector('a[href^="/user/"]');
  return commentAuthorKeyFromHref(link?.getAttribute('href'));
}

function authorNameOf(item: Element): string {
  const author = item.querySelector('a[href^="/user/"]')?.textContent?.trim();
  return author || '匿名';
}

function runKeyOf(item: Element, index: number): string {
  const href = item.querySelector('a[href*="commentId="]')?.getAttribute('href');
  return commentIdFromHref(href) ?? `run:${index}`;
}

/** 样式只插一次；没有配置的普通页面不会执行到这里。 */
export function ensureFoldStyles(doc: Document): void {
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = FOLD_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}

/** 移除所有折叠痕迹：按钮与被隐藏的行都恢复原样。 */
export function clearCommentFolds(root: ParentNode): void {
  for (const node of root.querySelectorAll(`[${FOLD_ATTR}]`)) node.remove();
  for (const item of root.querySelectorAll(`[${HIDDEN_ATTR}]`)) {
    item.removeAttribute(HIDDEN_ATTR);
  }
}

function createChevron(doc: Document): SVGSVGElement {
  const svg = doc.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', '11');
  svg.setAttribute('height', '11');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const path = doc.createElementNS(SVG_NS, 'path');
  path.setAttribute('d', 'm9 6 6 6-6 6');
  svg.appendChild(path);
  return svg;
}

function buildToggle(
  doc: Document,
  first: HTMLElement,
  count: number,
  key: string,
  open: boolean,
  onToggle: (key: string) => void,
): HTMLElement {
  const wrap = doc.createElement('div');
  wrap.className = 't2-comment-fold';
  wrap.setAttribute(FOLD_ATTR, 'true');

  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 't2-comment-fold__btn';
  button.setAttribute('aria-expanded', String(open));
  button.title = open
    ? `收起 @${authorNameOf(first)} 的连续评论`
    : `展开 @${authorNameOf(first)} 的 ${count - 1} 条连续评论`;

  const icon = doc.createElement('span');
  icon.className = 't2-comment-fold__icon';
  icon.setAttribute('aria-hidden', 'true');
  icon.appendChild(createChevron(doc));

  const text = doc.createElement('span');
  text.className = 't2-comment-fold__text';
  const author = doc.createElement('span');
  author.className = 't2-comment-fold__author';
  author.textContent = `@${authorNameOf(first)}`;
  const countEl = doc.createElement('span');
  countEl.className = 't2-comment-fold__count';
  countEl.textContent = `${open ? count : count - 1} 条`;

  if (open) {
    text.append(
      author,
      doc.createTextNode(' 的 '),
      countEl,
      doc.createTextNode('连续评论已展开'),
    );
  } else {
    text.append(
      author,
      doc.createTextNode(' 还有 '),
      countEl,
      doc.createTextNode('连续评论'),
    );
  }

  const action = doc.createElement('span');
  action.className = 't2-comment-fold__action';
  action.textContent = open ? '收起' : `展开 ${count - 1} 条`;

  button.append(icon, text, action);
  button.addEventListener('click', (event) => {
    // 站点行内可能有跳转 / 弹层监听，按钮只负责折叠，不冒泡。
    event.preventDefault();
    event.stopPropagation();
    onToggle(key);
  });

  wrap.appendChild(button);
  return wrap;
}

export interface ApplyFoldsOptions {
  /** 已展开的组：key 是组内第一条评论的 commentId（拿不到时退回下标）。 */
  expanded: ReadonlySet<string>;
  /** 点击展开 / 收起时回调，由调用方更新状态并重新套用。 */
  onToggle: (key: string) => void;
  minLength?: number;
}

/**
 * 按当前 DOM 重新套用折叠，返回本次折叠的组数。
 * 每次调用都会先还原旧的隐藏与按钮，因此可以安全地重复执行。
 */
export function applyCommentFolds(
  doc: Document,
  { expanded, onToggle, minLength = FOLD_DEFAULT_LENGTH }: ApplyFoldsOptions,
): number {
  clearCommentFolds(doc);
  ensureFoldStyles(doc);

  let folded = 0;
  for (const list of findCommentLists(doc)) {
    const items = timelineItemsIn(list);
    const keys = items.map((item) => (isCommentItem(item) ? authorKeyOf(item) : null));

    for (const group of findConsecutiveGroups(keys, minLength)) {
      const first = items[group.start];
      if (!first || !isCommentItem(first)) continue;

      const key = runKeyOf(first, group.start);
      const open = expanded.has(key);
      if (!open) {
        for (const item of items.slice(group.start + 1, group.start + group.length)) {
          if (isCommentItem(item)) item.setAttribute(HIDDEN_ATTR, 'true');
        }
      }
      first.appendChild(buildToggle(doc, first, group.length, key, open, onToggle));
      folded += 1;
    }
  }
  return folded;
}
