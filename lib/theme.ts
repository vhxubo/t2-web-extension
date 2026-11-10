import { readSettings, type ThemePreference } from './storage';

/** 实际落到页面上的主题，只有浅色 / 深色两种。 */
export type ResolvedTheme = 'light' | 'dark';

const DARK_QUERY = '(prefers-color-scheme: dark)';

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(DARK_QUERY).matches
    : false;
}

/** 把三态偏好解析成当前应该使用的主题。 */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (preference === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return preference;
}

/**
 * 把主题写到根节点：
 * - `<html class="dark">` / `<html class="light">` 供 CSS 变量切换；
 * - `data-theme` 保留用户的原始偏好，方便调试和后续样式扩展；
 * - `color-scheme` 让原生滚动条、表单控件跟着变。
 */
export function applyTheme(
  preference: ThemePreference,
  root: HTMLElement = document.documentElement,
): ResolvedTheme {
  const resolved = resolveTheme(preference);
  root.classList.toggle('dark', resolved === 'dark');
  root.classList.toggle('light', resolved === 'light');
  root.dataset.theme = preference;
  root.style.colorScheme = resolved;
  return resolved;
}

/** 订阅系统深浅色变化；调用方只在偏好为 system 时使用。 */
export function watchSystemTheme(onChange: (resolved: ResolvedTheme) => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return () => {};
  }

  const media = window.matchMedia(DARK_QUERY);
  const handleChange = () => onChange(media.matches ? 'dark' : 'light');
  media.addEventListener('change', handleChange);
  return () => media.removeEventListener('change', handleChange);
}

/**
 * 页面启动时先按系统主题兜底，再读取 chrome.storage.local 里的偏好覆盖。
 * 在 React 渲染前调用，避免深色用户先看到一帧白底。
 */
export async function bootstrapTheme(): Promise<ResolvedTheme> {
  applyTheme('system');
  try {
    const settings = await readSettings();
    return applyTheme(settings.theme);
  } catch (error) {
    console.warn('[T2] 主题偏好读取失败，继续跟随系统。', error);
    return resolveTheme('system');
  }
}
