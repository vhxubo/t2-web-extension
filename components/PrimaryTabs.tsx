import { useRef } from 'react';

export interface PrimaryTabItem {
  id: string;
  label: string;
}

interface PrimaryTabsProps {
  tabs: PrimaryTabItem[];
  value: string;
  onChange: (id: string) => void;
  ariaLabel?: string;
}

/**
 * 登录后 Header 里的一级 Tab（帖子 / 我的）。
 *
 * 用独立的 tablist，而不是复用二级 ViewTabs：一级切换的是整块内容模式，
 * 二级切换的是当前模式内的筛选视图，两者的 ARIA 关系和视觉层级都不同。
 */
export function PrimaryTabs({
  tabs,
  value,
  onChange,
  ariaLabel = '内容分区',
}: PrimaryTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  if (tabs.length === 0) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === value);
    let next = index < 0 ? 0 : index;

    if (event.key === 'ArrowRight') next = (next + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') next = (next - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabs.length - 1;
    else return;

    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    onChange(target.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className="primary-tabs" role="tablist" aria-label={ariaLabel} onKeyDown={handleKeyDown}>
      {tabs.map((tab, index) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`primary-tab-${tab.id}`}
            aria-selected={active}
            aria-controls="feed-panel"
            tabIndex={active ? 0 : -1}
            className={`primary-tab${active ? ' primary-tab--active' : ''}`}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}
