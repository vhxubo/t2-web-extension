/**
 * 帖子金币池状态的解析（不依赖扩展运行时，方便 bun test）。
 *
 * 文档把状态写在 `extra.reward_pool`，线上实际在顶层 `reward_pool`；
 * 两处都读，任一存在就能展示。
 */

export interface RewardPool {
  current_coins?: number;
  finished?: boolean;
  is_expired?: boolean;
}

export interface RewardPoolView {
  coins: number;
  /** 是否已结束 / 已领完 / 已过期。 */
  done: boolean;
  /** 可直接展示的一行文案。 */
  label: string;
}

function poolCoins(value: unknown): number | null {
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && value.trim() !== ''
        ? Number(value)
        : Number.NaN;
  if (!Number.isFinite(num) || num < 0) return null;
  return Math.floor(num);
}

/**
 * 把接口的金币池对象归一成可展示的文案。
 *
 * 线上字段：`current_coins`（当前余额）、`finished`（是否已结束）、
 * `is_expired`（是否已过期）。未知字段一律忽略。
 */
export function rewardPoolView(pool: unknown): RewardPoolView | null {
  if (!pool || typeof pool !== 'object' || Array.isArray(pool)) return null;
  const record = pool as Record<string, unknown>;
  const coins = poolCoins(record.current_coins);
  if (coins === null) return null;

  if (record.is_expired === true) {
    return { coins, done: true, label: '金币池已过期' };
  }
  if (record.finished === true) {
    return {
      coins,
      done: true,
      label: coins > 0 ? `金币池已结束 · 剩余 ${coins} 金币` : '金币池已结束',
    };
  }
  if (coins <= 0) {
    return { coins, done: true, label: '金币池已领完' };
  }
  return { coins, done: false, label: `金币池剩余 ${coins} 金币` };
}
