import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: '2Libra 帖子浏览',
    description:
      '在弹窗与新标签页里浏览 2Libra 帖子，支持全部榜单、全部分区切换，可设置默认榜单与默认分区。',
    permissions: ['storage', 'identity', 'declarativeNetRequestWithHostAccess'],
    minimum_chrome_version: '101',
    host_permissions: ['https://2libra.com/*', 'https://r2.2libra.com/*'],
    action: {
      default_title: '2Libra 帖子浏览',
    },
  },
});
