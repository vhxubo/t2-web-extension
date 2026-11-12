import { browser } from '#imports';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NOTIFICATION_LOCAL_EVENT, isNotificationEventMessage } from '../lib/messages';
import {
  notificationFilterQuery,
  type NotificationFilter,
} from '../lib/notification-filter';
import {
  getNotifications,
  markNotificationsRead,
  type AppNotification,
} from '../lib/notifications';

type NotificationsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseNotificationsOptions {
  /** 面板打开时才拉取；关闭后停止监听和刷新。 */
  enabled: boolean;
  signedIn: boolean;
  /** 会话还在读 storage 时不要抢先发请求，避免误报「未登录」。 */
  sessionLoading?: boolean;
  /** 消息列表每页条数，接口上限 50。 */
  limit?: number;
}

interface UseNotificationsResult {
  status: NotificationsStatus;
  items: AppNotification[];
  total: number;
  error: unknown;
  /** 用户主动重试 / 刷新（显示 loading）。 */
  reload: () => Promise<void>;
  /** 单条标记已读：调用开放 API，成功返回 true。 */
  markRead: (id: string) => Promise<boolean>;
  /** 正在提交单条已读的消息 id。 */
  readingIds: ReadonlySet<string>;
  /** 全部标记已读：调用 `POST /v1/me/notifications/read`（不带 body）。成功返回 true。 */
  markAllRead: () => Promise<boolean>;
  /** 全部已读请求进行中。 */
  markingAll: boolean;
  /** 单条 / 全部已读的失败原因；列表加载错误仍然看 `error`。 */
  actionError: unknown;
  /** 当前筛选分段（全部 / 未读 / 回复 / 提及 / 表态 / 打赏）。 */
  filter: NotificationFilter;
  /** 切换筛选：会按对应的 `type` / `unread_only` 重新拉取列表。 */
  setFilter: (filter: NotificationFilter) => void;
}

/**
 * 消息列表数据源：封装拉取、SSE 事件刷新和切回页面时的静默校准。
 *
 * - 只在面板打开时请求，避免弹窗 / 仪表盘常驻占用读配额；
 * - `notification_update` 事件里没有正文，收到后由这里重新拉列表；
 * - 站内标记已读不会产生事件，所以窗口重新可见 / 获得焦点时再校准一次；
 * - 单条「已读」调用 `POST /v1/me/notifications/read` 并带上 `{ id: [id] }`；
 * - 「全部已读」调用 `POST /v1/me/notifications/read`，成功后列表全部置读；
 * - 分段筛选直接复用接口已有的 `type` / `unread_only` 参数，不新增接口；
 * - 消息行本身不置灰：已读只表现为按钮消失；
 * - 静默刷新失败保留旧列表，不把正在看的消息换成错误页。
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
  const [filter, setFilter] = useState<NotificationFilter>('all');
  const [markingAll, setMarkingAll] = useState(false);
  const [actionError, setActionError] = useState<unknown>(null);
  /** 已经提交过单条已读的 id：成功后立即隐藏「已读」按钮。 */
  const [readIds, setReadIds] = useState<ReadonlySet<string>>(() => new Set());
  /** 正在提交单条已读的 id，用于按钮禁用与重复点击保护。 */
  const [readingIds, setReadingIds] = useState<ReadonlySet<string>>(() => new Set());

  const mounted = useRef(true);
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** 防止连点「全部已读」重复提交（state 更新前的同一帧里也能拦住）。 */
  const markingAllRef = useRef(false);
  /** 单条已读的同步锁，避免同一帧内重复提交。 */
  const readingRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      abortRef.current?.abort();
    };
  }, []);

  // 退出登录后清掉本地已读覆盖，避免下一个账号复用同一条消息 id。
  useEffect(() => {
    if (!signedIn) {
      readingRef.current.clear();
      setReadIds(new Set());
      setReadingIds(new Set());
      setActionError(null);
      setFilter('all');
    }
  }, [signedIn]);

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
        setReadIds(new Set());
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
        const query = notificationFilterQuery(filter);
        const page = await getNotifications({
          page: 1,
          limit,
          unreadOnly: query.unreadOnly,
          type: query.type,
          signal: controller.signal,
        });
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
    [enabled, signedIn, sessionLoading, limit, filter],
  );

  useEffect(() => {
    if (!enabled) return;
    void load();
  }, [enabled, load]);

  // 面板关闭后回到 idle 并中止在途请求：下次打开先显示骨架，不闪上一次的旧列表。
  // 分段也一并回到「全部」，避免下次打开时只看到某个分类而误以为没有消息。
  useEffect(() => {
    if (enabled) return;
    generation.current += 1;
    abortRef.current?.abort();
    setStatus('idle');
    setError(null);
    setActionError(null);
    setFilter('all');
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

  const markRead = useCallback(
    async (id: string): Promise<boolean> => {
      if (!enabled || !signedIn || sessionLoading || !id) return false;
      if (readIds.has(id) || readingRef.current.has(id)) return true;

      readingRef.current.add(id);
      setReadingIds(new Set(readingRef.current));
      setActionError(null);
      try {
        await markNotificationsRead([id]);
        setReadIds((current) => {
          const next = new Set(current);
          next.add(id);
          return next;
        });
        // 「未读」筛选下，读掉的这一条应立刻从列表里消失；总数同步减一，
        // 免得底部「还有 N 条」在下次刷新前停在旧值。
        if (filter === 'unread') {
          setItems((current) => current.filter((item) => item.id !== id));
          setTotal((current) => Math.max(0, current - 1));
        }
        return true;
      } catch (cause) {
        setActionError(cause);
        return false;
      } finally {
        readingRef.current.delete(id);
        setReadingIds(new Set(readingRef.current));
      }
    },
    [enabled, signedIn, sessionLoading, readIds, filter],
  );

  const markAllRead = useCallback(async (): Promise<boolean> => {
    if (!enabled || !signedIn || sessionLoading || markingAllRef.current) return false;

    markingAllRef.current = true;
    setMarkingAll(true);
    setActionError(null);
    try {
      await markNotificationsRead();
      // 服务端已全部置读；本地把当前页的条目也立即置读，列表不必等下一次刷新。
      setReadIds((current) => {
        const next = new Set(current);
        for (const item of items) next.add(item.id);
        return next;
      });
      if (filter === 'unread') setTotal(0);
      // 重新拉一次列表：如果点「全部已读」时正好有一次旧列表请求在途，
      // 这一步会中止它，避免用服务端的旧 is_read=false 覆盖已读状态。
      void load({ silent: true });
      return true;
    } catch (cause) {
      setActionError(cause);
      return false;
    } finally {
      markingAllRef.current = false;
      setMarkingAll(false);
    }
  }, [enabled, signedIn, sessionLoading, items, load, filter]);

  // 展示用的列表：服务端已读的保持已读，本页刚刚提交成功的也按已读渲染。
  // 这样静默刷新不会把刚点过的消息重新变回未读；重开页面则回到服务端状态。
  // 「未读」筛选下额外过滤掉刚读掉的条目（静默刷新失败时也不会残留）。
  const visibleItems = useMemo(() => {
    const withRead =
      readIds.size === 0
        ? items
        : items.map((item) =>
            item.is_read || !readIds.has(item.id) ? item : { ...item, is_read: true },
          );
    if (filter !== 'unread') return withRead;
    return withRead.filter((item) => !item.is_read);
  }, [items, readIds, filter]);

  return {
    status,
    items: visibleItems,
    total,
    error,
    reload,
    markRead,
    readingIds,
    markAllRead,
    markingAll,
    actionError,
    filter,
    setFilter,
  };
}
