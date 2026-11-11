import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { readItemsCacheItem, type ReadItemsCache } from '../lib/storage';

/** 只保留最近 30 天点开过的条目，避免 storage 无限增长。 */
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
/** 上限兜底：即使时间没过期，也只保留最近 3000 条。 */
const MAX_ITEMS = 3000;

function normalize(raw: ReadItemsCache | null | undefined): Record<string, number> {
  const now = Date.now();
  const entries = Object.entries(raw?.items ?? {}).filter(
    ([, at]) => Number.isFinite(at) && now - at < MAX_AGE_MS,
  );
  entries.sort(([, a], [, b]) => b - a);
  return Object.fromEntries(entries.slice(0, MAX_ITEMS));
}

/**
 * 列表条目的已读记录（帖子 / 评论）。
 *
 * 点击列表项时把 key 记进 `storage.local`，下次打开弹窗 / 仪表盘仍然置灰。
 * 只保存条目 id 和时间，不保存标题、正文等任何内容。
 */
export function useReadItems() {
  const [items, setItems] = useState<Record<string, number>>({});
  const itemsRef = useRef<Record<string, number>>({});
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    void readItemsCacheItem
      .getValue()
      .then((value) => {
        if (!mounted.current) return;
        // 读取是异步的：如果用户在读完之前已经点了条目，以内存里的新记录为准。
        const stored = normalize(value);
        const merged = normalize({ items: { ...stored, ...itemsRef.current } });
        itemsRef.current = merged;
        setItems(merged);
      })
      .catch(() => undefined);
    return () => {
      mounted.current = false;
    };
  }, []);

  // 弹窗和仪表盘可能同时开着：任一页写入后，另一页也跟着置灰。
  useEffect(() => {
    const unwatch = readItemsCacheItem.watch((value) => {
      const stored = normalize(value);
      const merged = normalize({ items: { ...stored, ...itemsRef.current } });
      if (JSON.stringify(merged) === JSON.stringify(itemsRef.current)) return;
      itemsRef.current = merged;
      setItems(merged);
    });
    return unwatch;
  }, []);

  const markRead = useCallback((key: string) => {
    if (!key) return;
    const current = itemsRef.current;
    if (current[key]) return;

    // 直接落盘，不依赖 React effect：点开链接后弹窗可能立刻关闭。
    const next = normalize({ items: { ...current, [key]: Date.now() } });
    itemsRef.current = next;
    setItems(next);
    void readItemsCacheItem.setValue({ items: next }).catch(() => undefined);
  }, []);

  const readKeys = useMemo(() => new Set(Object.keys(items)), [items]);

  return { readKeys, markRead };
}
