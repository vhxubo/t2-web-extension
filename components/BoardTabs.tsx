import { useRef } from 'react';
import { BOARDS } from '../lib/boards';
import type { BoardId } from '../lib/types';

interface BoardTabsProps {
  value: BoardId;
  onChange: (board: BoardId) => void;
  /** 当前是否选了具体分区（非全站）。 */
  sectionFiltered: boolean;
}

export function BoardTabs({ value, onChange, sectionFiltered }: BoardTabsProps) {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = BOARDS.findIndex((board) => board.id === value);
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % BOARDS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + BOARDS.length) % BOARDS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = BOARDS.length - 1;
    else return;

    event.preventDefault();
    const target = BOARDS[next];
    if (!target) return;
    onChange(target.id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      className="board-tabs"
      role="tablist"
      aria-label="榜单"
      onKeyDown={handleKeyDown}
    >
      {BOARDS.map((board, index) => {
        const active = board.id === value;
        const needsAllSite = sectionFiltered && !board.supportsSection;
        return (
          <button
            key={board.id}
            ref={(element) => {
              tabRefs.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`board-tab-${board.id}`}
            aria-selected={active}
            aria-controls="feed-panel"
            tabIndex={active ? 0 : -1}
            className={`board-tab${active ? ' board-tab--active' : ''}`}
            title={
              needsAllSite
                ? `${board.label}不按分区筛选，点击会切回全站`
                : `${board.label} · ${board.hint}`
            }
            onClick={() => onChange(board.id)}
          >
            <span className="board-tab__label">{board.label}</span>
            {needsAllSite && <span className="board-tab__tag">全站</span>}
          </button>
        );
      })}
    </div>
  );
}
