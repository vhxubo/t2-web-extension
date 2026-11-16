/**
 * 2libra 评论徽章助手的纯逻辑。
 *
 * 这段逻辑来自油猴脚本 `2libra-badge-switcher.user.js`（v1.6.7），
 * 只保留与 DOM / 网络无关的计算，便于单元测试；页面注入见
 * `entrypoints/badge-switcher.content.ts`。
 *
 * 任务：在帖子评论框上方给出「当前字数下最省金币的徽章」建议，
 * 并识别潘多拉事件对评论费用的覆盖规则。
 */

/** 徽章 attributes 里与评论费用 / 活跃度相关的字段。 */
export interface BadgeAttributes {
  /** 固定扣费（负数表示扣除），如「前排打手」的 -8。 */
  comment_cost?: number;
  /** 评论专属减免比例，0.3 = 发评省 30%（「都听我说！」）。 */
  comment_cost_percent?: number;
  /** 金币系统普适减免比例，「大平衡者」的 0.3 也计入发评。 */
  coin_system_cost_percent?: number;
  /** 每日活跃度加成比例，0.2 = +20%（「走个面」）。 */
  daily_active_gain_percent?: number;
  badge_name?: string;
}

export interface Badge {
  id?: string;
  name?: string;
  attributes?: BadgeAttributes | null;
}

/** `/v1/me/badges` 与 `/v1/me/badges/equipped` 的条目。 */
export interface UserBadge {
  badge_id?: string;
  badge?: Badge | null;
}

/** 两类会改变评论金币的徽章；同类可能多枚。 */
export interface BadgePair {
  fixed: UserBadge[];
  percent: UserBadge[];
}

/** 潘多拉盒子（`/v1/pandora/today` 的 `d.box`）。只声明用到的字段。 */
export interface PandoraBox {
  /** v1 文档字段；旧接口用 apply_at。 */
  open_at?: string;
  apply_at?: string;
  event_code?: string;
  event_name?: string;
  event_title?: string;
  rolled_value?: number;
  expire_at?: string;
  expires_at?: string;
  payload?: PandoraBox | null;
  /** 旧接口 / 站内版本带过的约束；v1 文档未列出，保留兜底解析。 */
  comment_constraint?: {
    min_length?: number;
    custom_emoji_required?: boolean;
  } | null;
}

/** `pandoraEffect` 的解析结果；未生效时只有 `active: false`。 */
export interface PandoraEffect {
  active: boolean;
  code?: string;
  name?: string;
  expireAt?: string | null;
  /** 「回归起点」：徽章全部掉落且锁定，无法佩戴。 */
  lockBadge?: boolean;
  /** 「妙笔生花」：发评固定为 N 金币。 */
  fixedCost?: number | null;
  /** 事件文案明确写着「不扣除金币」。 */
  freeComment?: boolean;
  /** 「金币升降机」等评论消费类事件的比例修正。 */
  modifierPct?: number | null;
  /** 「多说多写」等事件要求的最小字数。 */
  minLength?: number | null;
  /** 「小表情」：评论需包含自定义表情。 */
  needEmoji?: boolean;
}

export interface BarAction {
  type: 'switch';
  badge: UserBadge;
  label: string;
  title: string;
}

/** 状态栏展示模型。 */
export interface BarModel {
  count: string;
  status: string;
  hint: string;
  warn: boolean;
  actions: BarAction[];
}

/* ------------------------------------------------------------------
   计费
------------------------------------------------------------------ */

/** 基础扣费阶梯，镜像站点前端 `COIN_COST.comment`：字数越多扣越多。 */
export function baseCost(len: number): number {
  return len > 5000 ? 200 : len > 2000 ? 120 : len > 1000 ? 60 : len > 100 ? 30 : 10;
}

/**
 * 某枚徽章对「发评金币」的减免比例，无减免字段时返回 null。
 *
 * - `comment_cost_percent`：评论专属减免；
 * - `coin_system_cost_percent`：金币系统普适减免（「大平衡者」也计入发评）。
 *
 * 两者同时存在时按乘法叠加（站内暂无这种徽章，防御性处理）。
 */
