import { describe, expect, test } from 'bun:test';
import { parseHTML } from 'linkedom';
import {
  applyMenuTarget,
  createNodePicker,
  ensurePickerStyles,
  findMenuDialogs,
  findMenuFields,
  MENU_NAME_LIMIT,
  menuTargetFor,
  mountNodePicker,
  PICKER_ATTR,
  PICKER_STYLE_ID,
  removeNodePickers,
  type MenuTarget,
} from './custom-menu-node-picker';
import type { ApiNode } from './types';

const MENU_DIALOG = `
<dialog open class="modal modal-open">
  <div class="modal-box">
    <h3>自定义菜单</h3>
    <div class="space-y-2">
      <div><span>金币排行榜</span><span>/coins/ranking</span></div>
    </div>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">菜单名称</legend>
      <input class="input" maxlength="20" type="text" value="">
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend">菜单链接（可留空：作为分组仅展开/收起）</legend>
      <input class="input" type="text" value="">
    </fieldset>
    <fieldset class="fieldset">
      <legend class="fieldset-legend text-xs">菜单图标（可选）</legend>
      <input class="input input-sm" type="text" value="">
    </fieldset>
    <div class="modal-action">
      <button class="btn">取消</button>
      <button class="btn btn-primary" disabled>添加菜单</button>
    </div>
  </div>
  <form method="dialog" class="modal-backdrop"><button>close</button></form>
</dialog>`;

const NODES: ApiNode[] = [
  {
    id: '1',
    slug: 'backend',
    name: '后端',
    dimension: 'work',
    children: [
      { id: '2', slug: 'db', name: '数据库', parent_slug: 'backend', dimension: 'work' },
      { id: '3', slug: 'api', name: '接口', parent_slug: 'backend', dimension: 'work' },
    ],
  },
  { id: '4', slug: 'frontend', name: '前端', dimension: 'work', children: [] },
  {
    id: '5',
    slug: 'life',
    name: '生活',
    dimension: 'life',
    children: [{ id: '6', slug: 'food', name: '美食', parent_slug: 'life', dimension: 'life' }],
  },
];

function makeDoc(html: string): Document {
  const { document } = parseHTML(`<!doctype html><html><head></head><body>${html}</body></html>`);
  return document as unknown as Document;
}

function menuDoc(html = MENU_DIALOG): Document {
  return makeDoc(html);
}

function viewOf(doc: Document): NonNullable<Document['defaultView']> {
  const view = doc.defaultView;
  if (!view) throw new Error('missing defaultView');
  return view;
}

function click(doc: Document, element: Element | null | undefined): void {
  if (!element) throw new Error('missing click target');
  const view = viewOf(doc);
  element.dispatchEvent(new view.Event('click', { bubbles: true, cancelable: true }));
}

function buttonsIn(root: ParentNode): HTMLButtonElement[] {
  return Array.from(root.querySelectorAll('button')) as unknown as HTMLButtonElement[];
}

function buttonWith(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return buttonsIn(root).find((button) => (button.textContent ?? '').includes(text));
}

function type(doc: Document, input: HTMLInputElement, value: string): void {
  const view = viewOf(doc);
  input.value = value;
  input.dispatchEvent(new view.Event('input', { bubbles: true }));
}

