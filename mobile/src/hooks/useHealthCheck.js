import { useState, useCallback } from 'react';

let backend = null;
try {
  backend = require('@ar-viewer/shared').backend;
} catch {
  // Backend module unavailable in this environment (e.g. tests without the package).
}

/**
 * Provides backend health-check state and a trigger function.
 *
 * Separating this from SettingsScreen satisfies SRP: the screen handles
 * rendering; this hook handles the async side-effect and its loading state.
 *
 * @returns {{ data, loading, error, check }}
 */
export function useHealthCheck() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const check = useCallback(async () => {
    if (!backend) {
      setError('Backend module not available.');
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await backend.health();
      setData(result);
    } catch (err) {
      setError(err?.message || 'Could not reach the backend.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { data, loading, error, check };
}
