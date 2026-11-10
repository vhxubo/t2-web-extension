import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import {
  runSearch,
  searchKey,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MIN_LENGTH,
  SEARCH_RATE_LIMITS,
  type SearchResults,
  type SearchType,
} from '../lib/search';

export type SearchStatus =
  | 'idle'
  | 'too-short'
  | 'debouncing'
  | 'loading'
  | 'ready'
  | 'error'
  | 'throttled';

interface CacheEntry {
  results: SearchResults;
  at: number;
}

const CACHE_TTL = 5 * 60_000;
const CACHE_MAX = 40;
const RATE_WINDOW = 60_000;

/**
 * 缓存与请求时间戳放在模块级：同一个页面里反复开关搜索弹窗时不必重发请求。
 * 弹窗与完整页面是两个独立上下文，各自的预算也分开计算。
 */
const cache = new Map<string, CacheEntry>();
const requestTimes: number[] = [];
let blockedUntil = 0;

function trimCache(): void {
  if (cache.size <= CACHE_MAX) return;
  const entries = [...cache.entries()].sort((a, b) => a[1].at - b[1].at);
  for (const [key] of entries.slice(0, cache.size - CACHE_MAX)) cache.delete(key);
}

/**
 * 距离下一次「配额恢复」还有多少秒。
 *
 * 服务端的限额是硬约束，这里只做一个软提醒：额度用完时不再发请求，
 * 而是直接告诉用户还要等多久，避免把 429 攒成一片。
 */
function waitForBudget(signedIn: boolean): number {
  const now = Date.now();
  let oldest = requestTimes[0];
  while (oldest !== undefined && now - oldest > RATE_WINDOW) {
    requestTimes.shift();
    oldest = requestTimes[0];
  }

  if (blockedUntil > now) return Math.ceil((blockedUntil - now) / 1000);

  const limit = signedIn ? SEARCH_RATE_LIMITS.signedIn : SEARCH_RATE_LIMITS.anonymous;
  if (requestTimes.length < limit) return 0;
  return Math.max(1, Math.ceil((RATE_WINDOW - (now - (oldest ?? now))) / 1000));
}

interface UseSearchOptions {
  /** 弹窗关着时停止请求。 */
  active: boolean;
  signedIn: boolean;
}