export function commentDiscount(ub: UserBadge | null | undefined): number | null {
  const attr = ub?.badge?.attributes;
  if (!attr) return null;
  const own = attr.comment_cost_percent;
  const sys = attr.coin_system_cost_percent;
  const hasOwn = typeof own === 'number' && Number.isFinite(own);
  const hasSys = typeof sys === 'number' && Number.isFinite(sys);
  if (hasOwn && hasSys) {
    const o = own as number;
    const s = sys as number;
    return 1 - (1 - o) * (1 - s);
  }
  if (hasOwn) return own as number;
  if (hasSys) return sys as number;
  return null;
}

/**
 * 某枚徽章下发表评论的预计扣费：
 * - 固定扣费徽章直接覆盖阶梯；
 * - 减免徽章在阶梯上打折；
 * - 其他 / 未佩戴不影响基础扣费。
 */
export function badgeCost(len: number, ub: UserBadge | null | undefined): number {
  const attr = ub?.badge?.attributes;
  if (!attr) return baseCost(len);
  if (typeof attr.comment_cost === 'number') return Math.abs(attr.comment_cost);
  const off = commentDiscount(ub);
  if (off != null) return Math.round(baseCost(len) * (1 - off));
  return baseCost(len);
}

/** 统一把条目归一化成带 `badge_id` 的形态，避免发出 `badge_id: undefined`。 */
export function badgeIdOf(ub: UserBadge | null | undefined): string {
  if (!ub) return '';
  if (typeof ub.badge_id === 'string') return ub.badge_id;
  if (ub.badge && typeof ub.badge.id === 'string') return ub.badge.id;
  return '';
}

export function withBadgeId(ub: UserBadge): UserBadge {
  const id = badgeIdOf(ub);
  return id && ub.badge_id !== id ? { ...ub, badge_id: id } : ub;
}

export function badgeName(ub: UserBadge | null | undefined): string {
  return ub?.badge?.name || ub?.badge?.attributes?.badge_name || '徽章';
}

/**
 * 从 `/v1/me/badges` 的列表里挑出两类评论费用徽章。
 *
 * 只认 `comment_cost` / `comment_cost_percent` / `coin_system_cost_percent`，
 * 站内其他 attributes（float_percent、daily_active_gain_percent 等）不会被误判。
 */
export function classifyBadges(list: unknown): BadgePair {
  const out: BadgePair = { fixed: [], percent: [] };
  const seen = new Set<string>();
  if (!Array.isArray(list)) return out;

  for (const raw of list as UserBadge[]) {
    const ub = withBadgeId(raw);
    const attr = ub?.badge?.attributes;
    const id = badgeIdOf(ub);
    if (!attr || !id || seen.has(id)) continue;
    if (typeof attr.comment_cost === 'number') {
      out.fixed.push(ub);
      seen.add(id);
      continue;
    }
    if (commentDiscount(ub) != null) {
      out.percent.push(ub);
      seen.add(id);
    }
  }

  out.fixed.sort(
    (a, b) =>
      Math.abs(a.badge?.attributes?.comment_cost ?? 0) -
      Math.abs(b.badge?.attributes?.comment_cost ?? 0),
  );
  out.percent.sort((a, b) => (commentDiscount(b) ?? 0) - (commentDiscount(a) ?? 0));
  return out;
}

/** 两类徽章拍平成一个候选池。 */
export function costBadges(p: BadgePair | null | undefined): UserBadge[] {
  return [...(p?.fixed ?? []), ...(p?.percent ?? [])].filter(Boolean);
}

/** 徽章比例的中文描述：0.3 → 「减免 30%」，-0.2 → 「增加 20%」。 */
export function pctText(ratio: number): string {
  const pct = Math.round(ratio * 100);
  return pct >= 0 ? `减免 ${pct}%` : `增加 ${-pct}%`;
}

