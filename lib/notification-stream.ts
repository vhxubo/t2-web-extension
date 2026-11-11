import { AuthError, getAccessToken, refreshTokens } from './auth';
import { API_BASE } from './config';
import { SseParser } from './sse';
import { tokensItem } from './storage';
import type { Envelope } from './types';

/**
 * 通知长连接（SSE）。
 *
 * 文档：https://r2.2libra.com/openapi/v1/api-read.md#我的
 *
 * 这个端点只认 `Authorization` 请求头，浏览器的 `EventSource` 设不了头，
 * 所以用 `fetch()` + `ReadableStream` 自己读流。它也是全套 API 里唯一不返回
 * `{c,m,d,t}` 信封的端点：200 就是裸事件流，非 200 才是 JSON 错误。
 *
 * 连接生命周期（按文档约定）：
 * - `ready`：握手成功；之后的未读变化靠 `notification_update` 推动；
 * - `notification_update`：只保证「有新通知」，没有正文；如果帧里带了
 *   `unread_count`（服务端可选的扩展字段）就直接用，没有才回调去拉一次；
 * - `reconnect`：服务端主动断开（15 分钟寿命 / 令牌快过期），不是故障，立即重连；
 * - `retry: 25000` 心跳：25 秒一次，45 秒一个字节都没收到就认为连接已死；
 * - 断线重连：5s → 10s → 20s → 40s → 60s 封顶；
 * - 401 先刷新令牌重试一次，刷新失败再清掉本地令牌并停止；403 属于授权问题，等重新授权。
 *
 * 同一用户最多 10 条并发连接、每分钟最多建连 6 次，所以整个扩展只应由后台
 * 持有一条连接（见 `entrypoints/background.ts`），不要在页面里各开一条。
 */

const STREAM_PATH = '/v1/me/notifications/stream';

/** 文档给出的重连退避序列。 */
const DEFAULT_BACKOFF_MS = [5_000, 10_000, 20_000, 40_000, 60_000] as const;
/** 收到 `reconnect` 后马上重连，只留一点时间让服务端关掉旧连接。 */
const DEFAULT_RECONNECT_DELAY_MS = 500;
/** 心跳每 25 秒一次；45 秒没有字节就认为中间层把连接挂死了。 */
const DEFAULT_IDLE_TIMEOUT_MS = 45_000;

export type NotificationStreamErrorKind = 'auth' | 'http' | 'network' | 'timeout';

export class NotificationStreamError extends Error {
  constructor(
    message: string,
    readonly kind: NotificationStreamErrorKind,
    readonly status: number | null = null,
    readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = 'NotificationStreamError';
  }
}

export interface NotificationStreamHandlers {
  /** 握手成功（每次重连成功都会回调）。 */
  onReady?: (unreadCount: number | null) => void;
  /**
   * 有新通知。`unreadCount` 是帧里自带的未读数（没有则为 `null`）：
   * 有就不要再请求 `unread-count`，没有才自己去拉。
   */
  onNotification?: (unreadCount: number | null) => void;
  /** 服务端要求主动重连（正常节奏，不是故障）。 */
  onReconnect?: () => void;
  /** 每次建连失败 / 断流都会回调。`kind === 'auth'` 表示循环已经停下。 */
  onError?: (error: NotificationStreamError) => void;
}

export interface NotificationStreamTiming {
  backoffMs?: readonly number[];
  reconnectDelayMs?: number;
  idleTimeoutMs?: number;
}

export interface NotificationStream {
  close(): void;
}

interface StreamTiming {
  backoffMs: readonly number[];
  reconnectDelayMs: number;
  idleTimeoutMs: number;
}

interface StreamResult {
  kind: 'reconnect' | 'ended';
}

function normalizeTiming(timing: NotificationStreamTiming = {}): StreamTiming {
  const backoff = timing.backoffMs?.filter((value) => Number.isFinite(value) && value >= 0);
  return {
    backoffMs: backoff && backoff.length > 0 ? backoff : DEFAULT_BACKOFF_MS,
    reconnectDelayMs: timing.reconnectDelayMs ?? DEFAULT_RECONNECT_DELAY_MS,
    idleTimeoutMs: timing.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS,
  };
}

