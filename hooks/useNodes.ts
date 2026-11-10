import { useCallback, useEffect, useState } from 'react';
import { loadNodes } from '../lib/nodes';
import type { ApiNode } from '../lib/types';

export function useNodes() {
  const [nodes, setNodes] = useState<ApiNode[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async (force = false) => {
    setStatus((current) => (current === 'ready' ? current : 'loading'));
    try {
      const next = await loadNodes(force);
      setNodes(next);
      setStatus('ready');
      setError(null);
    } catch (cause) {
      setError(cause);
      setStatus((current) => (current === 'ready' ? current : 'error'));
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { nodes, status, error, reload };
}
