import { browser } from '#imports';
import {
  AUTHORIZE_URL,
  FIREFOX_EXTENSION_ID,
  FIREFOX_REDIRECT_URI,
  OAUTH_CLIENT_ID,
  REQUESTED_SCOPE,
  SIGNUP_URL,
  TOKEN_URL,
} from './config';
import {
  pendingAuthItem,
  profileCacheItem,
  tokensItem,
  type PendingAuth,
  type TokenSet,
} from './storage';

export type AuthErrorCode =
  | 'config'
  | 'cancelled'
  | 'state'
  | 'denied'
  | 'network'
  | 'token'
  | 'expired';

export class AuthError extends Error {
  constructor(
    message: string,
    readonly code: AuthErrorCode = 'token',
    readonly status: number | null = null,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

/** 扩展自己的回调地址，需要与授权应用里注册的完全一致。 */
export function getRedirectUri(): string {
  try {
    return browser.identity?.getRedirectURL?.('cb') ?? '';
  } catch {
    return '';
  }
}

function base64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function randomToken(byteLength: number): string {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return base64Url(bytes);
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

async function tokenRequest(body: Record<string, string>): Promise<TokenResponse> {
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body).toString(),
      credentials: 'omit',
    });
  } catch {
    throw new AuthError('无法连接授权服务，请检查网络后重试', 'network');
  }

  let payload: { c?: number; m?: string; d?: TokenResponse } | null = null;
  try {
    payload = (await response.json()) as { c?: number; m?: string; d?: TokenResponse };
  } catch {
    payload = null;
  }

  if (!response.ok || !payload || payload.c !== 0 || !payload.d) {
    throw new AuthError(
      payload?.m || `授权失败（HTTP ${response.status}）`,
      'token',
      response.status,
    );
  }
  return payload.d;
}

function toTokenSet(payload: TokenResponse): TokenSet {
  if (!payload.access_token) {
    throw new AuthError('授权响应里缺少 access_token', 'token');
  }
  const expiresIn = Number.isFinite(payload.expires_in) ? Number(payload.expires_in) : 3600;
  return {
    accessToken: payload.access_token,
    refreshToken: payload.refresh_token ?? null,
    expiresAt: Date.now() + Math.max(expiresIn - 10, 60) * 1000,
    scope: payload.scope ?? null,
    tokenType: payload.token_type ?? 'Bearer',
  };
}

async function exchangeCode(params: {
  code: string;
  verifier: string;
  redirectUri: string;
}): Promise<TokenSet> {
  const payload = await tokenRequest({
    grant_type: 'authorization_code',
    code: params.code,
    redirect_uri: params.redirectUri,
    client_id: OAUTH_CLIENT_ID.trim(),
    code_verifier: params.verifier,
  });
  return toTokenSet(payload);
}

/**
 * 走一遍授权码 + PKCE 流程（公开客户端，不带 client_secret）。
 * client_id 由开发者在 lib/config.ts 中配置，不经过用户。
 * 必须在常驻的扩展页里调用：授权窗口会让弹窗失焦关闭。
 */