describe('menuTargetFor', () => {
  test('builds links for parent and child nodes', () => {
    const parent = NODES[0]!;
    const child = parent.children![0]!;

    expect(menuTargetFor(parent)).toMatchObject({
      name: '后端',
      href: '/node/backend',
      kind: 'parent',
    });
    expect(menuTargetFor(child, parent)).toMatchObject({
      name: '数据库',
      href: '/node/backend/db',
      kind: 'child',
    });
  });

  test('uses slugs, not node ids, for relative menu links', () => {
    // 线上 `/v1/nodes` 的真实形态：顶层节点只有 dimensions，子节点带 parent_slug。
    const product: ApiNode = {
      id: '10000000-0000-0000-0000-000000000003',
      name: '产品',
      slug: 'product',
      parent_id: null,
      parent_slug: null,
      dimensions: 'work',
      children: [
        {
          id: '4d6f9c99-86dc-495a-84d6-55c32cfea0de',
          name: '产品经理',
          slug: 'product-manager',
          parent_id: '10000000-0000-0000-0000-000000000003',
          parent_slug: 'product',
          dimensions: 'work',
        },
      ],
    };

    expect(menuTargetFor(product)?.href).toBe('/node/product');
    expect(menuTargetFor(product.children![0]!, product)?.href).toBe(
      '/node/product/product-manager',
    );
    expect(menuTargetFor(product.children![0]!)?.href).toBe(
      '/node/product/product-manager',
    );
    // 路径里不应出现 UUID。
    expect(menuTargetFor(product.children![0]!)?.href).not.toContain('4d6f9c99');
  });

  test('falls back to parent_slug when the parent object is not passed', () => {
    const target = menuTargetFor(NODES[0]!.children![0]!);
    expect(target?.href).toBe('/node/backend/db');
    expect(target?.kind).toBe('child');
  });

  test('clips names to the menu input limit without splitting emoji', () => {
    const long = '一二三四五六七八九十一二三四五六七八九十二';
    const target = menuTargetFor({ id: '1', slug: 'long', name: long });
    expect(Array.from(target!.name)).toHaveLength(MENU_NAME_LIMIT);
    expect(target!.name).toBe('一二三四五六七八九十一二三四五六七八九十');

    const emoji = menuTargetFor({ id: '2', slug: 'emoji', name: '😀'.repeat(25) });
    // maxlength 按 UTF-16 码元计数，20 个码元 = 10 个 emoji。
    expect(emoji!.name.length).toBeLessThanOrEqual(MENU_NAME_LIMIT);
    expect(Array.from(emoji!.name)).toHaveLength(10);
    expect(emoji!.name).toBe('😀'.repeat(10));
  });

  test('falls back to the slug for unnamed nodes and rejects missing slugs', () => {
    expect(menuTargetFor({ id: '1', slug: 'anonymous', name: '  ' })?.name).toBe('anonymous');
    expect(menuTargetFor({ id: '2', slug: '  ', name: '空' })).toBeNull();
  });
});

describe('findMenuFields / findMenuDialogs', () => {
  test('finds the name and link inputs but not the icon input', () => {
    const doc = menuDoc();
    const dialog = doc.querySelector('dialog');
    if (!dialog) throw new Error('missing dialog');
    const fields = findMenuFields(dialog);

    expect(fields?.name.getAttribute('maxlength')).toBe('20');
    expect(fields?.href).not.toBe(dialog.querySelectorAll('input')[2]);
    expect(dialog.querySelectorAll('input')).toHaveLength(3);
  });

  test('ignores dialogs without both menu fields', () => {
    const doc = makeDoc(`
      <dialog open>
        <fieldset><legend>搜索</legend><input></fieldset>
      </dialog>
      ${MENU_DIALOG}
    `);
    expect(findMenuDialogs(doc)).toHaveLength(1);
  });

  test('stops recognizing the dialog once either input is gone', () => {
    const doc = menuDoc();
    const dialog = doc.querySelector('dialog');
    if (!dialog) throw new Error('missing dialog');
    const fieldsets = dialog.querySelectorAll('fieldset');
    expect(findMenuFields(dialog)).not.toBeNull();

    // 去掉「菜单链接」fieldset 后，弹窗不再算自定义菜单弹窗。
    fieldsets[1]?.remove();
    expect(findMenuFields(dialog)).toBeNull();
    expect(findMenuDialogs(doc)).toHaveLength(0);
  });

  test('keeps only the innermost dialog when wrappers also match', () => {
    const doc = makeDoc(`
      <div class="modal" role="dialog">
        ${MENU_DIALOG}
      </div>
    `);
    const dialogs = findMenuDialogs(doc);
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0]?.tagName).toBe('DIALOG');
  });

  test('applyMenuTarget respects a shorter maxlength on the name input', () => {
    const doc = menuDoc();
    const dialog = doc.querySelector('dialog');
    if (!dialog) throw new Error('missing dialog');
    const fields = findMenuFields(dialog);
    if (!fields) throw new Error('missing fields');
    fields.name.setAttribute('maxlength', '4');

    const target = menuTargetFor({ id: '1', slug: 'long', name: '一二三四五六' })!;
    expect(applyMenuTarget(dialog, target)).toBe(true);
    expect(fields.name.value).toBe('一二三四');
  });

  test('applyMenuTarget fills both fields and emits React-compatible events', () => {
    const doc = menuDoc();
    const dialog = doc.querySelector('dialog');
    if (!dialog) throw new Error('missing dialog');
    const fields = findMenuFields(dialog);
    if (!fields) throw new Error('missing fields');

    const seen: string[] = [];
    fields.name.addEventListener('input', () => seen.push('name:input'));
    fields.name.addEventListener('change', () => seen.push('name:change'));
    fields.href.addEventListener('input', () => seen.push('href:input'));

    const target = menuTargetFor(NODES[0]!.children![0]!, NODES[0]!)!;
    expect(applyMenuTarget(dialog, target)).toBe(true);
    expect(fields.name.value).toBe('数据库');
    expect(fields.href.value).toBe('/node/backend/db');
    expect(seen).toEqual(['name:input', 'name:change', 'href:input']);
  });
});

