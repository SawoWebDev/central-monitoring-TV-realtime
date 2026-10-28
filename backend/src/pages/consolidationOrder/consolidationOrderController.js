import { appConfig } from '../../config/app.js';
import { getOperationsSnapshot } from '../../services/operationsSyncService.js';
import * as c from './consolidationOrder.js';
import { consolidationWorkbook, consolidationFileName } from './consolidationOrderExport.js';
import { HttpError } from '../../utils/httpError.js';
import { todayLocal } from '../../utils/dateUtils.js';
import { parseBoolean, parseChoice, parseDateParam, parseLimit, parsePage, parseQuantity, parseText } from '../../utils/validation.js';
import { sendSuccess } from '../../utils/response.js';

const timeZone = appConfig.timezone;

// The filters of the page (all optional, all combined): see filterRows() in consolidationOrder.js
// "so" = one or more SO numbers, separated by commas, semicolons or new lines (at most 200, each at most 50 characters)
function parseSoNumbers(query) {
  const list = c.parseSoList(parseText(query, 'so', 10000));
  if (list.length > 200) throw new HttpError(400, '"so" can have at most 200 SO numbers');
  if (list.some((t) => t.length > 50)) throw new HttpError(400, 'each SO number in "so" must be at most 50 characters');
  return list;
}

function parseFilters(query) {
  const filters = {
    so: parseSoNumbers(query),
    destination: parseText(query, 'destination', 100),
    deliveryFrom: parseDateParam(query, 'deliveryFrom'),
    deliveryTo: parseDateParam(query, 'deliveryTo'),
    deliveryMode: parseChoice(query, 'deliveryMode', ['range', 'rangeOrNoDate', 'overdue', 'noDate', 'all'], 'range'),
    productRef: parseText(query, 'productRef', 60),
    productName: parseText(query, 'productName', 100),
    qtyMin: parseQuantity(query, 'qtyMin'),
    qtyMax: parseQuantity(query, 'qtyMax'),
    includeDelivered: parseBoolean(query, 'includeDelivered', false),
    includeMo: parseBoolean(query, 'includeMo', false),
  };
  if (filters.deliveryFrom && filters.deliveryTo && filters.deliveryFrom > filters.deliveryTo) {
    throw new HttpError(400, '"deliveryFrom" must be on or before "deliveryTo"');
  }
  if (filters.qtyMin != null && filters.qtyMax != null && filters.qtyMin > filters.qtyMax) {
    throw new HttpError(400, '"qtyMin" must not be more than "qtyMax"');
  }
  return filters;
}

function load(query) {
  const snapshot = getOperationsSnapshot();
  const data = c.consolidationData(snapshot, timeZone);
  const today = todayLocal(timeZone);
  const filters = parseFilters(query);
  return { snapshot, data, today, filters, rows: c.filterRows(data.rows, filters, today) };
}

// GET /api/consolidation/lines: the filtered order lines (like the Excel sheet "Sheet4"), sorted and paged.
export function lines(req, res) {
  const sortBy = parseChoice(req.query, 'sortBy', c.SORT_FIELDS, 'deliveryDate');
  const sortOrder = parseChoice(req.query, 'sortOrder', ['asc', 'desc'], 'asc');
  const page = parsePage(req.query);
  const limit = parseLimit(req.query, 50, 200);
  const { snapshot, data, today, filters, rows } = load(req.query);
  const sorted = c.sortRows(rows, sortBy, sortOrder);
  const start = (page - 1) * limit;
  sendSuccess(res, {
    data: sorted.slice(start, start + limit),
    message: 'Consolidation order lines retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: {
      total: sorted.length,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(sorted.length / limit)),
      sortBy,
      sortOrder,
      filters,
      summary: c.summarize(rows), // of the filtered lines
      scope: { lines: data.lineCount, orders: data.orderCount, moLines: data.moLineCount, excluded: data.excluded }, // before filtering (lines still to ship; moLines = items made for an order but not on it)
      destinations: data.destinations,
      today,
      timezone: timeZone,
    },
  });
}

// GET /api/consolidation/matrix: products x sales orders (like the Excel sheet "Consolidation FG").
export function matrix(req, res) {
  const { snapshot, today, filters, rows } = load(req.query);
  const full = c.buildMatrix(rows);
  const tooWide = full.columns.length > c.MATRIX_MAX_ORDERS;
  sendSuccess(res, {
    data: tooWide ? { tooWide: true, columns: [], rows: [], grandTotal: full.grandTotal } : { tooWide: false, ...full },
    message: 'Consolidation matrix retrieved successfully',
    lastSyncedAt: snapshot.lastSyncedAt,
    meta: { orders: full.columns.length, maxOrders: c.MATRIX_MAX_ORDERS, products: full.rows.length, filters, summary: c.summarize(rows), today, timezone: timeZone },
  });
}

// GET /api/consolidation/export.xlsx: the filtered data as an Excel file (built here, nothing is written to Odoo).
export function exportExcel(req, res) {
  const { today, rows } = load(req.query);
  const sorted = c.sortRows(rows, 'deliveryDate', 'asc');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${consolidationFileName(today)}"`);
  res.send(consolidationWorkbook(c.buildMatrix(sorted), sorted));
}
