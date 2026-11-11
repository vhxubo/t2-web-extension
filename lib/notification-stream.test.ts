import { afterEach, beforeEach, describe, expect, mock, test } from 'bun:test';

/**
 * 用假的 auth / storage / fetch 验证长连接的协议处理：
 * 事件解析、reconnect、401 刷新、致命授权错误与 close 语义。
 * 真实的退避时间通过 timing 参数缩短，测试不会真的等 5 秒。
 */

type TokenRead = () => Promise<string | null>;
type TokenRefresh = () => Promise<{ accessToken: string } | null>;

let token: string | null = 'old-token';
let refreshed: string | null = null;
let cleared = 0;

class FakeAuthError extends Error {
  constructor(
    message: string,
    readonly code: string = 'token',
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

mock.module('./auth', () => ({
  AuthError: FakeAuthError,
  getAccessToken: (async () => token) as TokenRead,
  refreshTokens: (async () => (refreshed ? { accessToken: refreshed } : null)) as TokenRefresh,
}));

mock.module('./storage', () => ({
  tokensItem: {
    getValue: async () => null,
    setValue: async (value: unknown) => {
      if (value === null) cleared += 1;
    },
    watch: () => () => undefined,
  },
}));

const { NotificationStreamError, openNotificationStream } = await import('./notification-stream');

const encoder = new TextEncoder();

interface OpenFeed {
  body: ReadableStream<Uint8Array>;
  push: (chunk: string) => void;
  close: () => void;
}

/** 一条不会自己结束的事件流；测试手动 push / close。 */
function openFeed(initial = ''): OpenFeed {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const body = new ReadableStream<Uint8Array>({
    start(next) {
      controller = next;
      if (initial) next.enqueue(encoder.encode(initial));
    },
  });
  return {
    body,
    push: (chunk) => controller?.enqueue(encoder.encode(chunk)),
    close: () => controller?.close(),
  };
}

interface Call {
  headers: Headers;
  url: string;
}

let calls: Call[] = [];
let feeds: OpenFeed[] = [];
let fetchQueue: Array<(signal: AbortSignal | null) => Response | Promise<Response>> = [];

const fakeFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const request = new Request(input, init);
  calls.push({ headers: request.headers, url: request.url });
  const next = fetchQueue.shift();
  if (!next) throw new Error('unexpected fetch');
  return next(init?.signal ?? null);
}) as typeof fetch;

const originalFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  feeds = [];
  token = 'old-token';
  refreshed = null;
  cleared = 0;
  globalThis.fetch = fakeFetch;
});

afterEach(() => {
  for (const feed of feeds) {
    try {
      feed.close();
    } catch {
      // 已经关闭。
    }
  }
  globalThis.fetch = originalFetch;
});

