/**
 * 接口预算保护：所有开放 API 请求都从这里排队发出。
 *
 * 文档给的额度是「登录 600 次/小时（≈10 次/分）、匿名 60 次/分」，而扩展一挂载
 * 就会同时拉若干张卡片、节点树和未读数，突发最容易撞限流。这里做三件事：
 *
 * 1. 全局并发上限 + 启动间隔，把「瞬间 N 个请求」摊平；
 * 2. 收到 429 后进入冷却，冷却期内直接失败、不再把请求发给服务端；
 * 3. 冷却时长优先用服务端给的 `retry_after`，没有就用一个保守的默认值。
 *
 * 排队只针对普通请求，通知长连接（SSE）不经过这里。
 *
 * ponytail: 队列与冷却都是进程内状态（弹窗 / 仪表盘 / 后台各一份）。需要跨页面
 * 共享限流额度时，再把队列挪到后台 service worker 用 runtime 消息调度。
 */

/** 同时最多 4 个在途请求：节点树子节点拉取原本就是这个量级。 */
export const MAX_CONCURRENT = 4;
/** 两次请求启动之间的最小间隔，避免同一帧里所有卡片一起发。 */
export const MIN_GAP_MS = 120;
/** 429 没带 retry_after 时的冷却时长。 */
const DEFAULT_COOLDOWN_MS = 15_000;

export class RateLimitError extends Error {
  constructor(readonly retryAfterMs: number) {
    super('接口限流冷却中');
    this.name = 'RateLimitError';
  }
}

interface Waiter {
  signal?: AbortSignal;
  grant: () => void;
}

const queue: Waiter[] = [];
let active = 0;
let lastStart = 0;
let blockedUntil = 0;
let timer: ReturnType<typeof setTimeout> | null = null;

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function pump(): void {
  if (timer !== null) return;

  while (queue.length > 0) {
    if (active >= MAX_CONCURRENT) return;

    const wait = lastStart + MIN_GAP_MS - Date.now();
    if (wait > 0) {
      timer = setTimeout(() => {
        timer = null;
        pump();
      }, wait);
      return;
    }

    const next = queue.shift();
    if (!next) return;
    // 排队期间被调用方取消的请求不再占槽位。
    if (next.signal?.aborted) continue;

    active += 1;
    lastStart = Date.now();
    next.grant();
  }
}

function acquire(signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError());
      return;
    }

    const waiter: Waiter = {
      signal,
      grant: () => {
        signal?.removeEventListener('abort', onAbort);
        resolve();
      },
    };
    const onAbort = () => {
      const index = queue.indexOf(waiter);
      if (index !== -1) queue.splice(index, 1);
      reject(abortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
    queue.push(waiter);
    pump();
  });
}

/** 距离限流冷却结束还有多少毫秒。 */
export function cooldownRemainingMs(): number {
  return Math.max(0, blockedUntil - Date.now());
}

/** 记一次 429，把冷却推到 retry_after 之后；返回冷却截止时间。 */
export function noteRateLimit(retryAfterSeconds: number | null): number {
  const ms =
    retryAfterSeconds !== null
      ? Math.max(retryAfterSeconds * 1000, 1_000)
      : DEFAULT_COOLDOWN_MS;
  blockedUntil = Math.max(blockedUntil, Date.now() + ms);
  return blockedUntil;
}

/**
 * 拿到一个并发槽位后执行 `run`。
 * 冷却期内、以及排队期间别人撞上 429 时，直接抛 `RateLimitError`，不发请求。
 */
export async function withSlot<T>(
  signal: AbortSignal | undefined,
  run: () => Promise<T>,
): Promise<T> {
  if (cooldownRemainingMs() > 0) throw new RateLimitError(cooldownRemainingMs());

  await acquire(signal);
  try {
    const cooling = cooldownRemainingMs();
    if (cooling > 0) throw new RateLimitError(cooling);
    return await run();
  } finally {
    active -= 1;
    pump();
  }
}
