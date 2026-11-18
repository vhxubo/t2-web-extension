/**
 * 站点「自定义菜单」弹窗里的节点级联选择器。
 *
 * 站点目前只能手填「菜单名称」和「菜单链接」，想给某个节点加菜单得自己去翻
 * 节点页抄地址。这里在弹窗的两组输入框前插入一个紧凑的级联输入（Cascader）：
 *
 *   未展开时只占一行；点击后在下方浮出三列：
 *   分区（工作 / 生活 / 特别 / 其他）→ 父节点 → 子节点
 *
 * 选中父节点或子节点后，按站点的节点地址规则回填：
 * - 父节点：`/node/<slug>`
 * - 子节点：`/node/<父节点 slug>/<子节点 slug>`
 *
 * 站点的输入框由 React 控制，直接改 `input.value` 不会触发 onChange；所以回填时
 * 走原生 `HTMLInputElement.prototype.value` 的 setter，再补发 `input` / `change`
 * 事件，让 React 的 value tracker 看到变化。
 *
 * 本文件只做 DOM 与数据转换，不读扩展设置、不请求接口，方便用 linkedom 测试；
 * 生命周期、节点加载与开关在 `entrypoints/custom-menu-node-picker.content.ts`。
 */
import { groupNodes, type SectionGroup } from './node-tree';
import type { ApiNode } from './types';

/** 插入的级联控件标记，也用于判断弹窗里是否已经挂过选择器。 */
export const PICKER_ATTR = 'data-t2-node-picker';
/** 浮层被挂到弹窗根节点时带上的标记（用于保持样式作用域）。 */
export const PICKER_PORTAL_ATTR = 'data-t2-node-picker-portal';
/** 样式只插一次。 */
export const PICKER_STYLE_ID = 't2-node-picker-styles';
/** 与站点「菜单名称」输入框的 maxlength 一致。 */
export const MENU_NAME_LIMIT = 20;

const DIALOG_SELECTOR = 'dialog, .modal, [role="dialog"]';
const MAX_SEARCH_RESULTS = 80;

export interface MenuTarget {
  /** 要填进「菜单名称」的文本，已按站点上限截断。 */
  name: string;
  /** 要填进「菜单链接」的站内路径。 */
  href: string;
  node: ApiNode;
  parent: ApiNode | null;
  kind: 'parent' | 'child';
}

export interface MenuFields {
  name: HTMLInputElement;
  href: HTMLInputElement;
}

export interface NodePicker {
  element: HTMLElement;
  setNodes: (nodes: ApiNode[]) => void;
  showLoading: (message?: string) => void;
  showError: (message: string, retry?: () => void) => void;
  /** 移除控件并清理打开时挂在 document / window 上的监听。 */
  destroy: () => void;
}

export interface NodePickerOptions {
  /** 返回 false 表示没有找到可填写的输入框，选择器会给出对应提示。 */
  onPick: (target: MenuTarget) => boolean | void;
  /** 加载失败时的默认重试入口。 */
  onRetry?: () => void;
}

interface FlatNode {
  group: SectionGroup;
  node: ApiNode;
  parent: ApiNode | null;
}

type PickerPhase = 'loading' | 'error' | 'ready';

interface PickerState {
  groups: SectionGroup[];
  /** 当前分区（SectionGroup.dimension）。 */
  group: string | null;
  /** 当前展开的父节点 slug，用于第三列。 */
  parent: string | null;
  /** 最近一次真正回填的节点，仅用于高亮。 */
  picked: string | null;
  query: string;
  phase: PickerPhase;
  open: boolean;
}

function clean(value: string | null | undefined): string {
  return (value ?? '').trim();
}

function textOf(element: Element): string {
  return (element.textContent ?? '').replace(/\s+/g, ' ').trim();
}

/** 按站点输入框的 maxlength（UTF-16 码元）截断，避免把 emoji 劈成半个。 */
export function clipMenuName(value: string, limit = MENU_NAME_LIMIT): string {
  let clipped = '';
  for (const char of value) {
    if (clipped.length + char.length > limit) break;
    clipped += char;
  }
  return clipped;
}

