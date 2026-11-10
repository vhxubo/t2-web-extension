/** 站点与开放 API 的固定地址，集中在这里方便排查。 */
export const APP_ORIGIN = 'https://2libra.com';
export const API_BASE = `${APP_ORIGIN}/api`;
export const AUTHORIZE_URL = `${APP_ORIGIN}/oauth/authorize`;
export const TOKEN_URL = `${APP_ORIGIN}/api/oauth/token`;

/**
 * OAuth 公开客户端的 client_id。
 *
 * 由应用开发者在打包前直接填写，扩展不向用户提供任何授权配置入口。
 * 回调地址需要用 `browser.identity.getRedirectURL('cb')` 的值，并在授权
 * 应用里登记为 `https://<扩展 ID>.chromiumapp.org/cb`。
 * 留空时扩展仍可匿名使用，只是登录会被禁用。
 */
export const OAUTH_CLIENT_ID = '';

/** client_id 是否已由开发者配置。 */
export const OAUTH_CONFIGURED = OAUTH_CLIENT_ID.trim().length > 0;

/**
 * 只读浏览 + 未读通知角标所需的最小 scope。
 * `read:me` 只用于读取未读数 / 通知列表；扩展仍然不做任何写操作。
 */
export const REQUESTED_SCOPE = 'read profile read:me';

export const DASHBOARD_PAGE = '/dashboard.html';

export const LINKS = {
  docs: 'https://r2.2libra.com/openapi/v1/index.md',
  oauth: 'https://r2.2libra.com/openapi/v1/oauth.md',
  terms: 'https://r2.2libra.com/openapi/v1/terms.md',
  site: APP_ORIGIN,
  settings: APP_ORIGIN,
  notifications: `${APP_ORIGIN}/notifications`,
} as const;