function retryDelay(timing: StreamTiming, failures: number): number {
  const index = Math.min(Math.max(failures - 1, 0), timing.backoffMs.length - 1);
  return timing.backoffMs[index] ?? DEFAULT_BACKOFF_MS[0] ?? 5_000;
}

function toStreamError(error: unknown): NotificationStreamError {
  if (error instanceof NotificationStreamError) return error;
  if (error instanceof AuthError) {
    return new NotificationStreamError(
      error.message,
      error.code === 'network' ? 'network' : 'auth',
      error.status,
    );
  }
  return new NotificationStreamError('通知长连接出错', 'network');
}

interface StreamFrame {
  /** 帧类型；不是 JSON 或没有 `type` 时按未知事件忽略。 */
  type: string | null;
  /** 帧里自带的未读数；契约只保证 `type`，所以没有就是 `null`。 */
  unreadCount: number | null;
}

function readFrame(data: string): StreamFrame {
  const unknown: StreamFrame = { type: null, unreadCount: null };
  try {
    const parsed: unknown = JSON.parse(data);
    if (!parsed || typeof parsed !== 'object') return unknown;
    const bag = parsed as { type?: unknown; unread_count?: unknown; count?: unknown };
    const raw = bag.unread_count ?? bag.count;
    // `Number(null)` 是 0，会把角标清零；只接受数字或数字字符串。
    const value =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && raw.trim() !== ''
          ? Number(raw)
          : Number.NaN;
    const count = Math.floor(value);
    return {
      type: typeof bag.type === 'string' ? bag.type : null,
      unreadCount: Number.isFinite(count) && count >= 0 ? count : null,
    };
  } catch {
    // 未知帧忽略，不要因为一条脏数据断开整条连接。
    return unknown;
  }
}

async function readErrorEnvelope(response: Response): Promise<Envelope<unknown> | null> {
  try {
    return (await response.json()) as Envelope<unknown>;
  } catch {
    return null;
  }
}

