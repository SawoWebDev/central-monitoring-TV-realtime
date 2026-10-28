import { appConfig } from '../config/app.js';
import { fetchOperationsData } from './operationsService.js';
import { HttpError } from '../utils/httpError.js';

// In-memory copy of the manufacturing / shipping data. Works like syncService.js:
// never two syncs at once, keeps the last good data if Odoo fails, waits N seconds after each sync.
const state = {
  data: null,
  lastSyncedAt: null,
  lastAttemptAt: null,
  lastDurationMs: null,
  lastError: null,
  isSyncing: false,
};

export async function runOperationsSync() {
  if (state.isSyncing) return;
  state.isSyncing = true;
  const startedAt = Date.now();
  state.lastAttemptAt = new Date(startedAt).toISOString();
  try {
    const data = await fetchOperationsData();
    state.data = data;
    state.lastSyncedAt = new Date().toISOString();
    state.lastError = null;
    console.log(
      `[operations sync] OK: ${data.openMos.length} open MOs, ${data.openSalesOrders.length} open sales orders, ` +
        `${data.shippedMoves.length} shipped lines (${((Date.now() - startedAt) / 1000).toFixed(1)}s)`
    );
  } catch (err) {
    state.lastError = err.message;
    console.error('[operations sync] FAILED (keeping previous data):', err.message);
  } finally {
    state.lastDurationMs = Date.now() - startedAt;
    state.isSyncing = false;
  }
}

export function startOperationsSync(intervalSeconds = appConfig.operationsSyncIntervalSeconds) {
  const loop = async () => {
    await runOperationsSync(); // never throws
    setTimeout(loop, intervalSeconds * 1000);
  };
  loop();
}

// The current data; 503 until the first operations sync has succeeded.
export function getOperationsSnapshot() {
  if (!state.lastSyncedAt) {
    throw new HttpError(503, 'Operations data is not available yet: the first sync with Odoo is still running. Try again shortly.');
  }
  return { ...state.data, lastSyncedAt: state.lastSyncedAt };
}

export function getOperationsStatus() {
  const interval = appConfig.operationsSyncIntervalSeconds;
  const lastDurationSeconds = state.lastDurationMs !== null ? Math.ceil(state.lastDurationMs / 1000) : null;
  const staleAfterSeconds = 2 * (interval + (lastDurationSeconds ?? interval));
  const dataAgeSeconds = state.lastSyncedAt
    ? Math.round((Date.now() - Date.parse(state.lastSyncedAt)) / 1000)
    : null;

  let connection = 'ok';
  if (state.lastError) connection = 'error';
  else if (!state.lastSyncedAt) connection = 'connecting';

  const d = state.data;
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
    customerScope: appConfig.customerScope,
    period: d?.period ?? null,
    counts: d
      ? {
          warehouses: d.warehouses.length,
          shippedLinesSincePeriodStart: d.shippedMoves.length,
          productsWithVolumeData: Object.keys(d.productVolumes).length,
          doneDeliveriesWithSalesOrder: d.doneDeliveries.length,
          openManufacturingOrders: d.openMos.length,
          finishedManufacturingOrders: d.finishedMos.length,
          openSalesOrders: d.openSalesOrders.length,
          deliveredSalesOrders: d.deliveredSalesOrders.length,
          linkedManufacturingOrders: Object.keys(d.moStates).length,
        }
      : null,
    errorMessage: state.lastError ? 'Could not retrieve the latest operations data from Odoo' : null,
  };
}
