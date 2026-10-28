import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { RefreshContext, REFRESH_INTERVAL_SECONDS } from './refreshContext';
import { useDisplay } from './displayContext';
import { requestActivity } from '../services/api';

const INTERVAL_MS = REFRESH_INTERVAL_SECONDS * 1000;
// Wake-up recovery (Display mode only): a 5 s heartbeat; a gap much longer than that means the PC slept.
const HEARTBEAT_MS = 5000;
const SLEEP_GAP_MS = 20_000;
// After the network comes back, reload unless the last reload was within this time.
const ONLINE_MIN_AGE_MS = 5000;

export default function RefreshProvider({ children }) {
  const { displayMode } = useDisplay();
  const [refreshKey, setRefreshKey] = useState(0);
  const [startedAt] = useState(() => Date.now());
  const lastRefreshAt = useRef(startedAt); // the first load happens right away
  const refresh = useCallback(() => {
    lastRefreshAt.current = Date.now();
    setRefreshKey((key) => key + 1);
  }, []);
  // When the next automatic refresh is due (ms timestamp); only used to show a countdown.
  const [nextRefreshAt, setNextRefreshAt] = useState(() => Date.now() + INTERVAL_MS);
  // Bumped by a wake-up reload so the 30 s timer starts over (no second reload a moment later).
  const [timerEpoch, setTimerEpoch] = useState(0);

  // Automatic refresh. Skipped while requests are still running, so refreshes never pile up,
  // and skipped if a reload JUST happened (e.g. a wake-up reload a moment before this tick).
  useEffect(() => {
    const timer = setInterval(() => {
      setNextRefreshAt(Date.now() + INTERVAL_MS);
      if (requestActivity.getSnapshot() === 0 && Date.now() - lastRefreshAt.current >= 2000) refresh();
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [refresh, timerEpoch]);

  // Wake-up recovery, ONLY in Display mode (Display mode OFF = the normal system, unchanged).
  // Reloads at once when the screen is shown again, the window gets focus, the PC wakes from sleep or the
  // network comes back, but only if the data is older than the refresh interval and nothing is loading.
  // It reloads from OUR backend (like the 30 s refresh); the backend alone reads Odoo, read-only.
  useEffect(() => {
    if (!displayMode) return;

    const catchUp = (minAgeMs) => {
      if (document.visibilityState !== 'visible') return; // hidden: reload when shown again
      if (requestActivity.getSnapshot() > 0) return; // already loading
      if (Date.now() - lastRefreshAt.current < minAgeMs) return; // data is fresh enough
      refresh();
      setNextRefreshAt(Date.now() + INTERVAL_MS);
      setTimerEpoch((epoch) => epoch + 1);
    };

    const onVisible = () => catchUp(INTERVAL_MS);
    const onFocus = () => catchUp(INTERVAL_MS);
    const onOnline = () => catchUp(ONLINE_MIN_AGE_MS);
    // Timers stop while the PC sleeps; a long gap between two beats means it just woke up.
    let lastBeat = Date.now();
    const heartbeat = setInterval(() => {
      const now = Date.now();
      if (now - lastBeat > SLEEP_GAP_MS) catchUp(INTERVAL_MS);
      lastBeat = now;
    }, HEARTBEAT_MS);

    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onFocus);
    window.addEventListener('online', onOnline);
    return () => {
      clearInterval(heartbeat);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
    };
  }, [displayMode, refresh]);

  const value = useMemo(() => ({ refreshKey, refresh, nextRefreshAt }), [refreshKey, refresh, nextRefreshAt]);
  return <RefreshContext.Provider value={value}>{children}</RefreshContext.Provider>;
}
