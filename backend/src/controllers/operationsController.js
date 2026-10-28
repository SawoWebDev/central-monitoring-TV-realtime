import { appConfig } from '../config/app.js';
import { getOperationsSnapshot, getOperationsStatus } from '../services/operationsSyncService.js';
import * as ops from '../services/operationsAnalytics.js';
import { manufacturingCbm, missingVolumeCsv } from '../services/manufacturingCbm.js';
import * as openOrders from '../services/openOrders.js';
import { fetchOrderExportData, orderWorkbook, orderFileName } from '../services/orderExport.js';
import { getClient } from '../services/odooService.js';
import { HttpError } from '../utils/httpError.js';
import { parseBoolean, parseChoice, parseLimit, parseOptionalInt, parsePage, parseText } from '../utils/validation.js';
import { sendSuccess } from '../utils/response.js';

const timeZone = appConfig.timezone;

export function status(req, res) {
  const data = getOperationsStatus();
  sendSuccess(res, { data, message: 'Operations sync status retrieved successfully', lastSyncedAt: data.lastSyncedAt });
}

export function cbmShipped(req, res) {
  const snapshot = getOperationsSnapshot();
  sendSuccess(res, {
    data: ops.cbmShipped(snapshot, timeZone),
    message: 'CBM shipped per plant retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: { timezone: timeZone, unit: 'm³' },
  });
}

// GET /api/operations/cbm-shipped/monthly: finished goods shipped per month, split by product group (no plants).
export function cbmShippedMonthly(req, res) {
  const snapshot = getOperationsSnapshot();
  sendSuccess(res, {
    data: ops.cbmShippedMonthly(snapshot, timeZone),
    message: 'CBM shipped per month retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: { timezone: timeZone, unit: 'm³', groups: ['Accessories', 'Heaters', 'Sauna Rooms', 'Other'] },
  });
}

export function leadTime(req, res) {
  const snapshot = getOperationsSnapshot();
  sendSuccess(res, {
    data: ops.leadTime(snapshot, timeZone),
    message: 'Lead-time stages retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: { timezone: timeZone },
  });
}

export function manufacturing(req, res) {
  const snapshot = getOperationsSnapshot();
  sendSuccess(res, {
    data: ops.manufacturingByPlant(snapshot, timeZone),
    message: 'Manufacturing orders per plant retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: { timezone: timeZone },
  });
}

// --- Manufacturing CBM by plant x product category ------------------------------------

function moCbmOptions(query) {
  return {
    periodKey: parseChoice(query, 'period', ['today', 'week', 'month'], 'month'),
    includeSemiFinished: parseBoolean(query, 'semiFinished', false),
    linkedOnly: parseBoolean(query, 'linkedOnly', false),
    level: parseChoice(query, 'level', ['full', 'level3'], 'full'),
  };
}

// GET /api/operations/mo-cbm: table + per-plant totals + warnings (missing-volume list cut to 10 rows).
export function moCbm(req, res) {
  const options = moCbmOptions(req.query);
  const snapshot = getOperationsSnapshot();
  const result = manufacturingCbm(snapshot, timeZone, options);
  sendSuccess(res, {
    data: { ...result, missingVolume: result.missingVolume.slice(0, 10), missingVolumeTotal: result.missingVolume.length },
    message: 'Manufacturing CBM retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: { timezone: timeZone, unit: 'm³' },
  });
}

// GET /api/operations/mo-cbm/missing-volume.csv: every product without a volume (same filters).
export function moCbmMissingVolumeCsv(req, res) {
  const options = moCbmOptions(req.query);
  const snapshot = getOperationsSnapshot();
  const { missingVolume } = manufacturingCbm(snapshot, timeZone, options);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="products-missing-volume.csv"');
  res.send(missingVolumeCsv(missingVolume));
}

// --- Open Sales Ordered + Open SO by Product Category (NO money) ------------------------

function openOrderFilters(query) {
  return {
    search: parseText(query, 'search', 100),
    customer: parseOptionalInt(query, 'customer'),
    category: parseText(query, 'category', 300),
    age: parseChoice(query, 'age', ['all', ...openOrders.AGE_BUCKETS.map((b) => b.key)], 'all'),
    lateOnly: parseBoolean(query, 'lateOnly', false),
  };
}