/** 当前字数下真正能省的「最优解」集合；比不戴更贵时返回空数组。 */
export function optimalBadges(len: number, p: BadgePair): UserBadge[] {
  const cands = costBadges(p);
  if (!cands.length) return [];
  const min = Math.min(...cands.map((b) => badgeCost(len, b)));
  if (min >= baseCost(len)) return [];
  return cands.filter((b) => badgeCost(len, b) === min);
}

/** 当前佩戴的费用徽章（站点通常只戴一枚）。 */
export function wornCostBadges(p: BadgePair, eq: ReadonlySet<string>): UserBadge[] {
  return costBadges(p).filter((b) => eq.has(badgeIdOf(b)));
}

/* ------------------------------------------------------------------
   「走个面」活跃度徽章（与评论费用无关）
------------------------------------------------------------------ */

const ACTIVITY_BADGE_ID = 'do_me_a_favor';
const ACTIVITY_BADGE_NAME = '走个面';

export function isActivityBadge(badge: Badge | null | undefined): boolean {
  if (!badge) return false;
  const attr = badge.attributes ?? {};
  if (typeof attr.daily_active_gain_percent === 'number') return true;
  const name = String(badge.name || attr.badge_name || '');
  return badge.id === ACTIVITY_BADGE_ID || name.includes(ACTIVITY_BADGE_NAME);
}

export function findActivityBadge(list: unknown): UserBadge | null {
  if (!Array.isArray(list)) return null;
  for (const raw of list as UserBadge[]) {
    const ub = withBadgeId(raw);
    if (badgeIdOf(ub) && isActivityBadge(ub.badge)) return ub;
  }
  return null;
}

/** 兼容 0.2（比例）与 20（百分数）两种下发形态；缺失时返回 null。 */
export function activityGain(ub: UserBadge | null | undefined): number | null {
  const v = ub?.badge?.attributes?.daily_active_gain_percent;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.round(v <= 1 ? v * 100 : v);
}

export function activityName(ub: UserBadge | null | undefined): string {
  return ub?.badge?.name || ub?.badge?.attributes?.badge_name || ACTIVITY_BADGE_NAME;
}

/** 按钮文案只留「走个面 +20%」，佩戴后加 ✓；动作与说明放在 title。 */
export function activityLabel(ub: UserBadge, worn: boolean): string {
  const gain = activityGain(ub);
  return `${worn ? '✓ ' : ''}${activityName(ub)}${gain == null ? '' : ` +${gain}%`}`;
}

/* ------------------------------------------------------------------
   潘多拉事件
------------------------------------------------------------------ */

/** 盒子是否「已生效且未到期」：未到 open_at 视为待生效，expire_at 已过视为结束。 */
export function pandoraActive(box: PandoraBox | null | undefined, now = Date.now()): boolean {
  if (!box || !box.event_code) return false;
  const start = box.open_at || box.apply_at;
  if (start && new Date(start).getTime() > now) return false;
  if (box.expire_at && new Date(box.expire_at).getTime() <= now) return false;
  return true;
}

