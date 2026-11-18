/**
 * 2libra「最新评论」页（`/post/latest-comments`）的连续评论折叠。
 *
 * 站点自己的最新评论时间线不合并相邻发言，同一个用户连发几条就会占满整屏。
 * 开启设置里的「折叠连续评论」后，同一作者连续达到设置阈值（默认 3 条）时
 * 只保留第一条，其余隐藏，并在第一条下方插入「展开另外 N 条」按钮；再点一次收起。
 *
 * 实现要点：
 * - 匹配整个站点，只在 pathname 是最新评论页时生效，兼容 Next.js 的客户端跳转；
 * - 列表由站点 React 渲染，用 MutationObserver 在列表变化后重新套用分组，
 *   套用期间断开观察器，避免自己的 DOM 改动触发回环；
 * - 折叠的 DOM 细节在 lib/latest-comments-fold.ts，入口只负责开关与生命周期。
 */
import { defineContentScript } from '#imports';
import { COMMENT_RUN_DEFAULT_LENGTH } from '@/lib/comment-runs';
import {
  applyCommentFolds,
  clearCommentFolds,
} from '@/lib/latest-comments-fold';
import { normalizeSettings, readSettings, settingsItem } from '@/lib/storage';

const PAGE_PATH = '/post/latest-comments';

let enabled = false;
/** 连续多少条折叠；设置里可调，默认 3。 */
let threshold = COMMENT_RUN_DEFAULT_LENGTH;
let started = false;
let observer: MutationObserver | null = null;
let timer: number | null = null;
let lastPath = '';
/** 当前 DOM 里是否有我们插入 / 隐藏过的节点，用于离开页面后只清理一次。 */
let dirty = false;
/** 已展开的折叠组：优先用评论 id，拿不到时退回下标。 */
const expanded = new Set<string>();

function isLatestCommentsPage(): boolean {
  return window.location.pathname.replace(/\/+$/, '') === PAGE_PATH;
}

function apply(): void {
  const path = window.location.pathname;
  if (path !== lastPath) {
    lastPath = path;
    expanded.clear();
  }

  // 关闭或换到别的页面：只清理一次，避免在普通页面反复查询 DOM。
  if (!enabled || !isLatestCommentsPage()) {
    if (dirty) {
      clearCommentFolds(document);
      dirty = false;
    }
    return;
  }

  const folded = applyCommentFolds(document, {
    expanded,
    minLength: threshold,
    onToggle: (key) => {
      if (expanded.has(key)) expanded.delete(key);
      else expanded.add(key);
      schedule(0);
    },
  });
  dirty = folded > 0;
}

/** 合并短时间内的多次 DOM 变化；套用期间断开观察器，避免观察自己的改动。 */
function schedule(delay = 120): void {
  if (timer !== null) window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = null;
    observer?.disconnect();
    try {
      apply();
    } finally {
      observer?.observe(document.documentElement, { childList: true, subtree: true });
    }
  }, delay);
}

export default defineContentScript({
  matches: ['https://2libra.com/*'],
  runAt: 'document_idle',
  async main() {
    // 设置页切换开关或调整阈值后，已打开的最新评论页立即跟进，不需要刷新。
    settingsItem.watch((value) => {
      const next = normalizeSettings(value);
      const nextEnabled = next.collapseRepeatedComments;
      const nextThreshold = next.collapseRepeatedCommentsThreshold;
      if (!started || (nextEnabled === enabled && nextThreshold === threshold)) return;
      enabled = nextEnabled;
      threshold = nextThreshold;
      schedule(0);
    });

    const settings = await readSettings().catch(() => null);
    enabled = settings?.collapseRepeatedComments ?? false;
    threshold = settings?.collapseRepeatedCommentsThreshold ?? COMMENT_RUN_DEFAULT_LENGTH;
    started = true;

    observer = new MutationObserver(() => schedule());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // 等首屏 hydration 完成再插按钮，避免和站点的 React 首次渲染抢 DOM。
    schedule(enabled ? 300 : 0);
  },
});
