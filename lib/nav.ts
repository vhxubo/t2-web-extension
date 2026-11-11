import { DASHBOARD_PAGE, SETTINGS_PAGE } from './config';
import { browser } from '#imports';

export async function openDashboard(hash?: string): Promise<void> {
  const base = browser.runtime.getURL(DASHBOARD_PAGE);
  await browser.tabs.create({ url: hash ? `${base}#${hash}` : base });
}

export function dashboardUrl(hash?: string): string {
  const base = browser.runtime.getURL(DASHBOARD_PAGE);
  return hash ? `${base}#${hash}` : base;
}

/** 设置是独立页面（也是扩展的选项页），从弹窗和仪表盘都新开一个标签页。 */
export async function openSettings(): Promise<void> {
  await browser.tabs.create({ url: settingsUrl() });
}

export function settingsUrl(): string {
  return browser.runtime.getURL(SETTINGS_PAGE);
}

export function postHref(nodeSlug: string, shortId: string): string {
  return `https://2libra.com/post/${encodeURIComponent(nodeSlug)}/${encodeURIComponent(shortId)}`;
}

export function profileHref(username?: string | null): string {
  return username
    ? `https://2libra.com/user/${encodeURIComponent(username)}/about`
    : 'https://2libra.com';
}
