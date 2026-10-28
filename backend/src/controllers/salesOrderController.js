import { appConfig } from '../config/app.js';
import { getReadySnapshot } from '../services/syncService.js';
import { filterOrders, listOrders, orderDetail } from '../services/analyticsService.js';
import { parseFilters, parsePagination, parseId } from '../utils/validation.js';
import { HttpError } from '../utils/httpError.js';
import { sendSuccess } from '../utils/response.js';

// GET /api/sales-orders: filtered, sorted, paginated list (read-only).
export function list(req, res) {
  const filters = parseFilters(req.query);
  const pagination = parsePagination(req.query);
  const snapshot = getReadySnapshot();
  const orders = filterOrders(snapshot.orders, filters, appConfig.timezone);
  const { items, meta } = listOrders(orders, pagination);
  sendSuccess(res, {
    data: items,
    message: 'Sales orders retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: {
      ...meta,
      sortBy: pagination.sortBy,
      sortOrder: pagination.sortOrder,
      filters,
      baseCurrency: snapshot.baseCurrency,
      timezone: appConfig.timezone,
    },
  });
}

// GET /api/sales-orders/:id: one order with its product lines (read-only).
export function detail(req, res) {
  const id = parseId(req.params.id);
  const snapshot = getReadySnapshot();
  const order = snapshot.orders.find((o) => o.id === id);
  if (!order) throw new HttpError(404, 'Sales order not found');
  sendSuccess(res, {
    data: orderDetail(order, snapshot.lines, snapshot.baseCurrency),
    message: 'Sales order retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: { baseCurrency: snapshot.baseCurrency, timezone: appConfig.timezone },
  });
}
