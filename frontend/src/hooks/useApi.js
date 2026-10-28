import { useEffect, useState } from 'react';
import api, { errorMessage } from '../services/api';
import { useRefresh } from '../context/refreshContext';

// Loads one backend endpoint, e.g. useApi('/dashboard/summary', { startDate, endDate }).
// - Reloads when the path, the params or the global refresh signal change.
// - Cancels the old request (AbortController) when a new one starts, so answers never arrive out of order.
// - If a request fails, the LAST GOOD DATA is kept and only `error` is set.
// Returns { data, meta, lastSyncedAt, receivedAt, error, loading }.
// receivedAt = this browser's time when the last good answer arrived (to tell how long ago that was).
export function useApi(path, params) {
  const { refreshKey } = useRefresh();
  const paramsKey = JSON.stringify(params ?? {});
  const requestKey = `${path}|${paramsKey}|${refreshKey}`;

  const [result, setResult] = useState({
    key: null,
    data: null,
    meta: null,
    lastSyncedAt: null,
    receivedAt: null,
    error: null,
  });

  useEffect(() => {
    const controller = new AbortController();
    api
      .get(path, { params: JSON.parse(paramsKey), signal: controller.signal })
      .then((body) =>
        setResult({
          key: requestKey,
          data: body.data,
          meta: body.meta ?? null,
          lastSyncedAt: body.lastSyncedAt ?? null,
          receivedAt: Date.now(),
          error: null,
        })
      )
      .catch((error) => {
        if (controller.signal.aborted) return; // replaced by a newer request
        setResult((previous) => ({ ...previous, key: requestKey, error: errorMessage(error) }));
      });
    return () => controller.abort();
  }, [path, paramsKey, requestKey]);

  return { ...result, loading: result.key !== requestKey };
}
