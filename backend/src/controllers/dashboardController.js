import { appConfig } from '../config/app.js';
import { getReadySnapshot } from '../services/syncService.js';
import { getOperationsSnapshot } from '../services/operationsSyncService.js';
import * as analytics from '../services/analyticsService.js';
import * as statusPanels from '../services/orderStatusAnalytics.js';
import { parseFilters, parseLimit } from '../utils/validation.js';
import { HttpError } from '../utils/httpError.js';
import { sendSuccess } from '../utils/response.js';

const timeZone = appConfig.timezone;

// Validates the shared filters, then returns the snapshot and the orders that match them.
// meta tells the frontend exactly what the numbers include.
function load(req) {
  const filters = parseFilters(req.query);
  const snapshot = getReadySnapshot();
  const orders = analytics.filterOrders(snapshot.orders, filters, timeZone);
  const meta = { filters, baseCurrency: snapshot.baseCurrency, timezone: timeZone };
  return { filters, snapshot, orders, meta };
}

export function summary(req, res) {
  const { snapshot, orders, meta } = load(req);
  sendSuccess(res, {
    data: analytics.summarize(orders),
    message: 'Dashboard summary retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta,
  });
}

export function orderStatus(req, res) {
  const { snapshot, orders, meta } = load(req);
  sendSuccess(res, {
    data: analytics.orderStatusBreakdown(orders),
    message: 'Order status breakdown retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta,
  });
}

export function salespersons(req, res) {
  const { snapshot, orders, meta } = load(req);
  sendSuccess(res, {
    data: analytics.salespersonPerformance(orders),
    message: 'Salesperson performance retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta,
  });
}

export function comparison(req, res) {
  const filters = parseFilters(req.query);
  if (!filters.startDate || !filters.endDate) {
    throw new HttpError(400, '"startDate" and "endDate" are both required for a comparison');
  }
  const snapshot = getReadySnapshot();
  sendSuccess(res, {
    data: analytics.comparePeriods(snapshot.orders, filters, timeZone),
    message: 'Period comparison retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: { filters, baseCurrency: snapshot.baseCurrency, timezone: timeZone },
  });
}

// Lists for the filter dropdowns (from ALL orders, not the filtered ones).
export function filterOptions(req, res) {
  const snapshot = getReadySnapshot();
  sendSuccess(res, {
    data: analytics.filterOptions(snapshot.orders),
    message: 'Filter options retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
  });
}

// --- Order-status panels (counts only, no money) ---------------------------------------

// A. Orders in the period by status, plus the cancellation rate.
export function statusCounts(req, res) {
  const { snapshot, orders, meta } = load(req);
  sendSuccess(res, {
    data: statusPanels.statusCounts(orders),
    message: 'Status counts retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta,
  });
}

// H. Confirmed orders in the period by delivery status.
export function deliveryStatus(req, res) {
  const { snapshot, orders, meta } = load(req);
  sendSuccess(res, {
    data: statusPanels.deliveryStatusCounts(orders),
    message: 'Delivery status retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta,
  });
}

// I. Confirmed orders past their promised delivery date (all periods: it is the current backlog).
export function lateOrders(req, res) {
  const limit = parseLimit(req.query, 10);
  const snapshot = getReadySnapshot();
  const late = statusPanels.lateOrders(snapshot.orders, timeZone, { limit });
  let openSalesOrders = [];
  try {
    openSalesOrders = getOperationsSnapshot().openSalesOrders; // for Odoo's Expected Date
  } catch {
    // operations data not ready yet: Expected Date shows as unavailable
  }
  sendSuccess(res, {
    data: { ...late, items: statusPanels.withExpectedDate(late.items, openSalesOrders) },
    message: 'Late orders retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: { timezone: timeZone },
  });
}

// E. Open quotations by age (all periods: it is the current backlog).
export function quotationAging(req, res) {
  const snapshot = getReadySnapshot();
  sendSuccess(res, {
    data: statusPanels.quotationAging(snapshot.orders, timeZone),
    message: 'Quotation aging retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: { timezone: timeZone },
  });
}
