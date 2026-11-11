import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useReadItems } from '../hooks/useReadItems';

interface ReadItemsValue {
  readKeys: ReadonlySet<string>;
  markRead: (key: string) => void;
}

const ReadItemsContext = createContext<ReadItemsValue | null>(null);

/** 弹窗 / 仪表盘共用一个已读集合，避免每张卡片各读一次 storage。 */
export function ReadItemsProvider({ children }: { children: ReactNode }) {
  const { readKeys, markRead } = useReadItems();
  const value = useMemo(() => ({ readKeys, markRead }), [readKeys, markRead]);

  return <ReadItemsContext.Provider value={value}>{children}</ReadItemsContext.Provider>;
}

export function useReadItemsContext(): ReadItemsValue {
  const value = useContext(ReadItemsContext);
  if (!value) {
    throw new Error('ReadItemsProvider is missing');
  }
  return value;
}
