import { useCallback, useEffect, useRef, useState } from 'react';
import { loadFeed, mergeItems, type FeedItem } from '../lib/feed';
import { sectionKey } from '../lib/section';
import type { ApiNode, BoardId, Section } from '../lib/types';

interface UseFeedOptions {
  board: BoardId;
  section: Section;
  nodes: ApiNode[];
  /** 节点数据是否可以参与请求（加载中时先不发分区请求）。 */
  nodesReady: boolean;
  limit: number;
  enabled?: boolean;
}

export type FeedStatus = 'idle' | 'loading' | 'ready' | 'error';

export function useFeed({ board, section, nodes, nodesReady, limit, enabled = true }: UseFeedOptions) {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [status, setStatus] = useState<FeedStatus>('idle');
  const [error, setError] = useState<unknown>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState<unknown>(null);
  const [updatedAt, setUpdatedAt] = useState<number | null>(null);

  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;

  const key = `${board}|${sectionKey(section)}|${limit}`;

  const loadFirstPage = useCallback(async () => {
    if (!enabled || !nodesReady) return;

    generation.current += 1;
    const run = generation.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('loading');
    setError(null);
    setMoreError(null);
    setLoadingMore(false);
    setItems([]);
    setPage(0);

    try {
      const result = await loadFeed({
        board,
        section,
        nodes: nodesRef.current,
        page: 1,
        pageSize: limit,
        signal: controller.signal,
      });
      if (run !== generation.current) return;
      setItems(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setPage(1);
      setStatus('ready');
      setUpdatedAt(Date.now());
    } catch (cause) {
      if (run !== generation.current) return;
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause);
      setStatus('error');
    }
  }, [board, section, limit, enabled, nodesReady]);

  useEffect(() => {
    void loadFirstPage();
  }, [loadFirstPage]);

  useEffect(
    () => () => {
      abortRef.current?.abort();
    },
    [],
  );

  const loadMore = useCallback(async () => {
    if (status !== 'ready' || loadingMore || page === 0 || page >= totalPages) return;

    const run = generation.current;
    setLoadingMore(true);
    setMoreError(null);

    try {
      const result = await loadFeed({
        board,
        section,
        nodes: nodesRef.current,
        page: page + 1,
        pageSize: limit,
      });
      if (run !== generation.current) return;
      setItems((current) => mergeItems(current, result.items));
      setPage(result.page || page + 1);
      setTotalPages(result.totalPages);
      setTotal(result.total);
      setUpdatedAt(Date.now());
    } catch (cause) {
      if (run !== generation.current) return;
      setMoreError(cause);
    } finally {
      if (run === generation.current) setLoadingMore(false);
    }
  }, [board, section, page, totalPages, loadingMore, status, limit]);

  return {
    items,
    page,
    total,
    totalPages,
    status,
    error,
    moreError,
    loadingMore,
    updatedAt,
    hasMore: page > 0 && page < totalPages,
    loadMore,
    reload: loadFirstPage,
    key,
  };
}