/** 节点对应的菜单名称与链接；没有 slug 的节点不可用。 */
export function menuTargetFor(
  node: ApiNode,
  parent: ApiNode | null = null,
): MenuTarget | null {
  const slug = clean(node.slug);
  if (!slug) return null;

  const parentSlug = clean(parent?.slug) || clean(node.parent_slug);
  const child = Boolean(parentSlug && parentSlug !== slug);
  const href = child
    ? `/node/${encodeURIComponent(parentSlug)}/${encodeURIComponent(slug)}`
    : `/node/${encodeURIComponent(slug)}`;

  const rawName = clean(node.name) || slug;
  const name = clipMenuName(rawName);

  return { name, href, node, parent, kind: child ? 'child' : 'parent' };
}

function fieldSetOf(dialog: Element, legendPrefix: string): HTMLElement | null {
  for (const fieldset of Array.from(dialog.querySelectorAll('fieldset'))) {
    const matched = Array.from(fieldset.querySelectorAll('legend')).some((legend) =>
      textOf(legend).startsWith(legendPrefix),
    );
    if (matched) return fieldset as HTMLElement;
  }
  return null;
}

function fieldInput(dialog: Element, legendPrefix: string): HTMLInputElement | null {
  const fieldset = fieldSetOf(dialog, legendPrefix);
  if (!fieldset) return null;
  const input = fieldset.querySelector('input');
  return input && input.tagName === 'INPUT' ? (input as HTMLInputElement) : null;
}

/**
 * 认「自定义菜单」弹窗：同时存在「菜单名称」和「菜单链接」两组 fieldset。
 * 不依赖标题文字或 Tailwind 类名，站点改样式后仍能命中。
 */
export function findMenuFields(dialog: Element): MenuFields | null {
  const name = fieldInput(dialog, '菜单名称');
  const href = fieldInput(dialog, '菜单链接');
  return name && href ? { name, href } : null;
}

export function isMenuDialog(element: Element): boolean {
  return findMenuFields(element) !== null;
}

/** 找出页面里的菜单弹窗；嵌套的 `.modal` / `[role=dialog]` 只保留最内层。 */
export function findMenuDialogs(root: ParentNode): HTMLElement[] {
  const menus = (Array.from(root.querySelectorAll(DIALOG_SELECTOR)) as HTMLElement[]).filter(
    isMenuDialog,
  );
  return menus.filter(
    (element) => !menus.some((other) => other !== element && element.contains(other)),
  );
}

/**
 * 给受控输入框赋值。
 * React 会在元素实例上装 value tracker，直接赋值它可能看不到；用原型上的 setter
 * 改底层值，再发 input / change，onChange 才会触发。
 */
export function setInputValue(input: HTMLInputElement, value: string): void {
  const view = input.ownerDocument?.defaultView;
  const proto = view?.HTMLInputElement?.prototype;
  const setter = proto ? Object.getOwnPropertyDescriptor(proto, 'value')?.set : undefined;

  if (setter) setter.call(input, value);
  else input.value = value;

  const EventCtor = view?.Event ?? Event;
  input.dispatchEvent(new EventCtor('input', { bubbles: true }));
  input.dispatchEvent(new EventCtor('change', { bubbles: true }));
}

/** 把节点名称与链接写进弹窗；弹窗结构变了找不到输入框时返回 false。 */
export function applyMenuTarget(dialog: Element, target: MenuTarget): boolean {
  const fields = findMenuFields(dialog);
  if (!fields) return false;
  // 站点可能调整 maxlength；以输入框当前的上限为准，避免程序化赋值绕过限制。
  const attr = Number(fields.name.getAttribute('maxlength'));
  const limit = Number.isFinite(attr) && attr > 0 ? attr : MENU_NAME_LIMIT;
  setInputValue(fields.name, clipMenuName(target.name, limit));
  setInputValue(fields.href, target.href);
  return true;
}

/** 把选择器插到「菜单名称」fieldset 前面；已有选择器或结构不对时返回 false。 */
export function mountNodePicker(dialog: Element, picker: NodePicker): boolean {
  if (dialog.querySelector(`[${PICKER_ATTR}]`)) return false;
  const anchor = fieldSetOf(dialog, '菜单名称') ?? findMenuFields(dialog)?.name ?? null;
  const parent = anchor?.parentNode;
  if (!anchor || !parent) return false;
  parent.insertBefore(picker.element, anchor);
  return true;
}

