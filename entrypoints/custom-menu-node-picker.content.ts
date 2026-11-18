/**
 * 2libra「自定义菜单」弹窗的节点级联选择器（content script）。
 *
 * 站点只提供「菜单名称 / 菜单链接」两个输入框，添加节点菜单时得自己去节点页
 * 抄地址。这里在弹窗里插入三列级联选择器（分区 → 父节点 → 子节点），选中后
 * 按 `/node/<slug>` 或 `/node/<父>/<子>` 回填；同时支持按名称 / slug 搜索。
 *
 * 实现要点：
 * - 匹配整个站点，只在检测到「菜单名称 + 菜单链接」两个 fieldset 的弹窗时挂载；
 * - 节点树用扩展已有的 `/v1/nodes` 缓存，第一次真正打开菜单弹窗时才请求；
 * - 站点用 React 渲染弹窗，输入框回填走原生 setter + input/change（见纯逻辑模块）；
 * - 用 MutationObserver 处理弹窗延迟挂载、React 重渲染与客户端路由切换。
 */
import { defineContentScript } from '#imports';
import {
  applyMenuTarget,
  createNodePicker,
  ensurePickerStyles,
  findMenuDialogs,
  findMenuFields,
  mountNodePicker,
  type NodePicker,
  removeNodePickers,
} from '@/lib/custom-menu-node-picker';
import { loadNodes } from '@/lib/nodes';
import { normalizeSettings, readSettings, settingsItem } from '@/lib/storage';
import type { ApiNode } from '@/lib/types';

let enabled = true;
let started = false;
let observer: MutationObserver | null = null;
let timer: number | null = null;
/** 是否还有我们插入的面板，关闭开关后只清理一次。 */
let dirty = false;

/** 节点树只拉一次；失败后清空，下次打开弹窗或点「重试」时重新请求。 */
let nodes: ApiNode[] | null = null;
let nodesPromise: Promise<ApiNode[]> | null = null;

/** dialog → 已挂载的选择器，用于避免重复挂载和处理 React 重渲染。 */
const pickers = new Map<Element, NodePicker>();

function ensureNodes(): Promise<ApiNode[]> {
  if (nodes) return Promise.resolve(nodes);
  if (!nodesPromise) {
    nodesPromise = loadNodes().then(
      (value) => {
        nodes = value;
        nodesPromise = null;
        return value;
      },
      (error: unknown) => {
        nodesPromise = null;
        throw error;
      },
    );
  }
  return nodesPromise;
}

function loadInto(picker: NodePicker): void {
  picker.showLoading();
  void ensureNodes().then(
    (value) => picker.setNodes(value),
    () => picker.showError('节点加载失败', () => loadInto(picker)),
  );
}

function enhance(dialog: Element): void {
  if (!enabled) return;

  const existing = pickers.get(dialog);
  if (existing) {
    if (dialog.contains(existing.element)) return;
    existing.destroy();
    pickers.delete(dialog);
  }

  if (!findMenuFields(dialog)) return;

  let picker: NodePicker;
  picker = createNodePicker(document, {
    onPick: (target) => applyMenuTarget(dialog, target),
    onRetry: () => loadInto(picker),
  });

  ensurePickerStyles(document);
  if (!mountNodePicker(dialog, picker)) {
    picker.destroy();
    return;
  }

  pickers.set(dialog, picker);
  dirty = true;
  loadInto(picker);
}

function apply(): void {
  // 关闭后把已插入的面板清掉；不需要反复查询 DOM。
  if (!enabled) {
    if (dirty) {
      for (const picker of pickers.values()) picker.destroy();
      removeNodePickers(document);
      pickers.clear();
      dirty = false;
    }
    return;
  }

  // 弹出层被关闭 / 卸载，或弹窗里已经没有「菜单名称 + 菜单链接」两个
  // 输入框（例如切换到其它表单）时，移除已经挂上去的 Cascader。
  for (const [dialog, picker] of pickers) {
    if (
      !dialog.isConnected ||
      !dialog.contains(picker.element) ||
      !findMenuFields(dialog)
    ) {
      picker.destroy();
      pickers.delete(dialog);
    }
  }
  dirty = pickers.size > 0;

  for (const dialog of findMenuDialogs(document)) enhance(dialog);
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
    // 设置页切换开关后，已打开的菜单弹窗立即跟进，不需要刷新。
    settingsItem.watch((value) => {
      const next = normalizeSettings(value).customMenuNodePicker;
      if (!started || next === enabled) return;
      enabled = next;
      schedule(0);
    });

    const settings = await readSettings().catch(() => null);
    enabled = settings?.customMenuNodePicker ?? true;
    started = true;

    observer = new MutationObserver(() => schedule());
    observer.observe(document.documentElement, { childList: true, subtree: true });

    // 等 React 首屏 hydration 完成再看；菜单弹窗通常由用户点击后才挂载。
    schedule(enabled ? 300 : 0);
  },
});
