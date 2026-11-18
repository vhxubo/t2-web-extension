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

const FOLD_CSS = `
  [${HIDDEN_ATTR}] { display: none !important; }

  /*
   * 连续评论展开 / 收起：两侧 1px 分割线夹一枚居中胶囊。
   * 颜色全部取自 daisyUI 主题变量，主题与深浅色自动跟随：
   * - 展开态用主色（primary）的 10% / 20% 浅底，突出可点击；
   * - 收起态退为 base-content 60% 的次要灰，不再和正文抢注意力。
   * 同时兼容 daisyUI 4+ 的 --color-* 与旧版的 --p / --bc HSL 三元组。
   */
  .t2-comment-fold {
    --t2-fold-primary: var(--color-primary, hsl(var(--p, 259.9 94.2% 51.2%)));
    --t2-fold-ink: var(--color-base-content, hsl(var(--bc, 215 28% 17%)));
    --t2-fold-line: color-mix(in oklab, var(--t2-fold-ink) 15%, transparent);
    --t2-fold-muted: color-mix(in oklab, var(--t2-fold-ink) 60%, transparent);
    --t2-fold-wash: color-mix(in oklab, var(--t2-fold-primary) 10%, transparent);
    --t2-fold-wash-hover: color-mix(in oklab, var(--t2-fold-primary) 20%, transparent);

    display: flex;
    align-items: center;
    gap: 10px;
    margin: 12px 0;
  }
  .t2-comment-fold::before,
  .t2-comment-fold::after {
    content: "";
    flex: 1 1 0;
    height: 1px;
    background: var(--t2-fold-line);
  }
  .t2-comment-fold__btn {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    max-width: 100%;
    padding: 5px 14px;
    border: 0;
    border-radius: 9999px;
    background: var(--t2-fold-wash);
    color: var(--t2-fold-primary);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    line-height: 1.5;
    text-align: center;
    cursor: pointer;
    appearance: none;
    transition: all 0.2s ease;
  }
  .t2-comment-fold__btn:hover {
    background: var(--t2-fold-wash-hover);
    transform: translateY(-1px);
  }
  .t2-comment-fold__btn:focus-visible {
    outline: 2px solid var(--t2-fold-primary);
    outline-offset: 2px;
  }
  .t2-comment-fold__btn[aria-expanded="true"] {
    background: transparent;
    color: var(--t2-fold-muted);
  }
  .t2-comment-fold__btn[aria-expanded="true"]:hover {
    background: transparent;
    color: var(--t2-fold-primary);
    transform: none;
  }
  .t2-comment-fold__label {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .t2-comment-fold__author,
  .t2-comment-fold__count {
    font-weight: 600;
  }
  .t2-comment-fold__count {
    font-variant-numeric: tabular-nums;
  }
  .t2-comment-fold__glyph {
    font-size: 10px;
  }
  @media (prefers-reduced-motion: reduce) {
    .t2-comment-fold__btn {
      transition: none;
    }
    .t2-comment-fold__btn:hover {
      transform: none;
    }
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

/** 胶囊里的方向箭头：纯装饰，交给 CSS 着色，读屏器跳过。 */
function createGlyph(doc: Document, open: boolean): HTMLSpanElement {
  const glyph = doc.createElement('span');
  glyph.className = 't2-comment-fold__glyph';
  glyph.setAttribute('aria-hidden', 'true');
  glyph.textContent = open ? '▴' : '▾';
  return glyph;
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

  const authorName = authorNameOf(first);
  const hidden = count - 1;
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 't2-comment-fold__btn';
  button.setAttribute('aria-expanded', String(open));
  button.title = open
    ? `收起 @${authorName} 的连续评论`
    : `展开 @${authorName} 的 ${hidden} 条连续评论`;

  const label = doc.createElement('span');
  label.className = 't2-comment-fold__label';

  if (open) {
    label.append(doc.createTextNode('已展开连续评论 · 收起 '), createGlyph(doc, true));
  } else {
    const author = doc.createElement('span');
    author.className = 't2-comment-fold__author';
    author.textContent = `@${authorName}`;
    const countEl = doc.createElement('span');
    countEl.className = 't2-comment-fold__count';
    countEl.textContent = String(hidden);

    label.append(
      createGlyph(doc, false),
      doc.createTextNode(' 展开 '),
      author,
      doc.createTextNode(' 的 '),
      countEl,
      doc.createTextNode(' 条连续评论'),
    );
  }

  button.append(label);
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
