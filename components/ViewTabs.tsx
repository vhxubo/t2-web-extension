import { useRef } from 'react';
import { viewDomId } from '../lib/viewIds';

export interface ViewTab {
  id: string;
  label: string;
  /** 悬停提示：节点路径 / 榜单说明。 */
  title?: string;
}

interface ViewTabsProps {
  tabs: ViewTab[];
  value: string | null;
  onChange: (id: string) => void;
  ariaLabel?: string;
  /** 弹窗里让 Tab 等分宽度，长名称用省略号收尾。 */
  stretch?: boolean;
}

export function ViewTabs({
  tabs,
  value,
  onChange,
  ariaLabel = '视图',
  stretch = false,
}: ViewTabsProps) {
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
    <div
      className={`view-tabs${stretch ? ' view-tabs--stretch' : ''}`}
      role="tablist"
      aria-label={ariaLabel}
      onKeyDown={handleKeyDown}
    >
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
            id={`view-tab-${viewDomId(tab.id)}`}
            aria-selected={active}
            aria-controls="feed-panel"
            tabIndex={active ? 0 : -1}
            className={`view-tab${active ? ' view-tab--active' : ''}`}
            title={tab.title ?? tab.label}
            onClick={() => onChange(tab.id)}
          >
            <span className="view-tab__label">{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