describe('createNodePicker', () => {
  function setup(): {
    doc: Document;
    picker: ReturnType<typeof createNodePicker>;
    picks: MenuTarget[];
  } {
    const doc = menuDoc();
    const picks: MenuTarget[] = [];
    const picker = createNodePicker(doc, {
      onPick: (target) => {
        picks.push(target);
        return true;
      },
    });
    picker.setNodes(NODES);
    doc.body.appendChild(picker.element);
    return { doc, picker, picks };
  }

  function triggerOf(picker: ReturnType<typeof createNodePicker>): HTMLButtonElement {
    const trigger = picker.element.querySelector('.t2-node-cascader__trigger');
    if (!trigger) throw new Error('missing trigger');
    return trigger as HTMLButtonElement;
  }

  function popoverOf(picker: ReturnType<typeof createNodePicker>): HTMLElement {
    const popover = picker.element.querySelector('.t2-node-cascader__popover');
    if (!popover) throw new Error('missing popover');
    return popover as HTMLElement;
  }

  function labelOf(picker: ReturnType<typeof createNodePicker>): string {
    return picker.element.querySelector('.t2-node-cascader__label')?.textContent ?? '';
  }

  function hintOf(picker: ReturnType<typeof createNodePicker>): string {
    return picker.element.querySelector('.t2-node-cascader__hint')?.textContent ?? '';
  }

  function openPicker(doc: Document, picker: ReturnType<typeof createNodePicker>): void {
    if (popoverOf(picker).hidden) click(doc, triggerOf(picker));
  }

  function buttonInColumn(
    picker: ReturnType<typeof createNodePicker>,
    column: 'group' | 'parent' | 'child',
    text: string,
  ): HTMLButtonElement | undefined {
    const list = picker.element.querySelector(`[data-t2-node-col="${column}"]`);
    if (!list) return undefined;
    return buttonsIn(list).find((button) => (button.textContent ?? '').includes(text));
  }

  test('collapses to one compact trigger until opened', () => {
    const { doc, picker } = setup();

    expect(popoverOf(picker).hidden).toBe(true);
    expect(labelOf(picker)).toBe('从节点选择');
    expect(hintOf(picker)).toBe('自动填入名称和链接');
    expect(picker.element.getAttribute('data-open')).toBe('false');

    openPicker(doc, picker);
    expect(popoverOf(picker).hidden).toBe(false);
    expect(picker.element.getAttribute('data-open')).toBe('true');
    expect(triggerOf(picker).getAttribute('aria-expanded')).toBe('true');
    expect(buttonWith(popoverOf(picker), '工作')).toBeDefined();
    expect(buttonWith(popoverOf(picker), '生活')).toBeDefined();
    expect(buttonWith(popoverOf(picker), '后端')).toBeDefined();
    expect(buttonWith(popoverOf(picker), '前端')).toBeDefined();
    expect(popoverOf(picker).textContent).toContain('先选择父节点');
  });

  test('expands a parent node and can pick the whole parent', () => {
    const { doc, picker, picks } = setup();
    openPicker(doc, picker);

    click(doc, buttonInColumn(picker, 'parent', '后端'));
    expect(popoverOf(picker).hidden).toBe(false);
    expect(buttonInColumn(picker, 'child', '使用父节点「后端」')).toBeDefined();

    click(doc, buttonInColumn(picker, 'child', '使用父节点「后端」'));

    expect(picks[0]).toMatchObject({ name: '后端', href: '/node/backend', kind: 'parent' });
    expect(labelOf(picker)).toBe('从节点选择');
    expect(hintOf(picker)).toBe('自动填入名称和链接');
    expect(popoverOf(picker).hidden).toBe(true);

    // 再次打开时回到「未选择父节点」的初始态。
    openPicker(doc, picker);
    expect(buttonInColumn(picker, 'child', '先选择父节点')).toBeUndefined();
    expect(popoverOf(picker).textContent).toContain('先选择父节点');
  });

  test('fills a child node with the slug-only relative path', () => {
    const { doc, picker, picks } = setup();
    openPicker(doc, picker);
    click(doc, buttonInColumn(picker, 'parent', '后端'));
    expect(popoverOf(picker).hidden).toBe(false);
    click(doc, buttonInColumn(picker, 'child', '数据库'));

    expect(picks.at(-1)).toMatchObject({
      name: '数据库',
      href: '/node/backend/db',
      kind: 'child',
    });
    expect(labelOf(picker)).toBe('从节点选择');
    expect(hintOf(picker)).toBe('自动填入名称和链接');
    expect(popoverOf(picker).hidden).toBe(true);
  });

  test('switches groups and shows the group parents', () => {
    const { doc, picker, picks } = setup();
    openPicker(doc, picker);

    click(doc, buttonInColumn(picker, 'group', '生活'));
    expect(popoverOf(picker).textContent).toContain('先选择父节点');
    expect(buttonInColumn(picker, 'parent', '后端')).toBeUndefined();
    expect(buttonInColumn(picker, 'parent', '生活')).toBeDefined();

    click(doc, buttonInColumn(picker, 'parent', '生活'));
    expect(popoverOf(picker).textContent).toContain('使用父节点「生活」');
    click(doc, buttonInColumn(picker, 'child', '使用父节点「生活」'));
    expect(picks.at(-1)).toMatchObject({ href: '/node/life' });
    expect(labelOf(picker)).toBe('从节点选择');
  });

  test('searches across groups and fills the chosen node', () => {
    const { doc, picker, picks } = setup();
    openPicker(doc, picker);
    const search = popoverOf(picker).querySelector('input');
    if (!search) throw new Error('missing search');

    type(doc, search as HTMLInputElement, '美食');
    expect(popoverOf(picker).textContent).toContain('子节点 · 生活 / 生活');
    click(doc, buttonWith(popoverOf(picker), '美食'));

    expect(picks.at(-1)).toMatchObject({ name: '美食', href: '/node/life/food' });
    expect(labelOf(picker)).toBe('从节点选择');
    expect(hintOf(picker)).toBe('自动填入名称和链接');
    expect((search as HTMLInputElement).value).toBe('');
    expect(popoverOf(picker).hidden).toBe(true);
  });

  test('reports empty and no-match states inside the popover', () => {
    const { doc, picker } = setup();
    openPicker(doc, picker);
    const search = popoverOf(picker).querySelector('input');
    if (!search) throw new Error('missing search');

    type(doc, search as HTMLInputElement, '不存在的节点');
    expect(popoverOf(picker).textContent).toContain('没有匹配的节点');

    picker.setNodes([]);
    openPicker(doc, picker);
    expect(popoverOf(picker).textContent).toContain('没有可用的节点数据');
    expect(labelOf(picker)).toBe('暂无节点数据');
  });

  test('keeps the popover open when onPick cannot find the form fields', () => {
    const doc = menuDoc();
    const picker = createNodePicker(doc, { onPick: () => false });
    picker.setNodes(NODES);
    doc.body.appendChild(picker.element);
    openPicker(doc, picker);

    click(doc, buttonInColumn(picker, 'parent', '后端'));
    click(doc, buttonInColumn(picker, 'child', '使用父节点「后端」'));
    expect(popoverOf(picker).hidden).toBe(false);
    expect(popoverOf(picker).textContent).toContain('没有找到可填写的菜单输入框');
    expect(labelOf(picker)).toBe('从节点选择');
  });

  test('shows loading and error states with a retry button', () => {
    const doc = menuDoc();
    let retried = 0;
    const picker = createNodePicker(doc, {
      onPick: () => true,
      onRetry: () => {
        retried += 1;
      },
    });
    doc.body.appendChild(picker.element);

    picker.showLoading('正在加载节点…');
    expect(labelOf(picker)).toBe('正在加载节点…');
    openPicker(doc, picker);
    expect(popoverOf(picker).textContent).toContain('正在加载节点…');
    expect((popoverOf(picker).querySelector('input') as HTMLInputElement).disabled).toBe(true);

    picker.showError('节点加载失败');
    expect(labelOf(picker)).toBe('节点加载失败');
    openPicker(doc, picker);
    const retry = buttonWith(popoverOf(picker), '重试');
    click(doc, retry);
    expect(retried).toBe(1);
  });

  test('closes on outside pointerdown and Escape', () => {
    const { doc, picker } = setup();
    openPicker(doc, picker);
    expect(popoverOf(picker).hidden).toBe(false);

    const view = viewOf(doc);
    const pointerdown = new view.Event('pointerdown', {
      bubbles: true,
      cancelable: true,
    });
    doc.body.dispatchEvent(pointerdown);
    expect(popoverOf(picker).hidden).toBe(true);

    openPicker(doc, picker);
    const event = new view.Event('keydown', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'key', { value: 'Escape' });
    picker.element.dispatchEvent(event);
    expect(popoverOf(picker).hidden).toBe(true);
  });
});

