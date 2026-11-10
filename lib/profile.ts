import { ApiError, getFullMe, getMeSummary, getUserProfile } from './api';
import { normalizeAvatarUrl } from './format';
import type { Profile } from './types';

/**
 * 头像字段在不同端点 / 不同版本里叫法可能不一致。
 * 服务端承诺「只增字段」，所以这里按优先级兜底取值，而不是只认 avatar_url。
 */
const AVATAR_KEYS = [
  'avatar_url',
  'avatarUrl',
  'avatar',
  'avatar_path',
  'head_img',
  'headImg',
  'portrait',
] as const;

function toText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function toBool(value: unknown): boolean | undefined {
  if (typeof value === 'boolean') return value;
  if (value === 0 || value === 1) return value === 1;
  return undefined;
}

/**
 * `/v1/me/summary` 这类端点可能把身份包在 `user` / `profile` / `data` 里，
 * 也可能直接平铺。两种形态都在这里抹平，后续代码只认 `Profile`。
 */
function unwrap(raw: unknown): Record<string, unknown> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;

  for (const key of ['user', 'profile', 'data'] as const) {
    const nested = source[key];
    if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
      const candidate = nested as Record<string, unknown>;
      if ('username' in candidate || 'avatar_url' in candidate || 'id' in candidate) {
        return candidate;
      }
    }
  }
  return source;
}

/** 把任意来源的用户对象转成扩展内部使用的 `Profile`；认不出来返回 null。 */
export function normalizeProfile(raw: unknown): Profile | null {
  const source = unwrap(raw);
  if (!source) return null;

  let avatarUrl: string | null = null;
  for (const key of AVATAR_KEYS) {
    avatarUrl = normalizeAvatarUrl(source[key]);
    if (avatarUrl) break;
  }

  const profile: Profile = {
    id: toText(source.id) ?? undefined,
    username: toText(source.username) ?? undefined,
    display_name: toText(source.display_name) ?? toText(source.displayName) ?? undefined,
    user_number: toText(source.user_number) ?? undefined,
    avatar_url: avatarUrl,
    level: toNumber(source.level),
    is_pro: toBool(source.is_pro),
    role: toText(source.role) ?? undefined,
  };

  return profile;
}

/** 两个资料是否指向同一个人（用于判断缓存还能不能复用）。 */
export function isSameUser(a: Profile | null | undefined, b: Profile | null | undefined): boolean {
  if (!a || !b) return false;
  if (a.id && b.id) return a.id === b.id;
  if (a.username && b.username) return a.username === b.username;
  return false;
}

/**
 * 合并资料：以 `patch`（新数据）为准，`patch` 没有的字段保留 `base`。
 * 头像单独处理，避免「新响应没带头像」把已经拿到的头像清掉。
 */
export function mergeProfile(base: Profile | null, patch: Profile | null): Profile | null {
  if (!base) return patch;
  if (!patch) return base;

  const merged: Profile = { ...base };
  for (const key of Object.keys(patch) as (keyof Profile)[]) {
    const value = patch[key];
    if (value !== undefined && value !== null && value !== '') {
      (merged as Record<string, unknown>)[key] = value;
    }
  }
  merged.avatar_url = patch.avatar_url ?? base.avatar_url ?? null;
  return merged;
}

let inflight: Promise<Profile> | null = null;

/**
 * 解析当前登录用户的资料（含头像）。
 *
 * 取数顺序刻意分层，尽量少发请求：
 * 1. `GET /v1/me/summary`：文档推荐的启动校验端点，最便宜；
 * 2. 快照没带头像时，先看本地缓存是不是同一个人 —— 是就直接复用缓存头像，不发请求；
 * 3. 仍然没有头像时，用公开端点 `GET /v1/users/:username` 补齐（不需要额外 scope，
 *    令牌缺权限也能拿到；失败时忽略，头像缺失不影响登录态）；
 * 4. 连用户名都没有时，才退回完整的 `GET /v1/me`。
 */
export function resolveProfile(cached: Profile | null = null): Promise<Profile> {
  // 单飞：登录成功时 storage 监听和显式刷新会同时触发，合并成一次请求。
  inflight ??= doResolveProfile(cached).finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doResolveProfile(cached: Profile | null): Promise<Profile> {
  let summary: Profile | null = null;

  try {
    summary = normalizeProfile(await getMeSummary());
  } catch (error) {
    // 快照端点不可用（老服务端 / 路径调整 / 额外 scope）时退回完整资料；
    // 网络错误和令牌失效不重试，直接把错误交给上层。
    const recoverable =
      error instanceof ApiError &&
      (error.status === 400 || error.status === 403 || error.status === 404);
    if (!recoverable) throw error;

    try {
      return mergeProfile(cached, normalizeProfile(await getFullMe())) ?? {};
    } catch {
      throw error;
    }
  }

  // 缓存只在与当前用户同一个人时复用，避免换账号后短暂显示上一个人的头像。
  let profile = isSameUser(cached, summary) ? mergeProfile(cached, summary) : summary;

  if (!profile?.avatar_url) {
    let publicProfileChecked = false;

    if (profile?.username) {
      try {
        profile = mergeProfile(profile, normalizeProfile(await getUserProfile(profile.username)));
        // 公开资料是头像的权威来源：它说没有，就不用再去问 /v1/me。
        publicProfileChecked = true;
      } catch {
        // 公开资料拉不到（限流 / 网络）不算登录失败，继续用已有字段。
      }
    }

    if (!profile?.avatar_url && !publicProfileChecked) {
      try {
        profile = mergeProfile(profile, normalizeProfile(await getFullMe()));
      } catch {
        // 同上：头像可以没有，登录态不能因此翻车。
      }
    }
  }

  if (!profile?.avatar_url) {
    console.warn(
      '[T2] 没解析到头像地址，请检查 /v1/me/summary 与 /v1/users/:username 的响应字段',
      profile,
    );
  }

  return profile ?? {};
}
