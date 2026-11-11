import { browser } from '#imports';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../lib/api';
import {
  NOTIFICATION_LOCAL_EVENT,
  STREAM_STATUS_QUERY,
  UNREAD_REPORT_MESSAGE,
  isStreamStatusMessage,
  isUnreadCountMessage,
} from '../lib/messages';
import { getUnreadNotificationCount } from '../lib/notifications';
import { openNotificationStream, type NotificationStream } from '../lib/notification-stream';

/**
 * 后台长连接没就绪时的兜底刷新间隔。
 *
 * 正常路径是 SSE：后台收到 `notification_update` 会马上广播最新未读数。
 * 只有长连接还没握手 / 正在退避时才用轮询，所以这里比文档建议的 60 秒更短，
 * 让小红点在最坏情况下也能在几秒级跟上来；页面不可见时仍然不请求。
 */
const POLL_MS = 15_000;

/** 窗口重新可见 / 获得焦点时，两次刷新之间的最小间隔（避免 focus + visibility 连发）。 */
const ACTIVE_REFRESH_GAP_MS = 2_000;

/** 后台没就绪时，等这么久再让页面自己连一条 SSE，避免和正在启动的后台重复建连。 */
const LOCAL_STREAM_GRACE_MS = 2_000;
/** 页面自己建连的最小间隔：跨弹窗 / 仪表盘共享，避免撞上每分钟 6 次的建连限额。 */
const LOCAL_STREAM_GAP_MS = 10_000;
const LOCAL_STREAM_SLOT_KEY = 't2:notification-stream:last-attempt';

/** 后台每分钟都会广播一次；超过这个时间没有消息就怀疑连接已经断了。 */
const STREAM_SILENCE_MS = 75_000;

function reportUnread(count: number, at: number): void {
  // 页面直接拉到的数字回报给后台，让工具栏角标与页面小红点保持同一份状态。
  // `at` 是请求开始时间：后台据此丢弃比已应用结果更旧的回报，避免把角标盖回旧值。
  // 后台会被这条消息唤醒，长连接断掉时也会跟着重建。
  void browser.runtime
    .sendMessage({ type: UNREAD_REPORT_MESSAGE, count, at })
    .catch(() => undefined);
}

/** 页面自己建连前的全局限流；localStorage 是扩展页面之间共享的。 */
function reserveLocalStreamSlot(): boolean {
  try {
    const now = Date.now();
    const last = Number(window.localStorage.getItem(LOCAL_STREAM_SLOT_KEY) ?? 0);
    if (Number.isFinite(last) && now - last < LOCAL_STREAM_GAP_MS) return false;
    window.localStorage.setItem(LOCAL_STREAM_SLOT_KEY, String(now));
  } catch {
    // localStorage 不可用时不阻塞连接：服务端还有 429 + retry_after 兜底。
  }
  return true;
}

/**
 * 未读通知数。
 *
 * - 登录状态由调用方传入；未登录直接归零，不发请求；
 * - 后台持有一条 SSE 长连接，收到 `notification_update` 后会把最新未读数广播过来，
 *   弹窗 Dock 与仪表盘铃铛因此可以秒级更新；
 * - 后台长连接没就绪时，页面等 2 秒再自己连一条 SSE 兜底，而不是只靠轮询；
 * - 任何兜底路径下页面都保留 15 秒刷新；页面重新可见 / 窗口重新获得焦点时立即刷新；
 * - 站内标记已读不会产生 `notification_update`，所以「切回页面」和兜底刷新
 *   是小红点跟随减少的关键；
 * - 令牌缺少 `read:me` 或已过期时静默隐藏角标，不影响主列表；
 * - 用 generation + AbortController 处理 StrictMode 双挂载和重叠请求，
 *   并让后台推送优先于更早发出的轮询结果。
 */
