import { useEffect, useMemo, useRef, useState } from 'react';
import type { NodesStatus } from '../hooks/useNodes';
import { describeError } from '../lib/errors';
import type { Settings } from '../lib/storage';
import type { ApiNode, ViewPreference } from '../lib/types';
import {
  DEFAULT_DEFAULT_VIEW,
  POPUP_TAB_LIMIT,
  createDefaultViews,
} from '../lib/viewIds';
import { buildViewEntries, popupEntries, viewOptions, type ViewOption } from '../lib/views';
import { Icon } from './Icon';

interface NodeConfigProps {
  settings: Settings;
  nodes: ApiNode[];
  nodesStatus: NodesStatus;
  nodesError: unknown;
  onReloadNodes: () => void;
  onUpdateSettings: (patch: Partial<Settings>) => Promise<void> | void;
  onToast: (message: string) => void;
}

interface OptionGroup {
  label: string;
  options: ViewOption[];
}

/**
 * 节点配置：
 * - 每一行是一个视图（内置榜单 / 全站 / 父节点 / 子节点），拖动或方向键调整顺序；
 * - 两个开关分别控制弹窗 Tab 与仪表盘卡片，弹窗最多 6 个，仪表盘不限；
 * - 「添加节点」列出全站、父节点（含全部子节点）与具体子节点。
 */
