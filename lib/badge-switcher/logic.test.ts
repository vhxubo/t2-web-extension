import { describe, expect, test } from 'bun:test';
import {
  activityGain,
  activityLabel,
  badgeCost,
  barModel,
  baseCost,
  classifyBadges,
  commentDiscount,
  findActivityBadge,
  isPostDetail,
  normalizeEquipped,
  optimalBadges,
  pandoraEffect,
  pctText,
  type BadgeAttributes,
  type PandoraBox,
  type UserBadge,
} from './logic';

function ub(id: string, name: string, attributes: BadgeAttributes): UserBadge {
  return { badge_id: id, badge: { id, name, attributes } };
}

const fixed8 = ub('front_hitter', '前排打手', { comment_cost: -8 });
const percent30 = ub('listen_to_me', '都听我说！', { comment_cost_percent: 0.3 });
const system30 = ub('balancer', '大平衡者', { coin_system_cost_percent: 0.3 });
const activity = ub('do_me_a_favor', '走个面', { daily_active_gain_percent: 0.2 });

const NOW = new Date('2026-01-01T00:00:00Z').getTime();

function pandoraBox(partial: Partial<PandoraBox>): PandoraBox {
  return {
    event_code: 'placeholder',
    apply_at: '2025-12-31T00:00:00Z',
    expire_at: '2026-01-02T00:00:00Z',
    ...partial,
  };
}

describe('baseCost', () => {
  test('按站点阶梯返回基础发评金币', () => {
    expect(baseCost(0)).toBe(10);
    expect(baseCost(100)).toBe(10);
    expect(baseCost(101)).toBe(30);
    expect(baseCost(1000)).toBe(30);
    expect(baseCost(1001)).toBe(60);
    expect(baseCost(2001)).toBe(120);
    expect(baseCost(5001)).toBe(200);
  });
});

describe('commentDiscount', () => {
  test('评论减免与金币系统减免都计入发评', () => {
    expect(commentDiscount(percent30)).toBe(0.3);
    expect(commentDiscount(system30)).toBe(0.3);
  });

  test('两者同时存在时按乘法叠加', () => {
    const both = ub('both', '叠加', {
      comment_cost_percent: 0.3,
      coin_system_cost_percent: 0.2,
    });
    expect(commentDiscount(both)).toBeCloseTo(1 - 0.7 * 0.8);
  });

  test('没有相关字段时返回 null', () => {
    expect(commentDiscount(activity)).toBeNull();
    expect(commentDiscount(null)).toBeNull();
  });
});

describe('badgeCost', () => {
  test('固定扣费覆盖基础阶梯', () => {
    expect(badgeCost(150, fixed8)).toBe(8);
  });

  test('减免徽章在阶梯上打折后取整', () => {
    expect(badgeCost(150, percent30)).toBe(21);
    expect(badgeCost(150, system30)).toBe(21);
  });

  test('未佩戴 / 无关徽章按基础阶梯', () => {
    expect(badgeCost(150, null)).toBe(30);
    expect(badgeCost(150, activity)).toBe(30);
  });
});

describe('classifyBadges', () => {
  test('两类徽章分别识别、排序，并忽略无关 attributes', () => {
    const pair = classifyBadges([percent30, activity, fixed8, system30]);
    expect(pair.fixed.map((b) => b.badge_id)).toEqual(['front_hitter']);
    expect(pair.percent.map((b) => b.badge_id)).toEqual(['listen_to_me', 'balancer']);
  });

  test('只带 badge.id 的条目补成 badge_id，重复项只留一份', () => {
    const pair = classifyBadges([
      { badge: { id: 'front_hitter', name: '前排打手', attributes: { comment_cost: -8 } } },
      fixed8,
    ]);
    expect(pair.fixed.map((b) => b.badge_id)).toEqual(['front_hitter']);
  });

  test('非数组输入返回空集合', () => {
    expect(classifyBadges(null)).toEqual({ fixed: [], percent: [] });
  });
});

describe('optimalBadges', () => {
  test('只返回比不戴更便宜、且并列最低的徽章', () => {
    const pair = classifyBadges([percent30, system30, fixed8]);
    // 150 字基础 30 金币：两枚 30% 都是 21，固定 8 更低。
    expect(optimalBadges(150, pair).map((b) => b.badge_id)).toEqual(['front_hitter']);
  });

  test('并重徽章同价时全部返回', () => {
    const pair = classifyBadges([percent30, system30]);
    expect(optimalBadges(150, pair).map((b) => b.badge_id)).toEqual([
      'listen_to_me',
      'balancer',
    ]);
  });

  test('没有更省的选择时返回空数组', () => {
    const pair = classifyBadges([activity]);
    expect(optimalBadges(150, pair)).toEqual([]);
  });
});

describe('pctText', () => {
  test('正数说减免、负数说增加', () => {
    expect(pctText(0.3)).toBe('减免 30%');
    expect(pctText(-0.2)).toBe('增加 20%');
  });
});

