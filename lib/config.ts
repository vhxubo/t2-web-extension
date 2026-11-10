/** 2Libra 站点与开放 API 的固定地址，集中在这里方便排查。 */
export const APP_ORIGIN = 'https://2libra.com';
export const API_BASE = `${APP_ORIGIN}/api`;
export const AUTHORIZE_URL = `${APP_ORIGIN}/oauth/authorize`;
export const TOKEN_URL = `${APP_ORIGIN}/api/oauth/token`;

/** 只读浏览所需的最小 scope。 */
export const REQUESTED_SCOPE = 'read profile';

export const DASHBOARD_PAGE = '/dashboard.html';

export const LINKS = {
  docs: 'https://r2.2libra.com/openapi/v1/index.md',
  oauth: 'https://r2.2libra.com/openapi/v1/oauth.md',
  terms: 'https://r2.2libra.com/openapi/v1/terms.md',
  site: APP_ORIGIN,
  settings: APP_ORIGIN,
} as const;
