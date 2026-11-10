import { useCallback, useEffect, useState } from 'react';
import { getMe } from '../lib/api';
import { logout } from '../lib/auth';
import { tokensItem, type TokenSet } from '../lib/storage';
import type { Profile } from '../lib/types';

export function useSession() {
  const [tokens, setTokens] = useState<TokenSet | null | undefined>(undefined);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileError, setProfileError] = useState<unknown>(null);

  useEffect(() => {
    let alive = true;

    const sync = async () => {
      const current = await tokensItem.getValue();
      if (!alive) return;
      setTokens(current ?? null);

      if (!current) {
        setProfile(null);
        setProfileError(null);
        return;
      }

      try {
        const me = await getMe();
        if (!alive) return;
        setProfile(me);
        setProfileError(null);
      } catch (error) {
        if (!alive) return;
        setProfileError(error);
      }
    };

    void sync();
    const unwatch = tokensItem.watch(() => {
      void sync();
    });

    return () => {
      alive = false;
      unwatch();
    };
  }, []);

  const signOut = useCallback(async () => {
    await logout();
    setTokens(null);
    setProfile(null);
    setProfileError(null);
  }, []);

  const reloadProfile = useCallback(async () => {
    try {
      const me = await getMe();
      setProfile(me);
      setProfileError(null);
    } catch (error) {
      setProfileError(error);
    }
  }, []);

  return {
    tokens,
    profile,
    profileError,
    signedIn: Boolean(tokens),
    loading: tokens === undefined,
    signOut,
    reloadProfile,
  };
}
