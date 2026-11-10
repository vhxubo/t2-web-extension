import { defineConfig, type UserManifest } from 'wxt';
import { AUTHOR } from './lib/config';

/** Firefox 的 author 是「姓名 <邮箱>」字符串，Chromium 系则是 { email } 对象。 */
const AUTHOR_LABEL = `${AUTHOR.name} <${AUTHOR.email}>`;

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: ({ browser }) => {
    const manifest: UserManifest = {
      name: 'T2 Web Extension',
      description:
        '在弹窗与新标签页里浏览帖子榜单：四列看板展示新发表、今日热议、近期热议，生活与工作维度同列上下分割，可设置默认榜单。',
      permissions: ['storage', 'identity', 'alarms', 'declarativeNetRequestWithHostAccess'],
      minimum_chrome_version: '101',
      host_permissions: ['https://2libra.com/*', 'https://r2.2libra.com/*'],
      action: {
        default_title: 'T2 Web Extension',
        // 显式声明工具栏图标，未读数角标会画在它的右下角。
        default_icon: {
          16: 'icon/16.png',
          32: 'icon/32.png',
          48: 'icon/48.png',
          96: 'icon/96.png',
          128: 'icon/128.png',
        },
      },
    };

    if (browser === 'firefox') {
      // Firefox 用字符串 author 署名，并补充 developer 字段（AMO 会展示）。
      return {
        ...manifest,
        author: AUTHOR_LABEL,
        developer: { name: AUTHOR.name },
        browser_specific_settings: {
          gecko: {
            // AMO 要求新扩展显式声明数据收集情况；本扩展只读浏览，不上报任何数据。
            data_collection_permissions: { required: ['none'] },
          },
        },
      } as unknown as UserManifest;
    }

    // Chromium 系（Chrome / Edge 等）：author 已被官方标记为废弃，保留以兼容旧版。
    return { ...manifest, author: { email: AUTHOR.email } };
  },
});
