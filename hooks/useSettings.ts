import { useCallback, useEffect, useState } from 'react';
import {
  settingsItem,
  readSettings,
  normalizeSettings,
  type Settings,
} from '../lib/storage';

export function useSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);

  useEffect(() => {
    let alive = true;
    void readSettings().then((value) => {
      if (alive) setSettings(value);
    });
    const unwatch = settingsItem.watch((value) => {
      setSettings(normalizeSettings(value));
    });
    return () => {
      alive = false;
      unwatch();
    };
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const current = await readSettings();
    await settingsItem.setValue({ ...current, ...patch });
  }, []);

  return { settings, update, ready: settings !== null };
}