describe('portaled cascader inside the menu dialog', () => {
  test('moves the popover to the dialog and keeps node clicks working', () => {
    const doc = menuDoc();
    const dialog = doc.querySelector('dialog');
    if (!dialog) throw new Error('missing dialog');
    const picks: MenuTarget[] = [];
    const picker = createNodePicker(doc, {
      onPick: (target) => {
        picks.push(target);
        return true;
      },
    });
    picker.setNodes(NODES);
    expect(mountNodePicker(dialog, picker)).toBe(true);

    const trigger = picker.element.querySelector(
      '.t2-node-cascader__trigger',
    ) as HTMLButtonElement | null;
    if (!trigger) throw new Error('missing trigger');
    click(doc, trigger);

    const popover = dialog.querySelector('.t2-node-cascader__popover');
    if (!popover) throw new Error('missing portaled popover');
    expect(popover.parentElement).toBe(dialog);
    expect(popover.getAttribute('data-t2-node-picker-portal')).toBe('true');
    expect(popover.hasAttribute('hidden')).toBe(false);

    const parentButton = buttonWith(popover, '后端');
    if (!parentButton) throw new Error('missing parent button');
    const view = viewOf(doc);
    // 浮层已经不在 root 里，pointerdown 仍不能把它当成「外部点击」。
    parentButton.dispatchEvent(new view.Event('pointerdown', { bubbles: true }));
    expect(popover.hasAttribute('hidden')).toBe(false);
    click(doc, parentButton);
    expect(popover.hasAttribute('hidden')).toBe(false);

    const useParent = buttonWith(popover, '使用父节点「后端」');
    if (!useParent) throw new Error('missing use-parent button');
    click(doc, useParent);

    expect(picks[0]).toMatchObject({ href: '/node/backend' });
    expect(popover.hasAttribute('hidden')).toBe(true);
    expect(popover.parentElement).toBe(picker.element);
    expect(popover.hasAttribute('data-t2-node-picker-portal')).toBe(false);
  });

  test('outside pointerdown still closes a portaled popover', () => {
    const doc = menuDoc();
    const dialog = doc.querySelector('dialog');
    if (!dialog) throw new Error('missing dialog');
    const picker = createNodePicker(doc, { onPick: () => true });
    picker.setNodes(NODES);
    mountNodePicker(dialog, picker);

    const trigger = picker.element.querySelector(
      '.t2-node-cascader__trigger',
    ) as HTMLButtonElement | null;
    if (!trigger) throw new Error('missing trigger');
    click(doc, trigger);
    const popover = dialog.querySelector('.t2-node-cascader__popover');
    if (!popover) throw new Error('missing portaled popover');

    const view = viewOf(doc);
    doc.body.dispatchEvent(new view.Event('pointerdown', { bubbles: true }));
    expect(popover.hasAttribute('hidden')).toBe(true);
    expect(popover.parentElement).toBe(picker.element);
  });
});