export async function startLogin(): Promise<TokenSet> {
  const clientId = OAUTH_CLIENT_ID.trim();
  if (!clientId) {
    throw new AuthError('此版本未配置授权应用，请联系应用开发者', 'config');
  }
  const redirectUri = getRedirectUri();
  if (!redirectUri) {
    throw new AuthError('当前浏览器不支持扩展授权回调（缺少 identity 能力）', 'config');
  }

  // Firefox 的回调由 gecko id 推导。万一扩展被以另一个 ID 载入（换了构建、被别的
  // 包装器改过 manifest），这里直接拦下，而不是打开授权窗口后才发现 redirect_uri
  // 没登记；顺便把实际值打出来，方便和站点里登记的那条逐字比对。
  if (import.meta.env.FIREFOX && redirectUri !== FIREFOX_REDIRECT_URI) {
    throw new AuthError(
      `Firefox 回调地址不一致：实际是 ${redirectUri}，登记值是 ${FIREFOX_REDIRECT_URI}。` +
        `请在 about:debugging 里确认扩展 ID 为 ${FIREFOX_EXTENSION_ID}。`,
      'config',
    );
  }
  console.info('[T2] OAuth redirect_uri:', redirectUri);

  const verifier = randomToken(48);
  const challenge = await codeChallenge(verifier);
  const state = randomToken(16);
  const pending: PendingAuth = {
    state,
    verifier,
    redirectUri,
    createdAt: Date.now(),
  };
  await pendingAuthItem.setValue(pending);

  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', REQUESTED_SCOPE);
  url.searchParams.set('state', state);
  url.searchParams.set('code_challenge', challenge);
  url.searchParams.set('code_challenge_method', 'S256');

  let resultUrl: string | undefined;
  try {
    resultUrl = await browser.identity.launchWebAuthFlow({
      url: url.toString(),
      interactive: true,
    });
  } catch (error) {
    await pendingAuthItem.setValue(null);
    const message = error instanceof Error ? error.message : String(error);
    if (/did not approve|cancel|closed|denied/i.test(message)) {
      throw new AuthError('授权已取消', 'cancelled');
    }
    throw new AuthError(`授权窗口打开失败：${message}`, 'token');
  }

  try {
    if (!resultUrl) throw new AuthError('授权已取消', 'cancelled');

    let returned: URL;
    try {
      returned = new URL(resultUrl);
    } catch {
      throw new AuthError('授权回调地址无法解析', 'token');
    }

    // 浏览器实际跳回来的地址（去掉 query，避免把一次性的 code 写进日志）。
    console.info('[T2] OAuth callback:', `${returned.origin}${returned.pathname}`);

    const errorCode = returned.searchParams.get('error');
    if (errorCode) {
      const description = returned.searchParams.get('error_description');
      throw new AuthError(
        errorCode === 'access_denied' ? '你在授权页拒绝了访问' : description || errorCode,
        'denied',
      );
    }
    if (returned.searchParams.get('state') !== state) {
      throw new AuthError('授权校验失败（state 不匹配），请重新登录', 'state');
    }
    const code = returned.searchParams.get('code');
    if (!code) throw new AuthError('授权回调里没有拿到授权码', 'token');

    const tokens = await exchangeCode({ code, verifier, redirectUri });
    await tokensItem.setValue(tokens);
    return tokens;
  } finally {
    await pendingAuthItem.setValue(null);
  }
}

let refreshing: Promise<TokenSet | null> | null = null;

/** 刷新令牌：并发调用共享同一个请求（单飞），新 refresh_token 会覆盖旧的。 */
export function refreshTokens(): Promise<TokenSet | null> {
  refreshing ??= doRefresh().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

async function doRefresh(): Promise<TokenSet | null> {
  const current = await tokensItem.getValue();
  if (!current?.refreshToken) return null;

  const clientId = OAUTH_CLIENT_ID.trim();
  if (!clientId) return null;

  try {
    const payload = await tokenRequest({
      grant_type: 'refresh_token',
      refresh_token: current.refreshToken,
      client_id: clientId,
    });
    const next = toTokenSet(payload);
    await tokensItem.setValue(next);
    return next;
  } catch (error) {
    if (error instanceof AuthError && error.code === 'token') {
      const status = error.status;
      if (status === 400 || status === 401 || status === 403) {
        await tokensItem.setValue(null);
      }
      return null;
    }
    throw error;
  }
}

/** 提前一分钟刷新，避免请求正好撞上过期。 */
export async function getAccessToken(): Promise<string | null> {
  const tokens = await tokensItem.getValue();
  if (!tokens) return null;

  if (Date.now() + 60_000 >= tokens.expiresAt) {
    if (tokens.refreshToken) {
      const next = await refreshTokens();
      if (next) return next.accessToken;
    }
    await tokensItem.setValue(null);
    throw new AuthError('登录已过期，请重新授权', 'expired');
  }
  return tokens.accessToken;
}

export async function logout(): Promise<void> {
  await tokensItem.setValue(null);
  await pendingAuthItem.setValue(null);
  // 顺带清掉缓存的用户资料，避免换账号后还显示上一个人的头像。
  await profileCacheItem.setValue(null);
}

/**
 * 打开站点注册页（带邀请码）。注册是普通网页流程，不是 OAuth，所以用新标签页打开，
 * 不走 `launchWebAuthFlow`；用户建好号后仍需回到扩展内点「登录 2Libra」走授权。
 * 新标签页打不开（极少数环境）时静默失败，不影响扩展其它功能。
 */
export async function startSignup(): Promise<void> {
  await browser.tabs.create({ url: SIGNUP_URL }).catch(() => undefined);
}