/** 从事件载荷取数值：优先 rolled_value，缺失时从 event_title 文案兜底解析。 */
function pandoraNum(pay: PandoraBox, title: string, re: RegExp): number | null {
  if (typeof pay.rolled_value === 'number') return pay.rolled_value;
  const m = title.match(re);
  if (!m || m[1] === undefined) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * 解析生效中的潘多拉事件对评论费用估算的影响。
 *
 * - `badge_drop_lock` 回归起点：徽章掉落并锁定，徽章逻辑完全让位；
 * - `fixed_text_cost` 妙笔生花：发评固定 N 金币，徽章不参与计费；
 * - `comment_min_length` 多说多写：只校验字数，徽章不参与；
 * - `coin_modifier_percent` 金币升降机：评论消费类事件，徽章不叠加；
 * - `comment_custom_emoji_required` 小表情：评论需包含自定义表情。
 */
export function pandoraEffect(
  box: PandoraBox | null | undefined,
  now = Date.now(),
): PandoraEffect {
  if (!pandoraActive(box, now)) return { active: false };
  const pay = box?.payload ?? (box as PandoraBox);
  const title = String(pay.event_title || '');
  const code = String(pay.event_code || '');
  const constraint = box?.comment_constraint ?? pay.comment_constraint ?? {};

  return {
    active: true,
    code,
    name: pay.event_name || code,
    expireAt: box?.expire_at || pay.expires_at || null,
    lockBadge: code === 'badge_drop_lock',
    fixedCost:
      code === 'fixed_text_cost' ? pandoraNum(pay, title, /固定为\s*(\d+)\s*金币/) : null,
    freeComment: /不扣除?金币/.test(title),
    modifierPct:
      code === 'coin_modifier_percent' ? pandoraNum(pay, title, /([+-]?\d+)\s*%/) : null,
    minLength:
      typeof constraint.min_length === 'number'
        ? constraint.min_length
        : code === 'comment_min_length'
          ? pandoraNum(pay, title, /(\d+)\s*个字/)
          : null,
    needEmoji:
      code === 'comment_custom_emoji_required' || constraint.custom_emoji_required === true,
  };
}

/** 本地时间 `MM-DD HH:mm`（潘多拉截止时间展示）。 */
export function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ------------------------------------------------------------------
   状态栏展示模型
------------------------------------------------------------------ */

/**
 * - `warn`：需要红色提醒（当前佩戴已不划算 / 潘多拉约束未满足）；
 * - `actions`：建议的动作（切换 1–2 个最优解）；
 * - `pand`：`pandoraEffect` 的结果，潘多拉事件优先于徽章逻辑。
 */
export function barModel(
  len: number,
  p: BadgePair,
  eq: ReadonlySet<string>,
  pand?: PandoraEffect | null,
): BarModel {
  const base = baseCost(len);
  const pe = pand?.active ? pand : null;
  // 多说多写：未达字数时评论发不出去（硬约束）。
  const needMore = pe?.minLength && len < pe.minLength ? pe.minLength - len : 0;
  const m: BarModel = {
    count: `${len} 字`,
    status: '',
    hint: '',
    warn: false,
    actions: [],
  };
  // 字数门槛直接读写数区：36/100 字，窄屏看不到 hint 时也能判断。
  if (pe?.minLength) m.count = `${len}/${pe.minLength} 字`;

  // 0) 潘多拉事件接管：评论消费 / 字数约束优先，徽章不叠加。
  if (pe) {
    const until = pe.expireAt ? ` · ${fmtTime(pe.expireAt)} 截止` : '';
    if (pe.lockBadge) {
      m.status = `潘多拉「${pe.name}」生效中${until} · 徽章已掉落锁定`;
      m.hint = '⚠️ 下次开盒前无法佩戴徽章，按无徽章计费';
      m.warn = true;
      return m;
    }
    if (pe.freeComment) {
      m.status = `潘多拉「${pe.name}」生效中 · 发评 0 金币`;
      if (needMore) {
        m.hint = `⚠️ 还差 ${needMore} 字才能发送（需 ≥${pe.minLength} 字）`;
        m.warn = true;
      } else {
        m.hint = pe.minLength
          ? `✓ 生效期间评论不扣金币（需 ≥${pe.minLength} 字）`
          : '✓ 生效期间评论不扣金币';
      }
      return m;
    }
    if (pe.minLength) {
      m.status = `潘多拉「${pe.name}」生效中 · 需 ≥${pe.minLength} 字`;
      if (needMore) {
        m.hint = `⚠️ 还差 ${needMore} 字才能发送（需 ≥${pe.minLength} 字）`;
        m.warn = true;
      } else {
        m.hint = `✓ 已满足 ${pe.minLength} 字，可以发送`;
      }
      return m;
    }
    if (typeof pe.fixedCost === 'number') {
      m.status = `潘多拉「${pe.name}」生效中 · 发评固定 ${pe.fixedCost} 金币`;
      m.hint = '潘多拉已固定费用，徽章不参与计算';
      return m;
    }
    if (pe.code === 'coin_modifier_percent' || typeof pe.modifierPct === 'number') {
      const pct = typeof pe.modifierPct === 'number' ? pe.modifierPct : 0;
      const cost = Math.round(base * (1 + pct / 100));
      m.status = `潘多拉「${pe.name}」生效中${until} · 发评约 ${cost} 金币`;
      m.hint = '徽章不叠加：发评费用按事件计算';
      return m;
    }
  }

  const worn = wornCostBadges(p, eq);
  const cur = worn[0] ?? null;
  const curCost = badgeCost(len, cur);
  m.status =
    worn.length > 1
      ? `当前：${worn.map((b) => badgeName(b)).join(' + ')} · 发评约 ${curCost} 金币（同戴，估算可能不准）`
      : `当前：${cur ? badgeName(cur) : '未佩戴'} · 发评约 ${curCost} 金币`;

  // 1) 多枚费用徽章同时佩戴：费用叠加方式未知，只提醒，不提供摘下。
  if (worn.length > 1) {
    m.hint = '⚠️ 多枚同戴，估算可能不准';
    m.warn = true;
    return finishPandora(m, pe);
  }

  // 2) 最优解里除去当前佩戴的那枚，剩下的都可以替换：
  //    未佩戴时是全部最优解；戴着其中一枚时，同价的并重徽章仍放在右侧。
  const targets = optimalBadges(len, p)
    .filter((b) => !worn.includes(b))
    .slice(0, 2);
  if (!targets.length) {
    if (cur && curCost > base) {
      m.hint = `⚠️ 比不戴贵 ${curCost - base} 金币`;
      m.warn = true;
    } else {
      m.hint = cur ? '✓ 当前最省' : '';
    }
    return finishPandora(m, pe);
  }

  // 3) 只给最优解的替换按钮（并重徽章最多两个）。
  m.actions = targets.map((b) => {
    const cost = badgeCost(len, b);
    return {
      type: 'switch',
      badge: b,
      label: `${badgeName(b)} ${cost} 金币`,
      title: `切换到「${badgeName(b)}」 · 发评约 ${cost} 金币`,
    };
  });
  const first = targets[0];
  if (!first) return finishPandora(m, pe);
  const targetCost = badgeCost(len, first);
  const curOff = cur ? commentDiscount(cur) : null;
  if (cur && curCost === targetCost) {
    // 当前已是同价最优，右侧按钮只是「换成另一枚并重徽章」。
    m.hint = '✓ 当前最省';
  } else if (curOff != null && commentDiscount(first) == null) {
    // 减免输给固定扣费：把原因说清楚。
    m.warn = true;
    m.hint = `⚠️ ${pctText(curOff)} 不如固定 ${targetCost} 金币`;
  } else {
    m.hint = `可省 ${curCost - targetCost} 金币`;
  }
  return finishPandora(m, pe);
}

/** 徽章分支收尾：字数 / 费用类潘多拉已在前面接管，这里只叠加表情约束。 */
function finishPandora(m: BarModel, pe: PandoraEffect | null): BarModel {
  if (!pe) return m;
  if (pe.needEmoji) {
    m.hint = [m.hint, '潘多拉要求包含自定义表情'].filter(Boolean).join(' · ');
  }
  return m;
}

/* ------------------------------------------------------------------
   工具
------------------------------------------------------------------ */

/** equipped 接口兼容两种形态：`[{badge_id}]` 或 `[{badge:{id}}]`。 */
export function normalizeEquipped(d: unknown): string[] {
  if (!Array.isArray(d)) return [];
  return (d as UserBadge[])
    .map((x) => badgeIdOf(x))
    .filter((id): id is string => Boolean(id));
}

/** 帖子详情页（含扁平模式 `/post-flat/...`），排除聚合列表页。 */
export function isPostDetail(pathname: string): boolean {
  if (!/^\/post(?:-flat)?\/[^/]+\/[^/]+/.test(pathname)) return false;
  return !/^\/post\/(?:latest(?:-comments)?|hot)(?:\/|$)/.test(pathname);
}
