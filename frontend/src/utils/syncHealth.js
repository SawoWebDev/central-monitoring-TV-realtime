// How healthy the copy of Odoo data is, worked out from the backend's status answer (sales or production).
// Used by the Settings page ("Odoo status"). The rules, from best to worst:
//   smooth       last copy worked and the data is no older than one normal cycle (wait + copy time)
//   stable       last copy worked, the data is older than one cycle but still within what is allowed (a copy is running late)
//   starting     the first copy after a restart is still running
//   delayed      the last copy failed; the previous data is still shown and the server tries again by itself
//   outdated     the data is older than allowed (two cycles)
//   unreachable  this screen cannot reach our server at all
export const HEALTH = {
  smooth: { rank: 0, label: 'Smooth', tone: 'emerald' },
  stable: { rank: 1, label: 'Stable', tone: 'sky' },
  starting: { rank: 2, label: 'Starting', tone: 'neutral' },
  delayed: { rank: 3, label: 'Delayed', tone: 'amber' },
  outdated: { rank: 4, label: 'Outdated', tone: 'rose' },
  unreachable: { rank: 5, label: 'Unreachable', tone: 'rose' },
};

// How old the data is, in seconds: the server's own age of the data when it answered + the time that has passed in THIS browser
// since then (so the PC clock does not matter). null when the server has no data yet.
export function dataAge(request, now = Date.now()) {
  const d = request?.data;
  if (!d || d.dataAgeSeconds == null) return null;
  return d.dataAgeSeconds + (request.receivedAt ? (now - request.receivedAt) / 1000 : 0);
}

// request = what useApi() returns for /sync/status or /operations/status ({ data, error, receivedAt })
export function syncHealth(request, now = Date.now()) {
  const d = request?.data;
  if (!d) {
    return request?.error
      ? { level: 'unreachable', reason: 'This screen cannot reach our server.' }
      : { level: 'starting', reason: 'Waiting for the first answer from our server.' };
  }
  const age = dataAge(request, now);
  if (request.error) return { level: 'unreachable', reason: 'Our server cannot be reached now; the last known data is shown.' };
  if (d.connection === 'connecting' || age === null) return { level: 'starting', reason: 'The first copy from Odoo is still running.' };
  if (age > d.staleAfterSeconds) return { level: 'outdated', reason: 'The data is older than allowed. Odoo or the copy is not answering in time.' };
  if (d.connection === 'error') return { level: 'delayed', reason: 'The last copy from Odoo failed. The previous data is shown and the server tries again by itself.' };
  const oneCycle = d.syncIntervalSeconds + (d.lastSyncDurationSeconds ?? 0) + 10; // wait + copy time (+ a little slack)
  if (age > oneCycle) return { level: 'stable', reason: 'The data is a little older than usual: a copy is taking longer than the last time.' };
  return { level: 'smooth', reason: 'The last copy worked and the data is up to date.' };
}

// The worst of several health results (for the one "Odoo status" at the top)
export function worstHealth(results) {
  return results.reduce((worst, r) => (HEALTH[r.level].rank > HEALTH[worst.level].rank ? r : worst));
}

// 158 -> "2 min 38 s", 45 -> "45 s", 120 -> "2 min"
export function formatDuration(seconds) {
  if (seconds == null) return '—';
  const s = Math.round(seconds);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return s % 60 === 0 ? `${m} min` : `${m} min ${s % 60} s`;
}

// 75 -> "1 min ago", 8 -> "Just Now"
export function formatAgo(seconds) {
  if (seconds == null) return '—';
  if (seconds < 20) return 'Just Now';
  return `${formatDuration(seconds < 90 ? Math.round(seconds / 10) * 10 : Math.round(seconds / 30) * 30)} ago`;
}