/** 发起一次连接，读到流结束 / 收到 `reconnect` 才返回。 */
async function requestStream(
  token: string,
  signal: AbortSignal,
): Promise<Response> {
  try {
    return await fetch(`${API_BASE}${STREAM_PATH}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'text/event-stream',
      },
      credentials: 'omit',
      cache: 'no-store',
      signal,
    });
  } catch (error) {
    if (signal.aborted) {
      throw new NotificationStreamError('通知长连接已中断', 'timeout');
    }
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new NotificationStreamError('通知长连接已中止', 'timeout');
    }
    throw new NotificationStreamError('连不上服务器，请检查网络后重试', 'network');
  }
}

async function readToken(): Promise<string> {
  const token = await getAccessToken();
  if (!token) throw new NotificationStreamError('未登录，无法建立通知长连接', 'auth');
  return token;
}

export function openNotificationStream(
  handlers: NotificationStreamHandlers = {},
  timing: NotificationStreamTiming = {},
): NotificationStream {
  const config = normalizeTiming(timing);

  let closed = false;
  /** 连续失败次数；收到 ready / reconnect 后清零。 */
  let failures = 0;
  let attemptController: AbortController | null = null;
  let sleepTimer: ReturnType<typeof setTimeout> | null = null;
  let wakeFromSleep: (() => void) | null = null;

  const close = (): void => {
    if (closed) return;
    closed = true;
    attemptController?.abort();
    if (sleepTimer !== null) {
      clearTimeout(sleepTimer);
      sleepTimer = null;
    }
    const wake = wakeFromSleep;
    wakeFromSleep = null;
    wake?.();
  };

  const sleep = (ms: number): Promise<void> =>
    new Promise((resolve) => {
      if (closed) {
        resolve();
        return;
      }
      wakeFromSleep = resolve;
      sleepTimer = setTimeout(() => {
        sleepTimer = null;
        wakeFromSleep = null;
        resolve();
      }, ms);
    });

  const readFrames = async (
    body: ReadableStream<Uint8Array>,
    controller: AbortController,
  ): Promise<StreamResult> => {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    let idleTimer: ReturnType<typeof setTimeout> | null = null;
    let idledOut = false;

    const armIdleTimer = (): void => {
      if (idleTimer !== null) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => {
        idledOut = true;
        controller.abort();
      }, config.idleTimeoutMs);
    };

    armIdleTimer();
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return { kind: 'ended' };

        armIdleTimer();
        for (const frame of parser.push(decoder.decode(value, { stream: true }))) {
          const { type, unreadCount } = readFrame(frame.data);
          if (type === 'ready') {
            failures = 0;
            handlers.onReady?.(unreadCount);
          } else if (type === 'notification_update') {
            handlers.onNotification?.(unreadCount);
          } else if (type === 'reconnect') {
            return { kind: 'reconnect' };
          }
          // 未知 type：按文档要求忽略。
        }
      }
    } catch (error) {
      if (closed) return { kind: 'ended' };
      if (idledOut) {
        throw new NotificationStreamError('45 秒没收到数据，主动重连', 'timeout');
      }
      if (error instanceof NotificationStreamError) throw error;
      throw new NotificationStreamError('通知长连接读取失败', 'network');
    } finally {
      if (idleTimer !== null) clearTimeout(idleTimer);
      parser.reset();
      // 断开后把 socket 立刻释放，别让旧连接占着「每用户 10 条」的名额。
      void reader.cancel().catch(() => undefined);
    }
  };

  const connect = async (): Promise<StreamResult> => {
    const controller = new AbortController();
    attemptController = controller;

    try {
      let token = await readToken();
      let response = await requestStream(token, controller.signal);

      if (response.status === 401) {
        // 与 lib/api.ts 一致：先刷新一次，成功就用新令牌重试；失败才清掉登录态。
        const refreshed = await refreshTokens();
        if (!refreshed) {
          await tokensItem.setValue(null);
          throw new NotificationStreamError('登录已过期，请重新授权', 'auth', 401);
        }
        token = refreshed.accessToken;
        response = await requestStream(token, controller.signal);
      }

      if (response.status === 401) {
        await tokensItem.setValue(null);
        throw new NotificationStreamError('登录已过期，请重新授权', 'auth', 401);
      }

      if (response.status === 403) {
        const payload = await readErrorEnvelope(response);
        throw new NotificationStreamError(
          payload?.m || '当前授权不能读取通知，请重新授权',
          'auth',
          403,
        );
      }

      if (!response.ok) {
        const payload = await readErrorEnvelope(response);
        const retryAfter =
          typeof payload?.retry_after === 'number' && payload.retry_after > 0
            ? payload.retry_after
            : null;
        throw new NotificationStreamError(
          payload?.m || `通知长连接建立失败（HTTP ${response.status}）`,
          'http',
          response.status,
          retryAfter,
        );
      }

      if (!response.body) {
        throw new NotificationStreamError('通知长连接没有可读的数据流', 'http', response.status);
      }

      return await readFrames(response.body, controller);
    } finally {
      if (attemptController === controller) attemptController = null;
      // 读完 / 收到 reconnect 后释放这条连接；close() 触发的 abort 也在这里收口。
      controller.abort();
    }
  };

  void (async () => {
    while (!closed) {
      try {
        const result = await connect();
        if (closed) return;

        if (result.kind === 'reconnect') {
          handlers.onReconnect?.();
          failures = 0;
          await sleep(config.reconnectDelayMs);
          continue;
        }

        // 服务端没发 reconnect 就结束了流：按异常退避重连。
        failures += 1;
        await sleep(retryDelay(config, failures));
      } catch (error) {
        if (closed) return;
        const streamError = toStreamError(error);
        handlers.onError?.(streamError);
        if (streamError.kind === 'auth') return;

        failures += 1;
        const delay =
          streamError.retryAfterSeconds !== null
            ? Math.max(streamError.retryAfterSeconds * 1000, 1_000)
            : retryDelay(config, failures);
        await sleep(delay);
      }
    }
  })();

  return { close };
}