export function removeNodePickers(root: ParentNode): number {
  const pickers = Array.from(root.querySelectorAll(`[${PICKER_ATTR}]`));
  for (const picker of pickers) picker.remove();
  const portals = Array.from(root.querySelectorAll(`[${PICKER_PORTAL_ATTR}]`));
  for (const portal of portals) portal.remove();
  return pickers.length;
}

function append(parent: Node, child: Node | string): void {
  if (typeof child === 'string') parent.appendChild(parent.ownerDocument!.createTextNode(child));
  else parent.appendChild(child);
}

function clear(element: Element): void {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function span(doc: Document, className: string): HTMLSpanElement {
  const node = doc.createElement('span');
  node.className = className;
  return node;
}

/** 紧凑的级联输入：默认只占一行，点击后在下方浮出三列。 */
export function createNodePicker(doc: Document, options: NodePickerOptions): NodePicker {
  const view = doc.defaultView;
  const state: PickerState = {
    groups: [],
    group: null,
    parent: null,
    picked: null,
    query: '',
    phase: 'loading',
    open: false,
  };

  const root = doc.createElement('div');
  root.className = 't2-node-cascader';
  root.setAttribute(PICKER_ATTR, 'true');
  root.setAttribute('data-open', 'false');

  const trigger = doc.createElement('button');
  trigger.type = 'button';
  trigger.className = 't2-node-cascader__trigger';
  trigger.setAttribute('aria-expanded', 'false');
  trigger.setAttribute('aria-label', '从节点选择');
  const label = span(doc, 't2-node-cascader__label');
  label.textContent = '从节点选择';
  const hint = span(doc, 't2-node-cascader__hint');
  hint.textContent = '自动填入名称和链接';
  const chevron = span(doc, 't2-node-cascader__chevron');
  chevron.setAttribute('aria-hidden', 'true');
  trigger.append(label, hint, chevron);

  const popover = doc.createElement('div');
  popover.className = 't2-node-cascader__popover';
  popover.hidden = true;
  popover.setAttribute('role', 'group');
  popover.setAttribute('aria-label', '节点级联选择');

  const search = doc.createElement('input');
  search.type = 'search';
  search.className = 't2-node-picker__search';
  search.placeholder = '搜索节点名称或 slug…';
  search.setAttribute('aria-label', '搜索节点');

  const columns = doc.createElement('div');
  columns.className = 't2-node-picker__columns';

  const makeColumn = (captionText: string, key: string) => {
    const wrap = doc.createElement('div');
    wrap.className = 't2-node-picker__column';
    const caption = doc.createElement('div');
    caption.className = 't2-node-picker__column-title';
    caption.textContent = captionText;
    const list = doc.createElement('div');
    list.className = 't2-node-picker__list';
    list.setAttribute('role', 'group');
    list.setAttribute('aria-label', captionText);
    list.setAttribute('data-t2-node-col', key);
    wrap.append(caption, list);
    columns.appendChild(wrap);
    return list;
  };

  const groupList = makeColumn('分区', 'group');
  const parentList = makeColumn('父节点', 'parent');
  const childList = makeColumn('子节点', 'child');

  const results = doc.createElement('div');
  results.className = 't2-node-picker__results';
  results.hidden = true;
  results.setAttribute('role', 'group');
  results.setAttribute('aria-label', '搜索结果');

  const status = doc.createElement('div');
  status.className = 't2-node-picker__status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  status.hidden = true;

  popover.append(search, columns, results, status);
  root.append(trigger, popover);

  function setStatus(message: string, retry?: () => void): void {
    clear(status);
    status.hidden = !message && !retry;
    if (message) append(status, message);
    if (retry) {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 't2-node-picker__retry';
      button.textContent = '重试';
      button.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        retry();
      });
      if (message) append(status, ' ');
      append(status, button);
    }
  }

  function setTrigger(labelText: string, hintText: string): void {
    label.textContent = labelText;
    hint.textContent = hintText;
    trigger.title = hintText ? `${labelText} · ${hintText}` : labelText;
  }

  function updateTrigger(): void {
    if (state.phase === 'loading') {
      setTrigger('正在加载节点…', '请稍候');
      return;
    }
    if (state.phase === 'error') {
      setTrigger('节点加载失败', '点击重试');
      return;
    }
    if (!state.groups.length) {
      setTrigger('暂无节点数据', '');
      return;
    }
    setTrigger('从节点选择', '自动填入名称和链接');
  }

  function appendEmpty(container: Element, text: string): void {
    const empty = span(doc, 't2-node-picker__empty');
    empty.textContent = text;
    container.appendChild(empty);
  }

  function appendItem(
    container: Element,
    itemLabel: string,
    hintText: string | null,
    active: boolean,
    onPress: () => void,
  ): void {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 't2-node-picker__item';
    button.setAttribute('aria-pressed', active ? 'true' : 'false');

    const name = span(doc, 't2-node-picker__item-label');
    name.textContent = itemLabel;
    button.appendChild(name);
    if (hintText) {
      const sub = span(doc, 't2-node-picker__item-hint');
      sub.textContent = hintText;
      button.appendChild(sub);
    }

    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onPress();
    });

    const row = doc.createElement('div');
    row.className = 't2-node-picker__row';
    row.appendChild(button);
    container.appendChild(row);
  }

  function flatNodes(): FlatNode[] {
    const list: FlatNode[] = [];
    for (const group of state.groups) {
      for (const parent of group.nodes) {
        if (!clean(parent.slug)) continue;
        list.push({ group, node: parent, parent: null });
        for (const child of parent.children ?? []) {
          if (!clean(child.slug)) continue;
          list.push({ group, node: child, parent });
        }
      }
    }
    return list;
  }

  /** 弹窗根节点：把浮层挂到这里，避免被 .modal-box 的滚动容器裁切。 */
  function portalHost(): Element | null {
    return root.closest('dialog, .modal, [role="dialog"]');
  }

  function moveToHost(): void {
    const host = portalHost();
    if (!host) return;
    if (popover.parentElement !== host) host.appendChild(popover);
    popover.classList.add('t2-node-cascader__popover--portal');
    popover.setAttribute(PICKER_PORTAL_ATTR, 'true');
    popover.style.right = 'auto';
  }

  function moveBack(): void {
    if (popover.parentElement === root) return;
    root.appendChild(popover);
    popover.classList.remove('t2-node-cascader__popover--portal');
    popover.removeAttribute(PICKER_PORTAL_ATTR);
    popover.style.left = '';
    popover.style.top = '';
    popover.style.width = '';
    popover.style.right = '';
    popover.style.bottom = '';
  }

  function updatePlacement(): void {
    if (!state.open) return;
    const rect = trigger.getBoundingClientRect?.();
    const height = popover.offsetHeight || 260;

    // 找不到弹窗根节点时退回「相对触发按钮绝对定位」。
    if (popover.parentElement === root) {
      const spaceBelow = (view?.innerHeight ?? 0) - (rect?.bottom ?? 0);
      root.setAttribute('data-flip', spaceBelow < height + 8 ? 'true' : 'false');
      return;
    }

    if (!rect) return;
    const width = rect.width;
    const viewportWidth = view?.innerWidth ?? width + 16;
    const left = Math.min(Math.max(8, rect.left), Math.max(8, viewportWidth - width - 8));
    const spaceBelow = (view?.innerHeight ?? 0) - rect.bottom;
    const flip = spaceBelow < height + 8 && rect.top > spaceBelow;

    popover.style.left = `${left}px`;
    popover.style.width = `${width}px`;
    popover.style.top = `${
      flip ? Math.max(8, rect.top - height - 4) : rect.bottom + 4
    }px`;
    popover.style.bottom = 'auto';
  }

  function onPointerDown(event: Event): void {
    const target = event.target as Node | null;
    if (target && (root.contains(target) || popover.contains(target))) return;
    close();
  }

  function open(): void {
    if (state.open) return;
    state.open = true;
    root.setAttribute('data-open', 'true');
    trigger.setAttribute('aria-expanded', 'true');
    popover.hidden = false;
    moveToHost();
    render();
    updatePlacement();
    view?.addEventListener('resize', updatePlacement);
    doc.addEventListener('scroll', updatePlacement, true);
    doc.addEventListener('pointerdown', onPointerDown, true);
    if (!search.disabled) {
      view?.setTimeout(() => {
        if (state.open) search.focus();
      }, 0);
    }
  }

  function close(): void {
    if (!state.open) return;
    state.open = false;
    root.setAttribute('data-open', 'false');
    trigger.setAttribute('aria-expanded', 'false');
    popover.hidden = true;
    moveBack();
    view?.removeEventListener('resize', updatePlacement);
    doc.removeEventListener('scroll', updatePlacement, true);
    doc.removeEventListener('pointerdown', onPointerDown, true);
    state.query = '';
    search.value = '';
  }

  function selectNode(node: ApiNode, parent: ApiNode | null, group?: SectionGroup): void {
    const target = menuTargetFor(node, parent);
    if (!target) return;

    if (group) state.group = group.dimension;
    // 选父节点时把它展开，第三列马上显示子节点；选子节点时保持父节点展开。
    state.parent = clean(parent?.slug) || clean(node.slug);
    state.picked = `${parent ? 'n' : 'p'}:${clean(node.slug)}`;

    const ok = options.onPick(target);
    state.query = '';
    search.value = '';

    if (ok === false) {
      setStatus('没有找到可填写的菜单输入框');
      render();
      return;
    }

    // 回填的是站点表单，不是 Cascader 自己的值：选完就清空，
    // 避免弹窗继续开着时仍显示上一次选择的节点。
    state.parent = null;
    state.picked = null;
    state.query = '';
    search.value = '';
    updateTrigger();
    close();
  }

  function renderColumns(): void {
    clear(groupList);
    clear(parentList);
    clear(childList);

    const current =
      state.groups.find((group) => group.dimension === state.group) ?? state.groups[0];
    state.group = current?.dimension ?? null;

    for (const group of state.groups) {
      const count = group.nodes.filter((node) => clean(node.slug)).length;
      appendItem(groupList, group.label, `${count} 个父节点`, group.dimension === state.group, () => {
        state.group = group.dimension;
        state.parent = null;
        state.picked = null;
        state.query = '';
        search.value = '';
        setStatus('');
        render();
      });
    }

    const parents = (current?.nodes ?? []).filter((node) => clean(node.slug));
    if (!parents.length) appendEmpty(parentList, '暂无节点');
    for (const node of parents) {
      const slug = clean(node.slug);
      // 父节点本身也是合法的菜单目标，但先点击只展开子节点；
      // 需要父节点时点第三列顶部的「使用父节点」。
      appendItem(
        parentList,
        clean(node.name) || slug,
        slug,
        state.parent === slug,
        () => {
          state.parent = slug;
          state.picked = null;
          state.query = '';
          search.value = '';
          setStatus('');
          render();
        },
      );
    }

    const parent = parents.find((node) => clean(node.slug) === state.parent) ?? null;
    if (!parent) {
      appendEmpty(childList, '先选择父节点');
      return;
    }

    const parentName = clean(parent.name) || clean(parent.slug);
    const parentTarget = menuTargetFor(parent);
    appendItem(
      childList,
      `使用父节点「${parentName}」`,
      parentTarget ? `${parentTarget.href} · 含全部子节点` : null,
      state.picked === `p:${clean(parent.slug)}`,
      () => selectNode(parent, null, current),
    );

    const children = (parent.children ?? []).filter((child) => clean(child.slug));
    if (!children.length) {
      appendEmpty(childList, '没有子节点');
      return;
    }
    for (const child of children) {
      const slug = clean(child.slug);
      appendItem(
        childList,
        clean(child.name) || slug,
        slug,
        state.picked === `n:${slug}`,
        () => selectNode(child, parent, current),
      );
    }
  }

  function renderResults(): void {
    clear(results);
    const keyword = state.query.toLowerCase();
    const matches = flatNodes()
      .filter(({ group, node, parent }) =>
        [
          node.name,
          node.slug,
          node.parent_slug,
          parent?.name,
          parent?.slug,
          group.label,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(keyword),
      )
      .slice(0, MAX_SEARCH_RESULTS);

    if (!matches.length) {
      appendEmpty(results, '没有匹配的节点');
      return;
    }

    for (const { group, node, parent } of matches) {
      const slug = clean(node.slug);
      const kind = parent
        ? `子节点 · ${group.label} / ${clean(parent.name) || clean(parent.slug)}`
        : `父节点 · ${group.label}`;
      appendItem(
        results,
        clean(node.name) || slug,
        kind,
        state.picked === `${parent ? 'n' : 'p'}:${slug}`,
        () => selectNode(node, parent, group),
      );
    }
  }

  function render(): void {
    if (state.phase !== 'ready') {
      columns.hidden = true;
      results.hidden = true;
      return;
    }

    if (!state.groups.length) {
      columns.hidden = true;
      results.hidden = true;
      setStatus('没有可用的节点数据');
      return;
    }

    const searching = state.query.length > 0;
    columns.hidden = searching;
    results.hidden = !searching;
    if (searching) renderResults();
    else renderColumns();
  }

  trigger.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (state.open) close();
    else open();
  });

  function handleEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape' || !state.open) return;
    event.preventDefault();
    event.stopPropagation();
    close();
    trigger.focus();
  }

  // 浮层 portal 到弹窗根节点后，按键事件不再经过 root，需要单独监听。
  root.addEventListener('keydown', handleEscape);
  popover.addEventListener('keydown', handleEscape);

  search.addEventListener('input', () => {
    state.query = search.value.trim();
    setStatus('');
    render();
  });

  search.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && state.query) {
      event.preventDefault();
      event.stopPropagation();
      state.query = '';
      search.value = '';
      setStatus('');
      render();
      return;
    }
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const keyword = state.query.toLowerCase();
    if (!keyword) return;
    const matches = flatNodes().filter(({ group, node, parent }) =>
      [node.name, node.slug, parent?.name, group.label]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(keyword),
    );
    if (matches.length === 1) {
      const match = matches[0];
      if (match) selectNode(match.node, match.parent, match.group);
    }
  });

  updateTrigger();
  render();

  return {
    element: root,
    setNodes(nodes: ApiNode[]): void {
      state.groups = groupNodes(nodes).filter((group) =>
        group.nodes.some((node) => clean(node.slug)),
      );
      state.phase = 'ready';
      if (!state.groups.some((group) => group.dimension === state.group)) {
        state.group = state.groups[0]?.dimension ?? null;
        state.parent = null;
      }
      if (
        state.parent &&
        !state.groups.some((group) =>
          group.nodes.some((node) => clean(node.slug) === state.parent),
        )
      ) {
        state.parent = null;
      }
      search.disabled = false;
      setStatus('');
      updateTrigger();
      render();
    },
    showLoading(message = '正在加载节点…'): void {
      state.phase = 'loading';
      columns.hidden = true;
      results.hidden = true;
      search.disabled = true;
      setStatus(message);
      updateTrigger();
    },
    showError(message: string, retry?: () => void): void {
      state.phase = 'error';
      columns.hidden = true;
      results.hidden = true;
      search.disabled = true;
      setStatus(message, retry ?? options.onRetry);
      updateTrigger();
    },
    destroy(): void {
      close();
      root.remove();
    },
  };
}