/** 等一个由回调触发的信号，超时则让测试失败。 */
function signal(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

const timing = { backoffMs: [10], reconnectDelayMs: 0, idleTimeoutMs: 1_000 };

describe('openNotificationStream', () => {
  test('parses ready / notification_update and stops after close', async () => {
    const feed = openFeed();
    feeds.push(feed);
    fetchQueue.push(() => new Response(feed.body, { status: 200 }));

    const ready = signal();
    const notified = signal();
    const counts: Array<number | null> = [];
    const errors: unknown[] = [];
    const stream = openNotificationStream(
      {
        onReady: (unreadCount) => {
          counts.push(unreadCount);
          ready.resolve();
        },
        onNotification: (unreadCount) => {
          counts.push(unreadCount);
          notified.resolve();
        },
        onError: (error) => errors.push(error),
      },
      timing,
    );

    feed.push('data: {"type":"ready"}\n\n');
    await ready.promise;

    feed.push('data: {"type":"notification_update"}\n\n');
    await notified.promise;

    stream.close();
    expect(counts).toEqual([null, null]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers.get('accept')).toBe('text/event-stream');
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer old-token');
    expect(calls[0]?.url).toEndWith('/v1/me/notifications/stream');
    expect(errors).toHaveLength(0);
  });

  test('passes the unread count carried by a frame', async () => {
    const feed = openFeed();
    feeds.push(feed);
    fetchQueue.push(() => new Response(feed.body, { status: 200 }));

    const ready = signal();
    const notified = signal();
    const counts: Array<number | null> = [];
    const stream = openNotificationStream(
      {
        onReady: (unreadCount) => {
          counts.push(unreadCount);
          ready.resolve();
        },
        onNotification: (unreadCount) => {
          counts.push(unreadCount);
          notified.resolve();
        },
      },
      timing,
    );

    feed.push('data: {"type":"ready","unread_count":2}\n\n');
    await ready.promise;
    feed.push('data: {"type":"notification_update","count":5}\n\n');
    await notified.promise;

    stream.close();
    expect(counts).toEqual([2, 5]);
  });

  test('reconnects when the server sends a reconnect frame', async () => {
    const feed = openFeed('data: {"type":"reconnect"}\n\n');
    const next = openFeed('data: {"type":"ready"}\n\n');
    feeds.push(feed, next);
    fetchQueue.push(() => new Response(feed.body, { status: 200 }));
    fetchQueue.push(() => new Response(next.body, { status: 200 }));

    let reconnects = 0;
    const ready = signal();
    const stream = openNotificationStream(
      {
        onReconnect: () => {
          reconnects += 1;
        },
        onReady: ready.resolve,
      },
      timing,
    );

    await ready.promise;
    expect(reconnects).toBe(1);
    expect(calls).toHaveLength(2);

    stream.close();
  });

  test('refreshes the token once after a 401', async () => {
    refreshed = 'new-token';
    const feed = openFeed('data: {"type":"ready"}\n\n');
    feeds.push(feed);
    fetchQueue.push(
      () =>
        new Response('{"c":401,"code":"unauthorized","m":"expired"}', {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );
    fetchQueue.push(() => new Response(feed.body, { status: 200 }));

    const ready = signal();
    const stream = openNotificationStream({ onReady: ready.resolve }, timing);
    await ready.promise;

    expect(calls).toHaveLength(2);
    expect(calls[0]?.headers.get('authorization')).toBe('Bearer old-token');
    expect(calls[1]?.headers.get('authorization')).toBe('Bearer new-token');

    stream.close();
  });

  test('stops retrying on a fatal 403', async () => {
    const errors: NotificationStreamError[] = [];
    fetchQueue.push(
      () =>
        new Response('{"c":403,"code":"insufficient_scope","m":"missing scope"}', {
          status: 403,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const failed = signal();
    const stream = openNotificationStream(
      {
        onError: (error) => {
          errors.push(error);
          failed.resolve();
        },
      },
      timing,
    );

    await failed.promise;
    expect(errors[0]?.kind).toBe('auth');
    expect(calls).toHaveLength(1);

    stream.close();
  });

  test('clears the token when a 401 cannot be refreshed', async () => {
    refreshed = null;
    const errors: NotificationStreamError[] = [];
    fetchQueue.push(
      () =>
        new Response('{"c":401,"code":"unauthorized","m":"expired"}', {
          status: 401,
          headers: { 'content-type': 'application/json' },
        }),
    );

    const failed = signal();
    const stream = openNotificationStream(
      {
        onError: (error) => {
          errors.push(error);
          failed.resolve();
        },
      },
      timing,
    );

    await failed.promise;
    expect(errors[0]?.kind).toBe('auth');
    expect(cleared).toBe(1);
    // 第一次 401 只打开了一次连接，刷新失败后不再建连。
    expect(calls).toHaveLength(1);

    stream.close();
  });

  test('honours retry_after on 429', async () => {
    const errors: NotificationStreamError[] = [];
    fetchQueue.push(
      () =>
        new Response('{"c":429,"code":"rate_limited","m":"slow down","retry_after":1}', {
          status: 429,
          headers: { 'content-type': 'application/json' },
        }),
    );
    const feed = openFeed('data: {"type":"ready"}\n\n');
    feeds.push(feed);
    fetchQueue.push(() => new Response(feed.body, { status: 200 }));

    const ready = signal();
    const stream = openNotificationStream(
      {
        onReady: ready.resolve,
        onError: (error) => errors.push(error),
      },
      timing,
    );

    await ready.promise;
    expect(errors[0]?.status).toBe(429);
    expect(errors[0]?.retryAfterSeconds).toBe(1);
    expect(calls).toHaveLength(2);

    stream.close();
  });

  test('close cancels the pending retry', async () => {
    const errors: NotificationStreamError[] = [];
    fetchQueue.push(() => {
      throw new TypeError('network down');
    });

    const failed = signal();
    const stream = openNotificationStream(
      {
        onError: (error) => {
          errors.push(error);
          failed.resolve();
        },
      },
      { backoffMs: [1_000], reconnectDelayMs: 0, idleTimeoutMs: 1_000 },
    );

    await failed.promise;
    stream.close();
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(errors[0]?.kind).toBe('network');
    expect(calls).toHaveLength(1);
  });
});