export function useUnreadNotifications(enabled: boolean) {
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<unknown>(null);
  /** 后台长连接是否已经握手成功；就绪时不再跑兜底轮询。 */
  const [streamLive, setStreamLive] = useState(false);
  /** 页面自己的兜底长连接是否已经握手成功。 */
  const [localLive, setLocalLive] = useState(false);

  const mounted = useRef(true);
  const generation = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** 后台推送到达的时间，用来丢弃比它更早发出的轮询结果。 */
  const pushedAt = useRef(0);
  /** 最近一次收到后台任何消息的时间；长时间没有消息时退回兜底轮询。 */
  const lastPushAt = useRef(0);
  /** 最近一次「页面重新激活」触发的刷新时间。 */
  const activeRefreshAt = useRef(0);
  const localStreamRef = useRef<NotificationStream | null>(null);
  /** 授权类失败后不再由页面自己重连，等登录态变化后重置。 */
  const localDisabled = useRef(false);

  const closeLocalStream = useCallback(() => {
    localStreamRef.current?.close();
    localStreamRef.current = null;
    setLocalLive(false);
  }, []);

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
    const startedAt = Date.now();
    setLoading(true);

    try {
      const next = await getUnreadNotificationCount(controller.signal);
      if (!mounted.current || controller.signal.aborted || run !== generation.current) return;
      // 推送比这次轮询新：不要再把旧结果盖回去。
      if (pushedAt.current > startedAt) return;
      setCount(next);
      setError(null);
      reportUnread(next, startedAt);
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

  // 登录态变化：先归零再拉一次，避免退出登录后还留着上一个人的未读数。
  useEffect(() => {
    setCount(0);
    setError(null);
    void refresh();
  }, [enabled, refresh]);

  // 订阅后台推送：未读数与长连接状态都由同一个 service worker 广播。
  useEffect(() => {
    if (!enabled) {
      setStreamLive(false);
      return;
    }

    let alive = true;
    /** 已经收到过状态广播，就别再让更早发出的状态查询覆盖它。 */
    let statusPushed = false;

    const listener = (message: unknown) => {
      if (!alive) return;
      if (isUnreadCountMessage(message)) {
        lastPushAt.current = Date.now();
        // 后台刚拉过最新值：中止可能在途的旧轮询，直接采纳推送。
        abortRef.current?.abort();
        pushedAt.current = Date.now();
        setCount(Math.max(0, Math.floor(message.count)));
        setError(null);
        return;
      }
      if (isStreamStatusMessage(message)) {
        lastPushAt.current = Date.now();
        statusPushed = true;
        setStreamLive(message.connected);
      }
    };

    browser.runtime.onMessage.addListener(listener);

    // 页面可能是在长连接就绪之后才打开的，主动问一次当前状态。
    void browser.runtime
      .sendMessage({ type: STREAM_STATUS_QUERY })
      .then((reply: unknown) => {
        if (!alive || statusPushed || !isStreamStatusMessage(reply)) return;
        lastPushAt.current = Date.now();
        setStreamLive(reply.connected);
      })
      .catch(() => {
        // 后台还没醒或不可用：当作没有长连接，稍后由页面自己建连兜底。
      });

    return () => {
      alive = false;
      browser.runtime.onMessage.removeListener(listener);
    };
  }, [enabled]);

  // 切回页面 / 窗口重新聚焦时立刻校准一次。SSE 只推送「有新通知」，
  // 在站内读掉通知不会产生事件，这一步是小红点跟随减少的关键。
  useEffect(() => {
    if (!enabled) return;
    activeRefreshAt.current = Date.now();

    const onActive = () => {
      if (document.visibilityState !== 'visible') return;
      const now = Date.now();
      if (now - activeRefreshAt.current < ACTIVE_REFRESH_GAP_MS) return;
      activeRefreshAt.current = now;
      void refresh();
    };

    document.addEventListener('visibilitychange', onActive);
    window.addEventListener('focus', onActive);
    return () => {
      document.removeEventListener('visibilitychange', onActive);
      window.removeEventListener('focus', onActive);
    };
  }, [enabled, refresh]);

  // 后台长连接没就绪时，页面自己连一条 SSE。这样即使 service worker 被回收 /
  // 后台建连失败，弹窗和仪表盘的小红点仍然是事件驱动、秒级更新，而不是等轮询。
  useEffect(() => {
    if (!enabled) {
      localDisabled.current = false;
      closeLocalStream();
      return;
    }
    if (streamLive) {
      // 后台已经接管：不额外占一条连接。
      closeLocalStream();
      return;
    }

    let cancelled = false;
    let openTimer: number | null = null;
    let retryTimer: number | null = null;

    const attempt = () => {
      if (cancelled || localDisabled.current) return;
      // 页面不可见时不开连接：小红点看不到，等切回页面再由下面的监听补上。
      if (document.visibilityState !== 'visible') return;
      if (!reserveLocalStreamSlot()) {
        // 全局限流：等窗口过去再试，期间继续走 15 秒兜底刷新。
        retryTimer = window.setTimeout(attempt, LOCAL_STREAM_GAP_MS);
        return;
      }

      const stream = openNotificationStream({
        onReady: () => {
          if (cancelled) return;
          setLocalLive(true);
          void refresh();
        },
        onNotification: () => {
          if (cancelled) return;
          // 事件里没有正文：拉一次未读数，并让打开着的通知中心刷新列表。
          void refresh();
          window.dispatchEvent(new Event(NOTIFICATION_LOCAL_EVENT));
        },
        onError: (streamError) => {
          if (cancelled) return;
          setLocalLive(false);
          if (streamError.kind === 'auth') localDisabled.current = true;
        },
      });

      localStreamRef.current = stream;
      if (cancelled) {
        stream.close();
        localStreamRef.current = null;
      }
    };

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (cancelled || localDisabled.current || localStreamRef.current) return;
      if (openTimer !== null) window.clearTimeout(openTimer);
      openTimer = window.setTimeout(attempt, LOCAL_STREAM_GRACE_MS);
    };

    openTimer = window.setTimeout(attempt, LOCAL_STREAM_GRACE_MS);
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      if (openTimer !== null) window.clearTimeout(openTimer);
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      closeLocalStream();
    };
  }, [enabled, streamLive, refresh, closeLocalStream]);

  // 后台说「就绪」但可能已经被浏览器回收。超过 75 秒没有广播就先问一次后台，
  // 真的断了才退回兜底刷新（并让上面的 effect 接管本地长连接）。
  useEffect(() => {
    if (!enabled || !streamLive) return;

    let alive = true;
    const timer = window.setInterval(() => {
      if (Date.now() - lastPushAt.current <= STREAM_SILENCE_MS) return;
      void browser.runtime
        .sendMessage({ type: STREAM_STATUS_QUERY })
        .then((reply: unknown) => {
          if (!alive) return;
          if (isStreamStatusMessage(reply) && reply.connected) {
            // 后台还活着，只是刚刚没有广播：刷新计时，继续信任它。
            lastPushAt.current = Date.now();
          } else {
            setStreamLive(false);
          }
        })
        .catch(() => {
          if (alive) setStreamLive(false);
        });
    }, 30_000);

    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [enabled, streamLive]);

  // 兜底刷新只在「两条长连接都没就绪」且页面可见时运行；
  // 重新可见时的即时刷新由上面的 active effect 负责。
  useEffect(() => {
    if (!enabled || streamLive || localLive) return;

    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, POLL_MS);

    return () => window.clearInterval(timer);
  }, [enabled, streamLive, localLive, refresh]);

  return { count, loading, error, refresh, streamLive, localLive };
}
