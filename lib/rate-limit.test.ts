import { describe, expect, test } from 'bun:test';
import {
  MAX_CONCURRENT,
  MIN_GAP_MS,
  RateLimitError,
  cooldownRemainingMs,
  noteRateLimit,
  withSlot,
} from './rate-limit';

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('withSlot', () => {
  test('caps concurrency and paces request starts', async () => {
    let active = 0;
    let peak = 0;
    const starts: number[] = [];

    await Promise.all(
      Array.from({ length: 8 }, () =>
        withSlot(undefined, async () => {
          starts.push(Date.now());
          active += 1;
          peak = Math.max(peak, active);
          await wait(200);
          active -= 1;
        }),
      ),
    );

    expect(starts).toHaveLength(8);
    expect(peak).toBeLessThanOrEqual(MAX_CONCURRENT);
    for (let i = 1; i < starts.length; i += 1) {
      expect((starts[i] ?? 0) - (starts[i - 1] ?? 0)).toBeGreaterThanOrEqual(MIN_GAP_MS - 20);
    }
  });

  test('drops a queued request when its signal aborts', async () => {
    // 先把 4 个槽位占满，第 5 个请求只能排队。
    const busy = Array.from({ length: MAX_CONCURRENT }, () => withSlot(undefined, () => wait(300)));
    const controller = new AbortController();
    const queued = withSlot(controller.signal, () => wait(1));
    await wait(20);
    controller.abort();

    let name = '';
    await queued.catch((error: unknown) => {
      name = error instanceof Error ? error.name : '';
    });
    expect(name).toBe('AbortError');
    await Promise.all(busy);
  });
});

describe('429 cooldown', () => {
  test('rejects without hitting the network until retry_after passes', async () => {
    noteRateLimit(30);
    expect(cooldownRemainingMs()).toBeGreaterThan(0);

    let error: unknown = null;
    let ran = false;
    await withSlot(undefined, async () => {
      ran = true;
    }).catch((cause: unknown) => {
      error = cause;
    });

    expect(ran).toBe(false);
    expect(error).toBeInstanceOf(RateLimitError);
    expect((error as RateLimitError).retryAfterMs).toBeGreaterThan(0);
  });
});