// Customers that have open orders (for the filter dropdown), with their number of open orders.
function customerOptions(orders) {
  const map = new Map();
  for (const o of orders) {
    if (o.customerId == null) continue;
    const c = map.get(o.customerId) ?? { id: o.customerId, name: o.customerName, openOrders: 0 };
    c.openOrders += 1;
    map.set(o.customerId, c);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
}

// GET /api/operations/open-orders: filtered, sorted, paginated open orders (lines included for expanding).
export function openOrderList(req, res) {
  const filters = openOrderFilters(req.query);
  const sortBy = parseChoice(req.query, 'sortBy', openOrders.SORT_FIELDS, 'daysOpen');
  const sortOrder = parseChoice(req.query, 'sortOrder', ['asc', 'desc'], 'desc');
  const page = parsePage(req.query);
  const limit = parseLimit(req.query, 20);
  const snapshot = getOperationsSnapshot();
  const all = openOrders.buildOpenOrders(snapshot, timeZone);
  const matching = openOrders.sortOpenOrders(openOrders.filterOpenOrders(all, filters), sortBy, sortOrder);
  const start = (page - 1) * limit;
  sendSuccess(res, {
    data: matching.slice(start, start + limit),
    message: 'Open sales orders retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: {
      total: matching.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(matching.length / limit)),
      sortBy,
      sortOrder,
      filters,
      counts: {
        openOrders: all.length,
        late: matching.filter((o) => o.late).length,
        noDeliveryDate: matching.filter((o) => o.noDeliveryDate).length,
      },
      customers: customerOptions(all),
      ageBuckets: openOrders.AGE_BUCKETS.map(({ key, label }) => ({ key, label })),
      timezone: timeZone,
      unit: 'm³',
    },
  });
}

// GET /api/operations/open-orders.csv: every order matching the filters (no money columns).
export function openOrderCsv(req, res) {
  const filters = openOrderFilters(req.query);
  const sortBy = parseChoice(req.query, 'sortBy', openOrders.SORT_FIELDS, 'daysOpen');
  const sortOrder = parseChoice(req.query, 'sortOrder', ['asc', 'desc'], 'desc');
  const snapshot = getOperationsSnapshot();
  const rows = openOrders.sortOpenOrders(openOrders.filterOpenOrders(openOrders.buildOpenOrders(snapshot, timeZone), filters), sortBy, sortOrder);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="open-sales-orders.csv"');
  res.send(openOrders.openOrdersCsv(rows, timeZone));
}

// GET /api/operations/open-orders/:id/export.xlsx: one open order as an Excel file (layout of the "SO 9259" sample).
// Reads that one order from Odoo (read-only), then builds the file here. Nothing is written to Odoo.
export async function openOrderExcel(req, res) {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) throw new HttpError(400, 'Invalid order id');
  const snapshot = getOperationsSnapshot();
  if (!snapshot.openSalesOrders.some((so) => so.id === id)) throw new HttpError(404, 'Open sales order not found');
  const data = await fetchOrderExportData(getClient(), id);
  if (!data) throw new HttpError(404, 'Open sales order not found');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${orderFileName(data.reference)}"`);
  res.send(orderWorkbook(data));
}

// GET /api/operations/open-orders/by-category: remaining lines per product category.
// Uses the same filters as the table EXCEPT the category itself (so the board shows every category).
export function openOrderCategories(req, res) {
  const filters = { ...openOrderFilters(req.query), category: null };
  const level = parseChoice(req.query, 'level', ['full', 'level3'], 'full');
  const snapshot = getOperationsSnapshot();
  const orders = openOrders.filterOpenOrders(openOrders.buildOpenOrders(snapshot, timeZone), filters);
  sendSuccess(res, {
    data: openOrders.openOrdersByCategory(orders, level),
    message: 'Open sales orders by product category retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: { level, filters, openOrders: orders.length, unit: 'm³' },
  });
}
