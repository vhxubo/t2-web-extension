import { describe, expect, test } from 'bun:test';
import { rewardPoolView } from './reward-pool';

describe('rewardPoolView', () => {
  test('没有金币池时返回 null', () => {
    expect(rewardPoolView(null)).toBeNull();
    expect(rewardPoolView(undefined)).toBeNull();
    expect(rewardPoolView({})).toBeNull();
    expect(rewardPoolView([])).toBeNull();
  });

  test('进行中的金币池展示剩余金币', () => {
    expect(rewardPoolView({ current_coins: 182, finished: false, is_expired: false })).toEqual({
      coins: 182,
      done: false,
      label: '金币池剩余 182 金币',
    });
  });

  test('已领完 / 已结束 / 已过期分别给出对应状态', () => {
    expect(rewardPoolView({ current_coins: 0, finished: false })).toEqual({
      coins: 0,
      done: true,
      label: '金币池已领完',
    });
    expect(rewardPoolView({ current_coins: 0, finished: true })).toEqual({
      coins: 0,
      done: true,
      label: '金币池已结束',
    });
    expect(rewardPoolView({ current_coins: 12, finished: true })).toEqual({
      coins: 12,
      done: true,
      label: '金币池已结束 · 剩余 12 金币',
    });
    expect(rewardPoolView({ current_coins: 50, is_expired: true })).toEqual({
      coins: 50,
      done: true,
      label: '金币池已过期',
    });
  });

  test('兼容数字字符串并忽略负数 / 非法值', () => {
    expect(rewardPoolView({ current_coins: '20.8' })?.coins).toBe(20);
    expect(rewardPoolView({ current_coins: -1 })).toBeNull();
    expect(rewardPoolView({ current_coins: 'abc' })).toBeNull();
  });
});
