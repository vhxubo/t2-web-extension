import { API_BASE } from './config';
import { getAccessToken, refreshTokens } from './auth';
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

async function send(url: string, token: string | null, signal?: AbortSignal): Promise<Response> {
  try {
    return await fetch(url, {
      signal,
      credentials: 'omit',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new ApiError('连不上 2Libra，请检查网络后重试', 0, 'network');
  }
}

/**
 * 读接口统一入口：处理信封、401 刷新后重试、网络错误。
 * 写操作按 2Libra 的跨域策略必须经自己的服务端，本扩展不做写操作。
 */
export async function apiGet<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { query, auth = true, signal } = options;
  const url = buildUrl(path, query);
  const token = auth ? await getAccessToken() : null;

  let response = await send(url, token, signal);

  if (response.status === 401 && token) {
    const next = await refreshTokens();
    if (!next) {
      await tokensItem.setValue(null);
      throw new ApiError('登录已过期，请重新授权', 401, 'unauthorized');
    }
    response = await send(url, next.accessToken, signal);
  }

  let payload: Envelope<T> | null = null;
  try {
    payload = (await response.json()) as Envelope<T>;
  } catch {
    payload = null;
  }

  if (!payload || typeof payload.c !== 'number') {
    throw new ApiError(`2Libra 返回了无法解析的数据（HTTP ${response.status}）`, response.status);
  }

  if (payload.c !== 0) {
    throw new ApiError(payload.m || `请求失败（HTTP ${response.status}）`, response.status, payload.code ?? null, payload);
  }

  return payload.d;
}

export async function getMe(): Promise<Profile> {
  return apiGet<Profile>('/v1/me/summary');
}

export async function getFullMe(): Promise<Profile> {
  return apiGet<Profile>('/v1/me');
}
