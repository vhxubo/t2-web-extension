import { browser } from '#imports';
import { useCallback, useEffect, useRef, useState } from 'react';
import { NOTIFICATION_LOCAL_EVENT, isNotificationEventMessage } from '../lib/messages';
import { getNotifications, type AppNotification } from '../lib/notifications';

type NotificationsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseNotificationsOptions {
  /** 面板打开时才拉取；关闭后停止监听和刷新。 */
  enabled: boolean;
  signedIn: boolean;
  /** 会话还在读 storage 时不要抢先发请求，避免误报「未登录」。 */
  sessionLoading?: boolean;
  /** 通知列表每页条数，接口上限 50。 */
  limit?: number;
}

interface UseNotificationsResult {
  status: NotificationsStatus;
  items: AppNotification[];
  total: number;
  error: unknown;
  /** 用户主动重试 / 刷新（显示 loading）。 */
  reload: () => Promise<void>;
}

/**
 * 通知列表数据源：封装拉取、SSE 事件刷新和切回页面时的静默校准。
 *
 * - 只在面板打开时请求，避免弹窗 / 仪表盘常驻占用读配额；
 * - `notification_update` 事件里没有正文，收到后由这里重新拉列表；
 * - 站内标记已读不会产生事件，所以窗口重新可见 / 获得焦点时再校准一次；
 * - 静默刷新失败保留旧列表，不把正在看的通知换成错误页。
 */
export function useNotifications({
  enabled,
  signedIn,
  sessionLoading = false,
  limit = 30,
}: UseNotificationsOptions): UseNotificationsResult {
  const [status, setStatus] = useState<NotificationsStatus>('idle');
  const [items, setItems] = useState<AppNotification[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<unknown>(null);

  const mounted = useRef(true);
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  const load = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!enabled) return;
      if (sessionLoading) return;
      if (!signedIn) {
        abortRef.current?.abort();
        setItems([]);
        setTotal(0);
        setError(null);
        setStatus('idle');
        return;
      }

      generation.current += 1;
      const current = generation.current;
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      if (!options.silent) {
        setStatus('loading');
        setError(null);
      }

      try {
        const page = await getNotifications({ page: 1, limit, signal: controller.signal });
        if (!mounted.current || current !== generation.current) return;
        const list = Array.isArray(page.list) ? page.list : [];
        setItems(list);
        setTotal(page.total ?? list.length);
        setError(null);
        setStatus('ready');
      } catch (cause) {
        if (!mounted.current || current !== generation.current) return;
        if (controller.signal.aborted) return;
        if (options.silent) return;
        setError(cause);
        setStatus('error');
      }
    },
    [enabled, signedIn, sessionLoading, limit],
  );

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  // 面板关闭后回到 idle 并中止在途请求：下次打开先显示骨架，不闪上一次的旧列表。
  useEffect(() => {
    if (enabled) return;
    generation.current += 1;
    abortRef.current?.abort();
    setStatus('idle');
    setError(null);
  }, [enabled]);

  // 长连接收到 notification_update 时按需刷新；合并短时间内的多条事件。
  useEffect(() => {
    if (!enabled || !signedIn || sessionLoading) return;

    let timer: number | null = null;
    const schedule = () => {
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void load({ silent: true });
      }, 800);
    };
    const onMessage = (message: unknown) => {
      if (isNotificationEventMessage(message)) schedule();
    };
    const onLocal = () => schedule();

    browser.runtime.onMessage.addListener(onMessage);
    // 后台不可用时页面自己连的 SSE 会派发这个窗口事件。
    window.addEventListener(NOTIFICATION_LOCAL_EVENT, onLocal);
    return () => {
      browser.runtime.onMessage.removeListener(onMessage);
      window.removeEventListener(NOTIFICATION_LOCAL_EVENT, onLocal);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [enabled, signedIn, sessionLoading, load]);

  // 从站点切回来时静默校准列表：站内已读不会产生 notification_update。
  useEffect(() => {
    if (!enabled || !signedIn || sessionLoading) return;

    let timer: number | null = null;
    const onActive = () => {
      if (document.visibilityState !== 'visible') return;
      if (timer !== null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        timer = null;
        void load({ silent: true });
      }, 300);
    };

    document.addEventListener('visibilitychange', onActive);
    window.addEventListener('focus', onActive);
    return () => {
      document.removeEventListener('visibilitychange', onActive);
      window.removeEventListener('focus', onActive);
      if (timer !== null) window.clearTimeout(timer);
    };
  }, [enabled, signedIn, sessionLoading, load]);

  const reload = useCallback(() => load(), [load]);

  return { status, items, total, error, reload };
}
