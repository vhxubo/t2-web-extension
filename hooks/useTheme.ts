import { useEffect, useState } from 'react';
import type { ThemePreference } from '../lib/storage';
import {
  applyTheme,
  resolveTheme,
  watchSystemTheme,
  type ResolvedTheme,
} from '../lib/theme';

/** 读取 bootstrapTheme 已经写到根节点上的实际主题。 */
function getAppliedTheme(): ResolvedTheme {
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    if (root.classList.contains('dark')) return 'dark';
    if (root.classList.contains('light')) return 'light';
  }
  return resolveTheme('system');
}

/**
 * 同步设置里的外观偏好到 <html>，并返回当前实际生效的浅色 / 深色。
 * 页面初始化时会由 bootstrapTheme 先应用一次；这里负责偏好变化和系统主题变化的实时更新。
 */
export function useTheme(preference: ThemePreference | undefined): ResolvedTheme {
  const [resolved, setResolved] = useState<ResolvedTheme>(getAppliedTheme);

  useEffect(() => {
    // 设置还没读出来时不要覆盖 bootstrapTheme 已经应用好的主题。
    if (!preference) return;

    setResolved(applyTheme(preference));

    if (preference !== 'system') return;
    return watchSystemTheme(() => setResolved(applyTheme('system')));
  }, [preference]);

  return resolved;
}
