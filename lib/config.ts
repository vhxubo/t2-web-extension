/** 站点与开放 API 的固定地址，集中在这里方便排查。 */
export const APP_ORIGIN = 'https://2libra.com';
export const API_BASE = `${APP_ORIGIN}/api`;
export const AUTHORIZE_URL = `${APP_ORIGIN}/oauth/authorize`;
export const TOKEN_URL = `${APP_ORIGIN}/api/oauth/token`;

/**
 * OAuth 公开客户端的 client_id。
 *
 * 由应用开发者在打包前直接填写，扩展不向用户提供任何授权配置入口。
 * 回调地址用 `browser.identity.getRedirectURL('cb')` 的值：Chromium 系是
 * `https://<扩展 ID>.chromiumapp.org/cb`，Firefox 是下面的 `FIREFOX_REDIRECT_URI`。
 * 留空时扩展仍可匿名使用，只是登录会被禁用。
 */
export const OAUTH_CLIENT_ID = 'e471281af4d84ecfae77c39f94bcf372';

/** client_id 是否已由开发者配置。 */
export const OAUTH_CONFIGURED = OAUTH_CLIENT_ID.trim().length > 0;

/**
 * Firefox 的附加组件 ID（manifest 的 `browser_specific_settings.gecko.id`）。
 *
 * Firefox 的 `browser.identity.getRedirectURL('cb')` 不是随机 UUID，而是取这串 ID 的
 * SHA-1，拼成 `https://<sha1(id)>.extensions.allizom.org/cb`。所以临时载入、重启、
 * 换机器都不会变；改这里等于换回调地址，必须同步改 `FIREFOX_REDIRECT_HASH`
 * 和 2libra 里登记的回调。
 */
export const FIREFOX_EXTENSION_ID = 't2-web-extension@vhxubo.com';

/**
 * `sha1(FIREFOX_EXTENSION_ID)`。
 * 构建期由 wxt.config.ts 校验；登录前还会与浏览器实际返回的地址再比一次。
 */
export const FIREFOX_REDIRECT_HASH = '1e3dfcf6f6cd76246e686cabdf2e53df06ab002f';

/** Firefox 实际会用的回调地址，须与 2libra OAuth 应用里登记的地址逐字一致。 */
export const FIREFOX_REDIRECT_URI = `https://${FIREFOX_REDIRECT_HASH}.extensions.allizom.org/cb`;

/**
 * 浏览 + 未读通知 + 帖子收藏所需的最小 scope。
 * `read:me` 用于读取未读数 / 通知列表，以及通知的单条 / 全部标记已读；
 * `interact` 用于帖子详情的收藏 / 取消收藏（`/v1/topics/:short_id/favorite`）。
 */
export const REQUESTED_SCOPE = 'read profile read:me interact';

export const DASHBOARD_PAGE = '/dashboard.html';
export const SETTINGS_PAGE = '/options.html';

/** 作者署名：manifest、package.json 与「关于」面板共用同一份信息。 */
export const AUTHOR = {
  name: 'vhxubo',
  email: 'vhxubo@gmail.com',
} as const;

export const LINKS = {
  docs: 'https://r2.2libra.com/openapi/v1/index.md',
  oauth: 'https://r2.2libra.com/openapi/v1/oauth.md',
  terms: 'https://r2.2libra.com/openapi/v1/terms.md',
  site: APP_ORIGIN,
  settings: APP_ORIGIN,
  notifications: `${APP_ORIGIN}/notifications`,
} as const;
