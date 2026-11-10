import { browser } from '#imports';

/**
 * 服务端的 CORS 只放行它自己站点的来源，扩展发起的请求会带上
 * `Origin: chrome-extension://<id>`，于是被服务端以 500「Not allowed by CORS」拒绝。
 *
 * 这里用 declarativeNetRequest 在「扩展自己发往 API 域名的请求」上移除
 * 浏览器自动附加的 Origin 头，让请求表现得像 curl 一样的普通客户端。
 * 规则限定 initiatorDomains 为扩展自身，因此不会影响站点页面或其它网站
 * 的请求；CORS 不是鉴权，读接口本来就是公开的，令牌仍按 Authorization 传递。
 */
const RULE_ID = 1;

export default defineBackground(() => {
  const installRule = async () => {
    try {
      await browser.declarativeNetRequest.updateDynamicRules({
        removeRuleIds: [RULE_ID],
        addRules: [
          {
            id: RULE_ID,
            priority: 1,
            action: {
              type: 'modifyHeaders',
              requestHeaders: [{ header: 'origin', operation: 'remove' }],
            },
            condition: {
              urlFilter: '||2libra.com/api/',
              initiatorDomains: [browser.runtime.id],
              resourceTypes: ['xmlhttprequest', 'other'],
            },
          },
        ],
      });
    } catch (error) {
      console.warn('[T2] 跨域请求规则安装失败，接口可能被 CORS 拦截', error);
    }
  };

  void installRule();
  browser.runtime.onInstalled.addListener(() => void installRule());
  browser.runtime.onStartup.addListener(() => void installRule());
});