const PICKER_CSS = `
  [${PICKER_ATTR}] {
    position: relative;
    display: block;
    margin: 2px 0 8px;
    color: inherit;
    font-size: 12px;
    line-height: 1.5;
    text-align: left;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) [hidden] { display: none !important; }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-cascader__trigger {
    display: flex;
    align-items: center;
    gap: 8px;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    min-height: 40px;
    margin: 0;
    padding: 6px 10px;
    border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    border-radius: var(--radius-field, 8px);
    box-shadow: 0 1px color-mix(in srgb, currentColor 8%, transparent) inset;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 0.875rem;
    line-height: 1.4;
    text-align: left;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-cascader__trigger:hover,
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-cascader__trigger:focus-visible,
  [${PICKER_ATTR}][data-open="true"] .t2-node-cascader__trigger {
    border-color: color-mix(in srgb, currentColor 48%, transparent);
    background: color-mix(in srgb, currentColor 4%, transparent);
    outline: none;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-cascader__label {
    flex: 0 1 auto;
    max-width: 55%;
    overflow: hidden;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-cascader__hint {
    flex: 1 1 auto;
    min-width: 0;
    overflow: hidden;
    font-size: 12px;
    opacity: 0.55;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-cascader__chevron {
    flex: none;
    width: 7px;
    height: 7px;
    margin-left: auto;
    border-right: 1.5px solid currentColor;
    border-bottom: 1.5px solid currentColor;
    opacity: 0.55;
    transform: rotate(45deg) translateY(-2px);
    transition: transform 0.15s;
  }
  [${PICKER_ATTR}][data-open="true"] .t2-node-cascader__chevron {
    transform: rotate(-135deg) translateY(-2px);
  }
  .t2-node-cascader__popover[hidden] { display: none !important; }
  .t2-node-cascader__popover {
    position: absolute;
    z-index: 60;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    box-sizing: border-box;
    padding: 8px;
    border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
    border-radius: 10px;
    background: var(--color-base-100, Canvas);
    color: inherit;
    font-size: 12px;
    line-height: 1.5;
    text-align: left;
    box-shadow: 0 12px 32px color-mix(in srgb, #000 22%, transparent);
  }
  [${PICKER_ATTR}][data-flip="true"] .t2-node-cascader__popover {
    top: auto;
    bottom: calc(100% + 4px);
  }
  .t2-node-cascader__popover--portal {
    position: absolute;
    z-index: 80;
    right: auto;
    max-height: calc(100vh - 16px);
    margin: 0;
    overflow: auto;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__search {
    box-sizing: border-box;
    width: 100%;
    height: 28px;
    margin: 0 0 7px;
    padding: 0 8px;
    border: 1px solid color-mix(in srgb, currentColor 22%, transparent);
    border-radius: 7px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    outline: none;
    appearance: none;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__search:focus {
    border-color: color-mix(in srgb, currentColor 55%, transparent);
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__search:disabled {
    opacity: 0.55;
    cursor: progress;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__columns {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.15fr) minmax(0, 1.15fr);
    gap: 6px;
    min-height: 0;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__column {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__column-title {
    flex: none;
    padding: 0 4px 3px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.02em;
    opacity: 0.5;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__list,
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__results {
    display: flex;
    flex-direction: column;
    gap: 1px;
    max-height: 148px;
    overflow: auto;
    overscroll-behavior: contain;
    padding-right: 2px;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__results {
    max-height: 180px;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__row { display: block; }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__item {
    display: block;
    box-sizing: border-box;
    width: 100%;
    min-width: 0;
    margin: 0;
    padding: 4px 6px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: inherit;
    font: inherit;
    font-size: 12px;
    line-height: 1.35;
    text-align: left;
    cursor: pointer;
    overflow: hidden;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__item:hover,
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__item:focus-visible {
    background: color-mix(in srgb, currentColor 9%, transparent);
    outline: none;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__item[aria-pressed="true"] {
    background: color-mix(in srgb, currentColor 15%, transparent);
    font-weight: 600;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__item-label,
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__item-hint {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__item-hint {
    margin-top: 1px;
    font-size: 10px;
    font-weight: 400;
    opacity: 0.5;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__empty {
    display: block;
    padding: 5px 6px;
    font-size: 11px;
    opacity: 0.5;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__status {
    margin: 6px 0 0;
    font-size: 11px;
    line-height: 1.4;
    opacity: 0.68;
  }
  :is([${PICKER_ATTR}], [${PICKER_PORTAL_ATTR}]) .t2-node-picker__retry {
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
  }
`;

/** 样式只插一次；没有打开菜单弹窗的页面不会执行到这里。 */
export function ensurePickerStyles(doc: Document): void {
  if (doc.getElementById(PICKER_STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = PICKER_STYLE_ID;
  style.textContent = PICKER_CSS;
  (doc.head || doc.documentElement).appendChild(style);
}
