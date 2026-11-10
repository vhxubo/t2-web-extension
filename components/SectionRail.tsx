import { useEffect, useMemo, useState } from 'react';
import { groupNodes } from '../lib/nodes';
import { sectionKey } from '../lib/section';
import type { ApiNode, Section } from '../lib/types';
import { Icon } from './Icon';

interface SectionRailProps {
  nodes: ApiNode[];
  value: Section;
  onChange: (section: Section) => void;
  loading: boolean;
  failed: boolean;
  onRetry: () => void;
}

function matches(text: string | undefined, query: string): boolean {
  return (text ?? '').toLowerCase().includes(query);
}

export function SectionRail({ nodes, value, onChange, loading, failed, onRetry }: SectionRailProps) {
  const [search, setSearch] = useState('');
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  const groups = useMemo(() => groupNodes(nodes), [nodes]);
  const query = search.trim().toLowerCase();

  const visibleGroups = useMemo(() => {
    if (!query) return groups;
    return groups
      .map((group) => {
        const filtered = group.nodes
          .map((node): ApiNode | null => {
            const self = matches(node.name, query) || matches(node.slug, query);
            const children = (node.children ?? []).filter(
              (child) => matches(child.name, query) || matches(child.slug, query),
            );
            if (!self && children.length === 0) return null;
            return { ...node, children: self ? (node.children ?? []) : children };
          })
          .filter((node): node is ApiNode => node !== null);
        return { ...group, nodes: filtered };
      })
      .filter((group) => group.nodes.length > 0);
  }, [groups, query]);

  // 当前选中的子分区默认展开它的父分区。
  useEffect(() => {
    if (value.kind !== 'node') return;
    const parent = nodes.find((node) =>
      (node.children ?? []).some((child) => child.slug === value.slug),
    );
    if (!parent) return;
    setExpanded((current) => {
      if (current.has(parent.slug)) return current;
      const next = new Set(current);
      next.add(parent.slug);
      return next;
    });
  }, [value, nodes]);

  const toggle = (slug: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const current = sectionKey(value);
  const total = nodes.length;

  return (
    <nav className="rail" aria-label="分区">
      <div className="rail__head">
        <span className="rail__title">分区</span>
        {total > 0 && <span className="rail__total t2-mono">{total}</span>}
      </div>

      {total > 0 && (
        <div className="rail__search">
          <Icon name="search" size={14} className="rail__search-icon" />
          <input
            className="input input--sm rail__search-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="搜索分区"
            aria-label="搜索分区"
          />
        </div>
      )}

      <div className="rail__scroll">
        <button
          type="button"
          className={`rail__item rail__item--all${current === 'all' ? ' rail__item--active' : ''}`}
          aria-current={current === 'all' ? 'true' : undefined}
          onClick={() => onChange({ kind: 'all' })}
        >
          <span className="rail__item-name">全站</span>
          <span className="rail__item-mark" aria-hidden="true" />
        </button>

        {loading && (
          <div className="rail__skeletons" aria-hidden="true">
            {Array.from({ length: 7 }).map((_, index) => (
              <span key={index} className="skeleton skeleton--line rail__skeleton" />
            ))}
          </div>
        )}

        {failed && !loading && (
          <div className="rail__error">
            <span>分区没加载出来</span>
            <button type="button" className="btn btn--sm" onClick={onRetry}>
              重试
            </button>
          </div>
        )}

        {visibleGroups.map((group) => (
          <section className="rail__group" key={group.dimension}>
            <h3 className="rail__label">{group.label}</h3>
            {group.nodes.map((node) => {
              const children = node.children ?? [];
              const open = query ? true : expanded.has(node.slug);
              const parentActive = current === `p:${node.slug}`;
              return (
                <div className="rail__node" key={node.slug}>
                  <div className="rail__row">
                    <button
                      type="button"
                      className={`rail__item${parentActive ? ' rail__item--active' : ''}`}
                      aria-current={parentActive ? 'true' : undefined}
                      onClick={() => onChange({ kind: 'parent', slug: node.slug })}
                      title={`${node.name} · ${node.post_count ?? 0} 篇帖子`}
                    >
                      <span className="rail__item-name">{node.name}</span>
                      {typeof node.post_count === 'number' && (
                        <span className="rail__item-count t2-mono">{node.post_count}</span>
                      )}
                    </button>
                    {children.length > 0 && (
                      <button
                        type="button"
                        className="rail__toggle"
                        aria-expanded={open}
                        aria-label={`${open ? '收起' : '展开'} ${node.name} 的子分区`}
                        onClick={() => toggle(node.slug)}
                      >
                        <Icon
                          name="chevron"
                          size={13}
                          className={`rail__chevron${open ? ' rail__chevron--open' : ''}`}
                        />
                      </button>
                    )}
                  </div>

                  {open && children.length > 0 && (
                    <ul className="rail__children">
                      {children.map((child) => {
                        const childActive = current === `n:${child.slug}`;
                        return (
                          <li key={child.slug}>
                            <button
                              type="button"
                              className={`rail__item rail__item--child${childActive ? ' rail__item--active' : ''}`}
                              aria-current={childActive ? 'true' : undefined}
                              onClick={() => onChange({ kind: 'node', slug: child.slug })}
                              title={
                                child.require_login
                                  ? `${child.name} · 查看需要登录`
                                  : `${child.name} · ${child.post_count ?? 0} 篇帖子`
                              }
                            >
                              <span className="rail__item-name">{child.name}</span>
                              {child.require_login && <span className="rail__lock">需登录</span>}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </section>
        ))}

        {!loading && !failed && total === 0 && (
          <p className="rail__empty">分区列表暂时是空的。</p>
        )}
        {!loading && !failed && total > 0 && visibleGroups.length === 0 && (
          <p className="rail__empty">没有匹配「{search.trim()}」的分区。</p>
        )}
      </div>
    </nav>
  );
}
