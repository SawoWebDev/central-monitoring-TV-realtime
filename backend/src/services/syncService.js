import { appConfig } from '../config/app.js';
import { fetchSalesData } from './odooService.js';
import { HttpError } from '../utils/httpError.js';

// The in-memory copy of the Odoo data. Everything the API serves comes from here.
const state = {
  orders: [],
  lines: [],
  companyName: null,
  baseCurrency: null,
  lastSyncedAt: null, // last SUCCESSFUL sync
  lastAttemptAt: null,
  lastDurationMs: null, // how long the last attempt took (success or failure)
  lastError: null,
  isSyncing: false,
};

// Reads Odoo once. Never runs twice at the same time.
// If Odoo fails, the previous data stays in place (we never replace real data with nothing).
export async function runSync() {
  if (state.isSyncing) return;
  state.isSyncing = true;
  const startedAt = Date.now();
  state.lastAttemptAt = new Date(startedAt).toISOString();
  try {
    const data = await fetchSalesData();
    state.orders = data.orders;
    state.lines = data.lines;
    state.companyName = data.companyName;
    state.baseCurrency = data.baseCurrency;
    state.lastSyncedAt = new Date().toISOString();
    state.lastError = null;
    console.log(
      `[sync] OK: ${data.orders.length} orders, ${data.lines.length} lines ` +
        `(${((Date.now() - startedAt) / 1000).toFixed(1)}s)`
    );
  } catch (err) {
    state.lastError = err.message;
    console.error('[sync] FAILED (keeping previous data):', err.message);
  } finally {
    state.lastDurationMs = Date.now() - startedAt;
    state.isSyncing = false;
  }
}

// Runs a sync now. When it finishes, waits N seconds, then runs the next one.
// (Not a fixed clock: Odoo always gets a full N-second rest between syncs,
// no matter how long a sync takes.)
export function startSync(intervalSeconds = appConfig.syncIntervalSeconds) {
  const loop = async () => {
    await runSync(); // runSync never throws, so the loop can't break
    setTimeout(loop, intervalSeconds * 1000);
  };
  loop();
}

// The current data. Treat it as read-only (never modify these arrays).
export function getSnapshot() {
  return {
    orders: state.orders,
    lines: state.lines,
    companyName: state.companyName,
    baseCurrency: state.baseCurrency,
    lastSyncedAt: state.lastSyncedAt,
  };
}

// Same as getSnapshot(), but answers 503 "not ready" until the first sync has succeeded,
// so the dashboard never shows zeros that only mean "no data loaded yet".
export function getReadySnapshot() {
  if (!state.lastSyncedAt) {
    throw new HttpError(503, 'Data is not available yet: the first sync with Odoo is still running. Try again shortly.');
  }
  return getSnapshot();
}

// Safe summary for the browser. Technical error details stay in the backend log only.
export function getStatus() {
  const interval = appConfig.syncIntervalSeconds;
  const lastDurationSeconds =
    state.lastDurationMs !== null ? Math.ceil(state.lastDurationMs / 1000) : null;

  // Normal maximum data age = wait time + time one sync takes.
  // We allow two of those cycles (so one failed sync is tolerated) before calling the data stale.
  const staleAfterSeconds = 2 * (interval + (lastDurationSeconds ?? interval));

  const dataAgeSeconds = state.lastSyncedAt
    ? Math.round((Date.now() - Date.parse(state.lastSyncedAt)) / 1000)
    : null;

  let connection = 'ok';
  if (state.lastError) connection = 'error';
  else if (!state.lastSyncedAt) connection = 'connecting';

  return {
    connection,
    isSyncing: state.isSyncing,
    lastSyncedAt: state.lastSyncedAt,
    lastAttemptAt: state.lastAttemptAt,
    lastSyncDurationSeconds: lastDurationSeconds,
    dataAgeSeconds,
    isStale: dataAgeSeconds === null || dataAgeSeconds > staleAfterSeconds,
    staleAfterSeconds,
    syncIntervalSeconds: interval,
    timezone: appConfig.timezone,
    companyName: state.companyName,
    baseCurrency: state.baseCurrency,
    orderCount: state.orders.length,
    lineCount: state.lines.length,
    errorMessage: state.lastError ? 'Could not retrieve the latest data from Odoo' : null,
  };
}
