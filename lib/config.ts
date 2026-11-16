/** 站点与开放 API 的固定地址，集中在这里方便排查。 */
export const APP_ORIGIN = 'https://2libra.com';
export const API_BASE = `${APP_ORIGIN}/api`;
export const AUTHORIZE_URL = `${APP_ORIGIN}/oauth/authorize`;
export const TOKEN_URL = `${APP_ORIGIN}/api/oauth/token`;

/**
 * 站点注册页的邀请码。2Libra 注册需要邀请，扩展把这条带入注册链接，
 * 没账号的用户先在这里建号，再回扩展里走 OAuth 授权登录。
 * 改邀请码只需动这里，UI 与 `startSignup()` 都从 `SIGNUP_URL` 取地址。
 */
export const SIGNUP_INVITE_CODE = '7OzoT5x6M';
export const SIGNUP_URL = `${APP_ORIGIN}/auth/signup/${SIGNUP_INVITE_CODE}`;

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
 * 浏览 + 未读消息 + 帖子收藏 + 今日盲盒所需的最小 scope。
 * `read:me` 用于读取未读数 / 消息列表，以及消息的单条 / 全部标记已读；
 * `read:economy` 用于读取今日盲盒状态（评论费用助手据此识别潘多拉事件），
 * 只读金币信息，不包含任何花金币的 `write:economy`；
 * `interact` 用于帖子收藏 / 取消收藏，以及佩戴 / 摘下徽章。
 */
export const REQUESTED_SCOPE = 'read profile read:me read:economy interact';

export const DASHBOARD_PAGE = '/dashboard.html';
export const SETTINGS_PAGE = '/options.html';

/** 作者署名：manifest、package.json 与「关于」面板共用同一份信息。 */
export const AUTHOR = {
  name: 'vhxubo',
  email: 'vhxubo@gmail.com',
} as const;

/**
 * 依据 2Libra《第三方应用接入说明》第二部分三.1 与附录模板，下面这些文案
 * 必须出现在用户可见的位置：开发者声明（设置页 / 账号区）与内容来源声明（列表附近）。
 */
export const DISCLAIMER = `本应用由 ${AUTHOR.name} 独立开发运营，与 2Libra 无隶属或合作关系。`;
export const REVOKE_HINT = '你可以随时在 2Libra 的「授权应用」页面撤销本应用的授权。';
export const LIABILITY_NOTE =
  '2Libra 仅提供账号授权与接口，不对本应用的可用性、内容与数据处理负责。';
export const PERMISSION_NOTE =
  '本应用申请的权限：read（浏览公开内容）、profile（读取公开资料）、read:me（未读消息与消息列表）、read:economy（只读今日盲盒状态，用于评论费用提示）、interact（帖子收藏与徽章佩戴）。';
export const ATTRIBUTION = '内容来自 2Libra 用户，版权归原作者所有。原文链接：点击标题打开原帖。';

export const LINKS = {
  docs: 'https://r2.2libra.com/openapi/v1/index.md',
  oauth: 'https://r2.2libra.com/openapi/v1/oauth.md',
  terms: 'https://r2.2libra.com/openapi/v1/terms.md',
  site: APP_ORIGIN,
  settings: APP_ORIGIN,
  notifications: `${APP_ORIGIN}/notifications`,
} as const;
