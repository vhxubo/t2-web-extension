import { useCallback, useEffect, useRef, useState } from 'react';
import { logout } from '../lib/auth';
import { resolveProfile } from '../lib/profile';
import { profileCacheItem, tokensItem, type TokenSet } from '../lib/storage';
import type { Profile } from '../lib/types';

/**
 * 登录态 + 当前用户资料（含头像）。
 *
 * 头像不是靠「顺手从某个接口里读一下」拿到的：登录后由 `resolveProfile` 分层取数
 * （精简快照 → 本地缓存 → 公开用户资料），并写回本地缓存，退出登录时清掉。
 */
export function useSession() {
  const [tokens, setTokens] = useState<TokenSet | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<unknown>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  const mounted = useRef(true);
  /** 只采纳最后一次请求的结果：StrictMode 双挂载、登录后 watch 与显式刷新会重叠。 */
  const generation = useRef(0);

  const loadProfile = useCallback(async () => {
    const run = ++generation.current;
    setProfileLoading(true);

    const cached = (await profileCacheItem.getValue().catch(() => null)) ?? null;

    try {
      const next = await resolveProfile(cached?.profile ?? null);
      if (!mounted.current || run !== generation.current) return;
      setProfile(next);
      setProfileError(null);
      void profileCacheItem
        .setValue({ profile: next, fetchedAt: Date.now() })
        .catch(() => undefined);
    } catch (error) {
      if (!mounted.current || run !== generation.current) return;
      setProfileError(error);
      // 刷新失败时保留缓存里的头像与昵称，不让界面退回「已登录」。
      if (cached?.profile) setProfile((current) => current ?? cached.profile);
    } finally {
      if (run === generation.current) setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    let alive = true;

    const sync = async () => {
      const current = await tokensItem.getValue();
      if (!alive || !mounted.current) return;
      setTokens(current ?? null);

      if (!current) {
        generation.current += 1;
        setProfile(null);
        setProfileError(null);
        setProfileLoading(false);
        return;
      }

      await loadProfile();
    };

    void sync();
    const unwatch = tokensItem.watch(() => {
      void sync();
    });

    return () => {
      alive = false;
      mounted.current = false;
      unwatch();
    };
  }, [loadProfile]);

  const signOut = useCallback(async () => {
    await logout();
    generation.current += 1;
    setTokens(null);
    setProfile(null);
    setProfileError(null);
    setProfileLoading(false);
  }, []);

  /**
   * 主动刷新资料。登录成功后要显式调一次：`tokensItem.watch` 在个别浏览器里
   * 对「本页面自己写入」的变更不保证回调，只靠 watch 会出现登录成功但仍没有头像。
   */
  const reloadProfile = useCallback(async () => {
    const current = await tokensItem.getValue();
    if (!current) return;
    await loadProfile();
  }, [loadProfile]);

  return {
    tokens,
    profile,
    profileError,
    profileLoading,
    signedIn: Boolean(tokens),
    loading: tokens === undefined,
    signOut,
    reloadProfile,
  };
}
