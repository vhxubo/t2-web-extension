import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import { getUnreadNotificationCount } from '../lib/notifications';

/** 短生命周期的弹窗用轮询即可；文档建议没有长连接时每 60 秒拉一次未读数。 */
const POLL_MS = 60_000;

/**
 * 未读通知数。
 *
 * - 未登录时直接归零，不发请求；
 * - 只在页面可见时轮询，弹窗一关就停止；
 * - 令牌缺少 `read:me` 或已过期时静默隐藏角标，不影响主列表；
 * - 用 generation + AbortController 处理 StrictMode 双挂载和重叠轮询，
 *   始终只采纳最后一次请求的结果。
 */
export function useUnreadNotifications(enabled: boolean) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const mounted = useRef(true);
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    generation.current += 1;
    const run = generation.current;

    abortRef.current?.abort();

    if (!enabled) {
      setCount(0);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);

    try {
      const next = await getUnreadNotificationCount(controller.signal);
      if (!mounted.current || controller.signal.aborted || run !== generation.current) return;
      setCount(next);
      setError(null);
    } catch (cause) {
      if (!mounted.current || controller.signal.aborted || run !== generation.current) return;
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      setError(cause);
      // 未登录 / 缺 scope / 令牌失效：不显示小红点，也不打扰用户看列表。
      if (cause instanceof ApiError && (cause.status === 401 || cause.status === 403)) {
        setCount(0);
      }
    } finally {
      if (run === generation.current) setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    setCount(0);
    setError(null);
    void refresh();

    if (!enabled) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, refresh]);

  return { count, loading, error, refresh };
}