export function NodeConfig({
  settings,
  nodes,
  nodesStatus,
  nodesError,
  onReloadNodes,
  onUpdateSettings,
  onToast,
}: NodeConfigProps) {
  const [draftViews, setDraftViews] = useState<ViewPreference[] | null>(null);
  const [draftDefault, setDraftDefault] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const addDialogRef = useRef<HTMLDialogElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const views = draftViews ?? settings.views;
  const currentDefault = draftDefault ?? settings.defaultView;

  // 父组件从 storage 收到新配置后，清掉本地草稿，继续以存储为准。
  useEffect(() => {
    setDraftViews(null);
    setDraftDefault(null);
  }, [settings.views]);

  // 添加节点用原生 dialog 展示，打开时聚焦筛选框。
  useEffect(() => {
    const dialog = addDialogRef.current;
    if (!dialog) return;
    if (addOpen && !dialog.open) dialog.showModal();
    if (!addOpen && dialog.open) dialog.close();
  }, [addOpen]);

  useEffect(() => {
    if (!addOpen) return;
    const timer = window.setTimeout(() => searchRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [addOpen]);

  const entries = useMemo(() => buildViewEntries(views, nodes), [views, nodes]);
  const popupOptions = useMemo(() => popupEntries(entries), [entries]);
  const popupCount = entries.filter((entry) => entry.popup).length;
  const dashboardCount = entries.filter((entry) => entry.dashboard).length;
  const defaultView = popupOptions.some((entry) => entry.id === settings.defaultView)
    ? settings.defaultView
    : (popupOptions[0]?.id ?? '');

  const optionGroups = useMemo<OptionGroup[]>(() => {
    const added = new Set(views.map((view) => view.id));
    const keyword = query.trim().toLowerCase();
    const groups = new Map<string, ViewOption[]>();

    for (const option of viewOptions(nodes)) {
      if (added.has(option.id)) continue;
      if (
        keyword &&
        !`${option.label} ${option.hint} ${option.id}`.toLowerCase().includes(keyword)
      ) {
        continue;
      }
      const label = option.group ?? '全站';
      const list = groups.get(label);
      if (list) list.push(option);
      else groups.set(label, [option]);
    }

    return [...groups.entries()].map(([label, options]) => ({ label, options }));
  }, [nodes, views, query]);

  const commit = (next: ViewPreference[], preferredDefault?: string) => {
    const popupIds = next.filter((view) => view.popup).map((view) => view.id);
    const wanted = preferredDefault ?? currentDefault;
    const defaultView = popupIds.includes(wanted) ? wanted : (popupIds[0] ?? '');

    setDraftViews(next);
    setDraftDefault(defaultView);

    const patch: Partial<Settings> = { views: next };
    if (defaultView !== settings.defaultView) patch.defaultView = defaultView;
    void onUpdateSettings(patch);
  };

  const toggleSurface = (id: string, surface: 'popup' | 'dashboard') => {
    const entry = views.find((view) => view.id === id);
    if (!entry) return;

    if (surface === 'popup' && !entry.popup && popupCount >= POPUP_TAB_LIMIT) {
      onToast(`弹窗最多 ${POPUP_TAB_LIMIT} 个 Tab，先关掉其它项的弹窗展示吧。`);
      return;
    }

    const next = views.map((view) =>
      view.id === id ? { ...view, [surface]: !view[surface] } : view,
    );
    commit(next);
  };

  const move = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= views.length || to >= views.length) {
      return;
    }
    const next = [...views];
    const [item] = next.splice(from, 1);
    if (!item) return;
    next.splice(to, 0, item);
    commit(next);
  };

  const remove = (id: string, label: string) => {
    commit(views.filter((view) => view.id !== id));
    onToast(`已移除「${label}」`);
  };

  const add = (option: ViewOption) => {
    if (views.some((view) => view.id === option.id)) return;
    const fitsPopup = popupCount < POPUP_TAB_LIMIT;
    commit([...views, { id: option.id, popup: fitsPopup, dashboard: true }]);
    onToast(
      fitsPopup
        ? `已添加「${option.label}」`
        : `已添加「${option.label}」到仪表盘；弹窗已满 ${POPUP_TAB_LIMIT} 个`,
    );
  };

  const reset = () => {
    const next = createDefaultViews();
    setDraftViews(next);
    setDraftDefault(DEFAULT_DEFAULT_VIEW);
    void onUpdateSettings({ views: next, defaultView: DEFAULT_DEFAULT_VIEW });
    onToast('已恢复默认节点配置');
  };

  const errorInfo = nodesStatus === 'error' ? describeError(nodesError) : null;

  return (
    <section className="settings-card node-config" aria-labelledby="settings-nodes">
      <header className="settings-card__head node-config__head">
        <span className="settings-card__icon" aria-hidden="true">
          <Icon name="settings" size={17} />
        </span>

        <div className="settings-card__heading">
          <h2 className="settings-card__title" id="settings-nodes">
            节点配置
          </h2>
          <p className="settings-card__desc">
            控制每个节点在弹窗与仪表盘中的显示位置；拖动排序后立即保存。
          </p>
          <p className="node-config__counts">
            <span>
              弹窗 <b>{popupCount}</b>/{POPUP_TAB_LIMIT}
            </span>
            <span aria-hidden="true">·</span>
            <span>
              仪表盘 <b>{dashboardCount}</b> 个
            </span>
          </p>
        </div>

        <div className="node-config__head-actions">
          <button type="button" className="btn btn--ghost btn--sm" onClick={reset}>
            恢复默认
          </button>
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={() => {
              setQuery('');
              setAddOpen(true);
            }}
            aria-haspopup="dialog"
            aria-expanded={addOpen}
            aria-controls="node-picker-dialog"
          >
            <Icon name="plus" size={13} />
            添加节点
          </button>
        </div>
      </header>

      <div className="settings-card__body node-config__body">
        <p className="node-config__tip">
          拖动左侧手柄调整顺序；聚焦手柄后可用 ↑ ↓ 键移动。开关分别控制弹窗 Tab 与仪表盘卡片。
        </p>

        <div className="node-config__list" role="list" aria-label="节点顺序与展示位置">
          {entries.map((entry, index) => {
            const hidden = !entry.popup && !entry.dashboard;
            const popupBlocked = !entry.popup && popupCount >= POPUP_TAB_LIMIT;
            return (
              <div
                key={entry.id}
                role="listitem"
                className={`node-config__row${hidden ? ' node-config__row--hidden' : ''}${
                  dragIndex === index ? ' is-dragging' : ''
                }${dropIndex === index && dragIndex !== index ? ' is-drop-target' : ''}`}
                onDragStart={(event) => {
                  setDragIndex(index);
                  setDropIndex(index);
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', String(index));
                }}
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  if (dropIndex !== index) setDropIndex(index);
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  const raw = dragIndex ?? Number(event.dataTransfer.getData('text/plain'));
                  if (Number.isFinite(raw)) move(raw, index);
                  setDragIndex(null);
                  setDropIndex(null);
                }}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDropIndex(null);
                }}
              >
                <button
                  type="button"
                  className="node-config__grip"
                  draggable
                  title="拖动排序；聚焦后按 ↑ ↓ 移动"
                  aria-label={`${entry.view.label}：拖动或按上下方向键调整顺序`}
                  onKeyDown={(event) => {
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      move(index, index - 1);
                    } else if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      move(index, index + 1);
                    } else if (event.key === 'Home') {
                      event.preventDefault();
                      move(index, 0);
                    } else if (event.key === 'End') {
                      event.preventDefault();
                      move(index, entries.length - 1);
                    }
                  }}
                >
                  <Icon name="grip" size={15} />
                </button>

                <span
                  className={`node-config__icon node-config__icon--${entry.view.kind}`}
                  aria-hidden="true"
                >
                  {entry.view.icon}
                </span>

                <span className="node-config__info">
                  <span className="node-config__name">
                    <span className="node-config__label" title={entry.view.hint}>
                      {entry.view.label}
                    </span>
                    <span
                      className={`node-config__badge node-config__badge--${entry.view.kind}`}
                    >
                      {entry.view.sourceLabel}
                    </span>
                    {!entry.view.available && nodesStatus !== 'loading' && (
                      <span className="node-config__warn">未找到</span>
                    )}
                    {hidden && <span className="node-config__muted">已隐藏</span>}
                  </span>
                  <span className="node-config__hint">{entry.view.hint}</span>
                </span>

                <span className="node-config__surfaces">
                  <button
                    type="button"
                    role="switch"
                    aria-checked={entry.popup}
                    aria-label={`${entry.view.label}：在弹窗展示`}
                    className={`node-config__switch${entry.popup ? ' is-on' : ''}`}
                    title={
                      popupBlocked
                        ? `弹窗最多 ${POPUP_TAB_LIMIT} 个 Tab，先关闭其它项的弹窗展示`
                        : '在弹窗中展示'
                    }
                    disabled={popupBlocked}
                    draggable={false}
                    onClick={() => toggleSurface(entry.id, 'popup')}
                  >
                    <span>弹窗</span>
                    <span className="node-config__track" aria-hidden="true">
                      <span className="node-config__thumb" />
                    </span>
                  </button>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={entry.dashboard}
                    aria-label={`${entry.view.label}：在仪表盘展示`}
                    className={`node-config__switch${entry.dashboard ? ' is-on' : ''}`}
                    title="在仪表盘中展示"
                    draggable={false}
                    onClick={() => toggleSurface(entry.id, 'dashboard')}
                  >
                    <span>仪表盘</span>
                    <span className="node-config__track" aria-hidden="true">
                      <span className="node-config__thumb" />
                    </span>
                  </button>
                </span>

                <span className="node-config__order">
                  <button
                    type="button"
                    className="node-config__order-btn"
                    aria-label={`上移${entry.view.label}`}
                    title="上移"
                    disabled={index === 0}
                    draggable={false}
                    onClick={() => move(index, index - 1)}
                  >
                    <Icon name="up" size={13} />
                  </button>
                  <button
                    type="button"
                    className="node-config__order-btn"
                    aria-label={`下移${entry.view.label}`}
                    title="下移"
                    disabled={index === entries.length - 1}
                    draggable={false}
                    onClick={() => move(index, index + 1)}
                  >
                    <Icon name="down" size={13} />
                  </button>
                </span>

                {entry.view.kind === 'section' ? (
                  <button
                    type="button"
                    className="node-config__remove"
                    aria-label={`移除${entry.view.label}`}
                    title="从配置中移除"
                    draggable={false}
                    onClick={() => remove(entry.id, entry.view.label)}
                  >
                    <Icon name="trash" size={14} />
                  </button>
                ) : (
                  <span className="node-config__remove-spacer" aria-hidden="true" />
                )}
              </div>
            );
          })}
        </div>

        <div className="node-config__default">
          <div className="node-config__default-text">
            <label className="node-config__default-label" htmlFor="node-config-default-view">
              弹窗默认进入
            </label>
            <p className="node-config__default-hint">
              打开弹窗时先显示哪个 Tab；在弹窗里切换只影响当次浏览，不会改动这里。
            </p>
          </div>
          <select
            id="node-config-default-view"
            className="select"
            value={defaultView}
            disabled={popupOptions.length === 0}
            onChange={(event) => {
              const value = event.target.value;
              if (value) void onUpdateSettings({ defaultView: value });
            }}
          >
            {popupOptions.length === 0 ? (
              <option value="">没有弹窗 Tab</option>
            ) : (
              popupOptions.map((entry) => (
                <option key={entry.id} value={entry.id}>
                  {entry.view.label}
                </option>
              ))
            )}
          </select>
        </div>
      </div>

      <dialog
        ref={addDialogRef}
        id="node-picker-dialog"
        className="t2-dialog node-picker-dialog"
        aria-labelledby="node-picker-title"
        onCancel={(event) => {
          event.preventDefault();
          setAddOpen(false);
        }}
        onClick={(event) => {
          if (event.target === addDialogRef.current) setAddOpen(false);
        }}
        onClose={() => {
          if (addOpen) setAddOpen(false);
        }}
      >
        <header className="dialog__head">
          <div>
            <h2 className="dialog__title" id="node-picker-title">
              添加节点
            </h2>
            <p className="dialog__desc">选择全站、父节点或具体子节点，添加后立即保存。</p>
          </div>
          <button
            type="button"
            className="btn btn--icon"
            onClick={() => setAddOpen(false)}
            aria-label="关闭添加节点"
          >
            <Icon name="close" size={16} />
          </button>
        </header>

        <div className="dialog__body node-picker-dialog__body">
          <div className="node-picker__top">
            <label className="node-picker__search">
              <Icon name="search" size={14} className="node-picker__search-icon" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="按节点名称 / slug 筛选"
                aria-label="筛选节点"
              />
            </label>
            <span className="node-picker__count">
              {optionGroups.reduce((sum, group) => sum + group.options.length, 0)} 个可选
            </span>
          </div>

          {nodesStatus === 'loading' && nodes.length === 0 && (
            <div className="node-picker__loading">
              <span className="skeleton skeleton--line" />
              <span className="skeleton skeleton--line skeleton--short" />
              <span className="node-picker__loading-text">正在读取节点…</span>
            </div>
          )}

          {errorInfo && (
            <div className="banner banner--error node-picker__banner" role="alert">
              <Icon name="alert" size={16} className="banner__icon" />
              <div className="banner__body">
                <strong className="banner__title">{errorInfo.title}</strong>
                {errorInfo.detail && <span>{errorInfo.detail}</span>}
                <div className="banner__actions">
                  <button type="button" className="btn btn--sm" onClick={onReloadNodes}>
                    重试
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="node-picker__list node-picker-dialog__list">
            {optionGroups.map((group) => (
              <div className="node-picker__group" key={group.label}>
                <p className="node-picker__group-label">{group.label}</p>
                {group.options.map((option) => (
                  <button
                    type="button"
                    key={option.id}
                    className="node-option"
                    style={option.depth > 0 ? { paddingLeft: 22 } : undefined}
                    onClick={() => add(option)}
                  >
                    <span
                      className={`node-option__mark${
                        option.depth > 0 ? ' node-option__mark--child' : ''
                      }`}
                      aria-hidden="true"
                    >
                      {option.depth > 0 ? '·' : option.id === 'section:all' ? '🌐' : '🗂️'}
                    </span>
                    <span className="node-option__body">
                      <span className="node-option__name">{option.label}</span>
                      <span className="node-option__hint">{option.hint}</span>
                    </span>
                    <span className="node-option__add">
                      <Icon name="plus" size={12} />
                      添加
                    </span>
                  </button>
                ))}
              </div>
            ))}

            {nodesStatus !== 'loading' && optionGroups.length === 0 && (
              <p className="node-picker__empty">
                {query.trim()
                  ? '没有匹配的节点，换个关键词试试。'
                  : '所有可用节点都已在配置里。'}
              </p>
            )}
          </div>

          <p className="node-picker__note">
            父节点会读取它下面的全部子节点；子节点只读取该节点。全站读取所有节点的最新帖子流。
          </p>
        </div>

        <footer className="dialog__foot">
          <span className="dialog__note">添加后立即保存；弹窗最多 {POPUP_TAB_LIMIT} 个 Tab。</span>
          <button type="button" className="btn btn--primary" onClick={() => setAddOpen(false)}>
            完成
          </button>
        </footer>
      </dialog>
    </section>
  );
}