export function useSearch({ active, signedIn }: UseSearchOptions) {
  const [query, setQuery] = useState('');
  const [type, setTypeState] = useState<SearchType>('posts');
  const [results, setResults] = useState<SearchResults | null>(null);
  const [status, setStatus] = useState<SearchStatus>('idle');
  const [error, setError] = useState<unknown>(null);
  const [wait, setWait] = useState(0);
  const [nonce, setNonce] = useState(0);

  const skipDebounce = useRef(false);
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const trimmed = query.trim();

  useEffect(
    () => () => {
      generation.current += 1;
      abortRef.current?.abort();
    },
    [],
  );

  // 退出登录后如果还停在「收藏」，回到公开的帖子搜索。
  useEffect(() => {
    if (!signedIn && type === 'favorites') setTypeState('posts');
  }, [signedIn, type]);

  // 登录态变化时丢掉「收藏」缓存：换账号后不能把上一个账号的收藏结果带过来。
  useEffect(() => {
    for (const key of [...cache.keys()]) {
      if (key.startsWith('favorites:')) cache.delete(key);
    }
  }, [signedIn]);

  useEffect(() => {
    if (!active) {
      generation.current += 1;
      abortRef.current?.abort();
      return;
    }

    if (trimmed.length === 0) {
      generation.current += 1;
      abortRef.current?.abort();
      setResults(null);
      setStatus('idle');
      setError(null);
      setWait(0);
      return;
    }

    // 登录态刚失效、type 还没切回 posts 的那一帧：不要发一个注定 401 的请求。
    if (type === 'favorites' && !signedIn) {
      generation.current += 1;
      abortRef.current?.abort();
      setResults(null);
      setStatus('idle');
      setError(null);
      setWait(0);
      return;
    }

    if (trimmed.length < SEARCH_MIN_LENGTH) {
      generation.current += 1;
      abortRef.current?.abort();
      setResults(null);
      setStatus('too-short');
      setError(null);
      setWait(0);
      return;
    }

    const key = searchKey(type, trimmed);
    const cached = cache.get(key);
    if (cached && Date.now() - cached.at < CACHE_TTL) {
      generation.current += 1;
      abortRef.current?.abort();
      // 缓存 key 不区分大小写；回填时把 query 对齐到当前输入，
      // 否则「Jimmy → jimmy」这种只改大小写的情况会一直停在骨架屏。
      setResults({ ...cached.results, query: trimmed });
      setStatus('ready');
      setError(null);
      setWait(0);
      return;
    }

    generation.current += 1;
    const run = generation.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setResults(null);

    const waitSeconds = waitForBudget(signedIn);
    if (waitSeconds > 0) {
      setStatus('throttled');
      setWait(waitSeconds);
      return;
    }

    setStatus('debouncing');
    setWait(0);

    const delay = skipDebounce.current ? 0 : SEARCH_DEBOUNCE_MS;
    skipDebounce.current = false;

    const timer = window.setTimeout(() => {
      if (run !== generation.current || controller.signal.aborted) return;

      requestTimes.push(Date.now());
      setStatus('loading');

      void runSearch(type, trimmed, controller.signal)
        .then((next) => {
          if (run !== generation.current || controller.signal.aborted) return;
          cache.set(key, { results: next, at: Date.now() });
          trimCache();
          setResults(next);
          setStatus('ready');
        })
        .catch((cause: unknown) => {
          if (run !== generation.current || controller.signal.aborted) return;
          if (cause instanceof DOMException && cause.name === 'AbortError') return;

          if (cause instanceof ApiError && cause.status === 429) {
            const seconds = Math.max(1, cause.retryAfter ?? 60);
            blockedUntil = Math.max(blockedUntil, Date.now() + seconds * 1000);
            setError(cause);
            setStatus('throttled');
            setWait(seconds);
            return;
          }

          setError(cause);
          setStatus('error');
        });
    }, delay);

    return () => {
      window.clearTimeout(timer);
    };
  }, [active, trimmed, type, signedIn, nonce]);

  // 限流倒计时：归零后自动重试一次；若仍被拦下，会拿到新的等待时长。
  useEffect(() => {
    if (status !== 'throttled' || wait <= 0) return;
    const timer = window.setTimeout(() => setWait((current) => Math.max(0, current - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [status, wait]);

  useEffect(() => {
    if (status !== 'throttled' || wait > 0) return;
    setNonce((current) => current + 1);
  }, [status, wait]);

  const setType = useCallback((next: SearchType) => {
    setTypeState(next);
  }, []);

  /** 回车立即搜索；否则等防抖计时。 */
  const submit = useCallback(() => {
    if (query.trim().length < SEARCH_MIN_LENGTH) return;
    skipDebounce.current = true;
    setNonce((current) => current + 1);
  }, [query]);

  const retry = useCallback(() => {
    if (trimmed.length >= SEARCH_MIN_LENGTH) {
      cache.delete(searchKey(type, trimmed));
    }
    skipDebounce.current = true;
    setNonce((current) => current + 1);
  }, [trimmed, type]);

  const clear = useCallback(() => {
    setQuery('');
  }, []);

  return {
    query,
    setQuery,
    trimmed,
    type,
    setType,
    results,
    status,
    error,
    wait,
    submit,
    retry,
    clear,
    busy: status === 'loading' || status === 'debouncing',
    minLength: SEARCH_MIN_LENGTH,
  };
}

/** Ctrl/Cmd + K 打开搜索；弹窗与完整页面共用。 */
export function useSearchHotkey(onOpen: () => void): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing) return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key.toLowerCase() !== 'k') return;
      event.preventDefault();
      onOpen();
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpen]);
}
