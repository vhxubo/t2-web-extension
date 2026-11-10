import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
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
  },
});