describe('barModel', () => {
  test('未佩戴且有更优固定徽章时给出切换动作', () => {
    const pair = classifyBadges([fixed8]);
    const model = barModel(150, pair, new Set());
    expect(model.count).toBe('150 字');
    expect(model.status).toBe('当前：未佩戴 · 发评约 30 金币');
    expect(model.hint).toBe('可省 22 金币');
    expect(model.actions).toHaveLength(1);
    expect(model.actions[0]?.label).toBe('前排打手 8 金币');
  });

  test('当前佩戴的减免徽章输给固定扣费时标红说明原因', () => {
    const pair = classifyBadges([fixed8, percent30]);
    const model = barModel(150, pair, new Set(['listen_to_me']));
    expect(model.warn).toBe(true);
    expect(model.hint).toBe('⚠️ 减免 30% 不如固定 8 金币');
    expect(model.actions[0]?.badge.badge_id).toBe('front_hitter');
  });

  test('并重徽章戴着其中一枚时，另一枚仍作为同价替换展示', () => {
    const pair = classifyBadges([percent30, system30]);
    const model = barModel(150, pair, new Set(['listen_to_me']));
    expect(model.hint).toBe('✓ 当前最省');
    expect(model.actions.map((a) => a.badge.badge_id)).toEqual(['balancer']);
  });

  test('多枚费用徽章同戴只提醒、不给动作', () => {
    const pair = classifyBadges([fixed8, percent30]);
    const model = barModel(150, pair, new Set(['front_hitter', 'listen_to_me']));
    expect(model.warn).toBe(true);
    expect(model.hint).toContain('多枚同戴');
    expect(model.actions).toEqual([]);
  });
});

describe('pandoraEffect', () => {
  test('过期或不生效的盒子返回 active=false', () => {
    expect(pandoraEffect(null, NOW).active).toBe(false);
    expect(
      pandoraEffect(
        pandoraBox({ event_code: 'badge_drop_lock', expire_at: '2025-12-31T23:59:59Z' }),
        NOW,
      ).active,
    ).toBe(false);
  });

  test('v1 的 open_at 未到视为待生效', () => {
    expect(
      pandoraEffect(
        { event_code: 'flip', open_at: '2026-01-01T01:00:00Z', expire_at: '2026-01-02T01:00:00Z' },
        NOW,
      ).active,
    ).toBe(false);
    expect(
      pandoraEffect(
        { event_code: 'flip', open_at: '2025-12-31T01:00:00Z', expire_at: '2026-01-02T01:00:00Z' },
        NOW,
      ).active,
    ).toBe(true);
  });

  test('回归起点标记徽章锁定', () => {
    const effect = pandoraEffect(pandoraBox({ event_code: 'badge_drop_lock' }), NOW);
    expect(effect.active).toBe(true);
    expect(effect.lockBadge).toBe(true);
  });

  test('妙笔生花解析固定费用', () => {
    const effect = pandoraEffect(
      pandoraBox({
        event_code: 'fixed_text_cost',
        event_title: '评论固定为 12 金币',
        event_name: '妙笔生花',
      }),
      NOW,
    );
    expect(effect.fixedCost).toBe(12);
  });

  test('多说多写读取 comment_constraint.min_length', () => {
    const effect = pandoraEffect(
      pandoraBox({
        event_code: 'comment_min_length',
        comment_constraint: { min_length: 20 },
      }),
      NOW,
    );
    expect(effect.minLength).toBe(20);
  });

  test('小表情要求包含自定义表情', () => {
    const effect = pandoraEffect(
      pandoraBox({ event_code: 'comment_custom_emoji_required' }),
      NOW,
    );
    expect(effect.needEmoji).toBe(true);
  });
});

describe('潘多拉事件优先于徽章', () => {
  test('徽章锁定时不展示切换动作', () => {
    const pair = classifyBadges([fixed8]);
    const model = barModel(150, pair, new Set(), {
      active: true,
      name: '回归起点',
      lockBadge: true,
    });
    expect(model.warn).toBe(true);
    expect(model.status).toContain('徽章已掉落锁定');
    expect(model.actions).toEqual([]);
  });

  test('固定费用事件下徽章不参与计算', () => {
    const pair = classifyBadges([fixed8]);
    const model = barModel(150, pair, new Set(), {
      active: true,
      name: '妙笔生花',
      fixedCost: 12,
    });
    expect(model.status).toContain('发评固定 12 金币');
    expect(model.hint).toBe('潘多拉已固定费用，徽章不参与计算');
    expect(model.actions).toEqual([]);
  });

  test('多说多写未达字数时把字数门槛写进读数区', () => {
    const pair = classifyBadges([fixed8]);
    const model = barModel(5, pair, new Set(), {
      active: true,
      name: '多说多写',
      minLength: 20,
    });
    expect(model.count).toBe('5/20 字');
    expect(model.warn).toBe(true);
    expect(model.hint).toContain('还差 15 字');
  });
});

describe('工具函数', () => {
  test('normalizeEquipped 兼容两种形态', () => {
    expect(
      normalizeEquipped([
        { badge_id: 'a' },
        { badge: { id: 'b' } },
        { badge: {} },
      ]),
    ).toEqual(['a', 'b']);
    expect(normalizeEquipped(null)).toEqual([]);
  });

  test('isPostDetail 只认帖子详情页', () => {
    expect(isPostDetail('/post/work/abc')).toBe(true);
    expect(isPostDetail('/post-flat/work/abc')).toBe(true);
    expect(isPostDetail('/post/latest')).toBe(false);
    expect(isPostDetail('/post/hot')).toBe(false);
    expect(isPostDetail('/latest')).toBe(false);
  });
});

describe('走个面活跃度徽章', () => {
  test('从徽章列表里识别并换算加成', () => {
    const found = findActivityBadge([fixed8, activity]);
    expect(found?.badge_id).toBe('do_me_a_favor');
    expect(activityGain(found)).toBe(20);
  });

  test('兼容百分数形态与按钮文案', () => {
    const asPercent = ub('do_me_a_favor', '走个面', { daily_active_gain_percent: 20 });
    expect(activityGain(asPercent)).toBe(20);
    expect(activityLabel(asPercent, false)).toBe('走个面 +20%');
    expect(activityLabel(asPercent, true)).toBe('✓ 走个面 +20%');
  });
});