describe('mountNodePicker', () => {
  test('inserts before the name fieldset once and removes cleanly', () => {
    const doc = menuDoc();
    const dialog = doc.querySelector('dialog');
    if (!dialog) throw new Error('missing dialog');
    const picker = createNodePicker(doc, { onPick: () => true });
    picker.setNodes(NODES);

    expect(mountNodePicker(dialog, picker)).toBe(true);
    expect(dialog.querySelector(`[${PICKER_ATTR}]`)).not.toBeNull();
    expect(dialog.querySelector('fieldset legend')?.textContent).toContain('菜单名称');

    const panel = dialog.querySelector(`[${PICKER_ATTR}]`);
    const fields = findMenuFields(dialog);
    expect(panel?.nextElementSibling).toBe(fields?.name.closest('fieldset'));

    const second = createNodePicker(doc, { onPick: () => true });
    expect(mountNodePicker(dialog, second)).toBe(false);
    expect(dialog.querySelectorAll(`[${PICKER_ATTR}]`)).toHaveLength(1);

    expect(removeNodePickers(doc)).toBe(1);
    expect(dialog.querySelector(`[${PICKER_ATTR}]`)).toBeNull();
  });

  test('installs the stylesheet only once', () => {
    const doc = menuDoc();
    ensurePickerStyles(doc);
    ensurePickerStyles(doc);
    expect(doc.querySelectorAll(`#${PICKER_STYLE_ID}`)).toHaveLength(1);
  });
});
