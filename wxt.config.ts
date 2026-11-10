import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'T2 Web Extension',
    description:
      '在弹窗与新标签页里浏览帖子榜单：四列看板并排展示新发表、今日热议、近期热议与价值榜，可设置默认榜单与每页条数。',
    permissions: ['storage', 'identity', 'declarativeNetRequestWithHostAccess'],
    minimum_chrome_version: '101',
    host_permissions: ['https://2libra.com/*', 'https://r2.2libra.com/*'],
    action: {
      default_title: 'T2 Web Extension',
    },
  },
});
