import { API_BASE } from './config';
import { getAccessToken, refreshTokens } from './auth';
import {
  RateLimitError,
  noteRateLimit,
  withSlot,
} from './rate-limit';
import { tokensItem } from './storage';
import type { Envelope, Profile } from './types';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string | null = null,
    readonly payload: Partial<Envelope<unknown>> | null = null,
  ) {
    super(message);
    this.name = 'ApiError';
  }

  get retryAfter(): number | null {
    const value = this.payload?.retry_after;
    return typeof value === 'number' ? value : null;
  }
}

interface RequestOptions {
  query?: Record<string, string | number | boolean | undefined | null>;
  /** 默认 true：已登录时带上令牌拿个性化字段。 */
  auth?: boolean;
  signal?: AbortSignal;
  /** POST 的 JSON 请求体；不传则发空 body。 */
  body?: unknown;
  /** 额外请求头。 */
  headers?: Record<string, string>;
}

/** 写操作统一走 POST / DELETE；`mark-all-read`、收藏这类端点大多不需要请求体。 */
interface SendInit {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: string;
  headers?: Record<string, string>;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return `${API_BASE}${path}${search ? `?${search}` : ''}`;
}

async function send(
  url: string,
  token: string | null,
  signal?: AbortSignal,
  init: SendInit = {},
): Promise<Response> {
  try {
    // 所有普通请求都走全局队列：并发上限 + 启动间隔 + 429 冷却。
    return await withSlot(signal, () =>
      fetch(url, {
        method: init.method ?? 'GET',
        signal,
        credentials: 'omit',
        headers: {
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...init.headers,
        },
        body: init.body,
      }),
    );
  } catch (error) {
    if (error instanceof RateLimitError) {
      // 冷却中不把请求发出去，但仍然按 429 报给上层，界面可以显示等待秒数。
      throw new ApiError('请求太频繁，请稍后再试', 429, 'rate_limited', {
        retry_after: Math.ceil(error.retryAfterMs / 1000),
      });
    }
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('连不上服务器，请检查网络后重试', 0, 'network');
  }
}

/** 429 的等待秒数：优先信封里的 `retry_after`，其次 HTTP 头。 */
function retryAfterSeconds(
  response: Response,
  payload: Envelope<unknown> | null,
): number | null {
  const fromBody = payload?.retry_after;
  if (typeof fromBody === 'number' && fromBody > 0) return fromBody;
  const header = Number(response.headers.get('retry-after'));
  return Number.isFinite(header) && header > 0 ? header : null;
}

/** 解信封并转成 ApiError；GET / POST 共用。 */
async function readEnvelope<T>(response: Response, gateRateLimit = true): Promise<T> {
  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    payload = null;
  }

  const retryAfter = retryAfterSeconds(response, payload);
  // 撞到限流就让整个扩展安静一会儿，别让排队中的请求继续把 429 攒成一片。
  // `/v1/search` 是独立配额桶，它的 429 不应该拖住其它接口，所以由调用方关掉。
  if (gateRateLimit && (response.status === 429 || payload?.c === 429)) {
    noteRateLimit(retryAfter);
  }

  if (!payload || typeof payload.c !== 'number') {
    if (response.status === 429) {
      throw new ApiError('请求太频繁，请稍后再试', 429, 'rate_limited', {
        retry_after: retryAfter ?? undefined,
      });
    }
    throw new ApiError(`服务器返回了无法解析的数据（HTTP ${response.status}）`, response.status);
  }

  if (payload.c !== 0) {
    throw new ApiError(payload.m || `请求失败（HTTP ${response.status}）`, response.status, payload.code ?? null, payload);
  }

  return payload.d;
}

/** 写操作前的令牌处理：401 时刷新一次并重试。 */
async function withAuthRetry(
  run: (token: string | null) => Promise<Response>,
  token: string | null,
): Promise<Response> {
  let response = await run(token);
  if (response.status !== 401 || !token) return response;

  const next = await refreshTokens();
  if (!next) {
    await tokensItem.setValue(null);
    throw new ApiError('登录已过期，请重新授权', 401, 'unauthorized');
  }
  response = await run(next.accessToken);
  return response;
}

/**
 * 读接口统一入口：处理信封、401 刷新后重试、网络错误。
 */
export async function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, auth = true, signal } = options;
  const url = buildUrl(path, query);
  const token = auth ? await getAccessToken() : null;
  const response = await withAuthRetry((next) => send(url, next, signal), token);
  // 搜索单独限流，不能把它的 429 变成全扩展的冷却。
  return readEnvelope<T>(response, !path.startsWith('/v1/search'));
}

/**
 * 写接口统一入口。
 *
 * 服务端对 `/api/v1/*` 的 CORS 只放行站点来源，但扩展用 DNR 移除了 `Origin`
 * 头（见 entrypoints/background.ts），请求会像普通客户端一样被接受。目前只用于
 * 通知标记已读、帖子收藏这类轻量、可重试的写操作；不把用户令牌交给第三方。
 */
async function apiWrite<T>(
  method: 'POST' | 'DELETE',
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { query, auth = true, signal, body, headers } = options;
  const url = buildUrl(path, query);
  const token = auth ? await getAccessToken() : null;
  const serialized = body === undefined ? undefined : JSON.stringify(body);
  const init: SendInit = {
    method,
    body: serialized,
    headers: serialized ? { 'Content-Type': 'application/json', ...headers } : headers,
  };

  const response = await withAuthRetry(
    (next) => send(url, next, signal, init),
    token,
  );
  return readEnvelope<T>(response);
}

export function apiPost<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return apiWrite<T>('POST', path, options);
}

export function apiDelete<T>(path: string, options: RequestOptions = {}): Promise<T> {
  return apiWrite<T>('DELETE', path, options);
}

/** 精简身份快照：启动时校验登录态用它，比 `/v1/me` 便宜。 */
export async function getMeSummary(): Promise<Profile> {
  return apiGet<Profile>('/v1/me/summary');
}

/** 当前用户完整资料，结构同 `GET /v1/users/:username`（含头像）。 */
export async function getFullMe(): Promise<Profile> {
  return apiGet<Profile>('/v1/me');
}

/**
 * 公开用户资料，带头像 / 等级 / PRO 标记。
 * 匿名可读，所以显式 `auth: false`：不占用登录配额，也避免令牌异常时连带失败。
 */
export async function getUserProfile(username: string): Promise<Profile> {
  return apiGet<Profile>(`/v1/users/${encodeURIComponent(username)}`, { auth: false });
}
