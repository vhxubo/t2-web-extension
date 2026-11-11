import { useCallback, useEffect, useState } from 'react';
import {
  settingsItem,
  readSettings,
  normalizeSettings,
  type Settings,
} from '../lib/storage';

/** 串行化设置写入，避免连点节点开关时两次「读-改-写」互相覆盖。 */
let settingsWriteQueue: Promise<void> = Promise.resolve();

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

  const update = useCallback((patch: Partial<Settings>) => {
    const run = settingsWriteQueue.then(async () => {
      const current = await readSettings();
      await settingsItem.setValue({ ...current, ...patch });
    });
    settingsWriteQueue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }, []);

  return { settings, update, ready: settings !== null };
}
