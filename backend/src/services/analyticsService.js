import { toLocalDate, addDays, daysBetween } from '../utils/dateUtils.js';

// All dashboard numbers are calculated here from the in-memory snapshot (never from Odoo directly).
// Every function is "pure": data in, result out. That makes them easy to unit-test.
//
// KPI DEFINITIONS
// - Total Sales Orders     = number of unique orders matching the filters (any status unless filtered).
// - Confirmed Sales Orders = orders with status "confirmed".
// - Quotations             = "quotation" + "quotation_sent".
// - Cancelled              = "cancelled".
// - Total Sales Amount     = SUM of amountTotalBase over CONFIRMED orders only, in the base currency (PHP).
// - Average Order Value    = Total Sales Amount / number of confirmed orders that have a PHP amount (0 if none).
// Quotations and cancelled orders are never counted in sales amounts.
// Amounts are converted to PHP with each order's stored currency rate: an estimate for monitoring,
// not accounting figures. An order whose PHP amount is unknown (no rate) is counted but not summed.

const round2 = (n) => Math.round(n * 100) / 100;

// --- Filtering ----------------------------------------------------------------

// filters = output of parseFilters(): { startDate, endDate, statuses, salesperson, customer, search }
export function filterOrders(orders, filters, timeZone) {
  const { startDate, endDate, statuses, salesperson, customer, search } = filters;
  const needle = search ? search.toLowerCase() : null;

  return orders.filter((o) => {
    if (startDate || endDate) {
      const day = toLocalDate(o.orderDate, timeZone); // business date, not UTC
      if (!day) return false;
      if (startDate && day < startDate) return false;
      if (endDate && day > endDate) return false;
    }
    if (statuses && !statuses.includes(o.status)) return false;
    if (salesperson === 'unassigned' && o.salespersonId !== null) return false;
    if (typeof salesperson === 'number' && o.salespersonId !== salesperson) return false;
    if (customer && o.customerId !== customer) return false;
    if (
      needle &&
      !String(o.reference || '').toLowerCase().includes(needle) &&
      !String(o.customerName || '').toLowerCase().includes(needle)
    ) {
      return false;
    }
    return true;
  });
}

// --- KPIs ---------------------------------------------------------------------

export function summarize(orders) {
  let confirmedOrders = 0;
  let confirmedWithAmount = 0;
  let quotations = 0;
  let cancelledOrders = 0;
  let totalSalesAmount = 0;

  for (const o of orders) {
    if (o.status === 'confirmed') {
      confirmedOrders += 1;
      if (o.amountTotalBase !== null) {
        confirmedWithAmount += 1;
        totalSalesAmount += o.amountTotalBase;
      }
    } else if (o.status === 'quotation' || o.status === 'quotation_sent') {
      quotations += 1;
    } else if (o.status === 'cancelled') {
      cancelledOrders += 1;
    }
  }

  return {
    totalOrders: orders.length,
    confirmedOrders,
    quotations,
    cancelledOrders,
    totalSalesAmount: round2(totalSalesAmount),
    averageOrderValue: confirmedWithAmount ? round2(totalSalesAmount / confirmedWithAmount) : 0,
    confirmedWithoutRate: confirmedOrders - confirmedWithAmount, // normally 0
  };
}

// --- Order status -------------------------------------------------------------

// Count and PHP total per status (the total of quotations/cancelled is shown for context only;
// it is never part of "Total Sales Amount").
export function orderStatusBreakdown(orders) {
  const result = {
    quotation: { status: 'quotation', count: 0, amount: 0 },
    quotation_sent: { status: 'quotation_sent', count: 0, amount: 0 },
    confirmed: { status: 'confirmed', count: 0, amount: 0 },
    cancelled: { status: 'cancelled', count: 0, amount: 0 },
  };
  for (const o of orders) {
    const row = result[o.status];
    if (!row) continue;
    row.count += 1;
    if (o.amountTotalBase !== null) row.amount += o.amountTotalBase;
  }
  return Object.values(result).map((r) => ({ ...r, amount: round2(r.amount) }));
}

// --- Order line amounts -----------------------------------------------------------

// A line's subtotal is in its ORDER's currency. PHP amount = subtotal / that order's rate.
// (Used by the sales-order detail endpoint.)
export function lineAmountBase(line, order, baseCurrency) {
  if (order.currency === baseCurrency) return line.subtotal;
  if (order.currencyRate) return line.subtotal / order.currencyRate;
  return null;
}

// --- Salespersons -----------------------------------------------------------------

// orderCount = all matching orders; salesAmount = confirmed orders only (PHP).
function groupOrders(orders, keyOf, makeRow) {
  const groups = new Map();
  for (const o of orders) {
    const key = keyOf(o);
    let g = groups.get(key);
    if (!g) {
      g = { ...makeRow(o), orderCount: 0, confirmedOrders: 0, salesAmount: 0 };
      groups.set(key, g);
    }
    g.orderCount += 1;
    if (o.status === 'confirmed') {
      g.confirmedOrders += 1;
      if (o.amountTotalBase !== null) g.salesAmount += o.amountTotalBase;
    }
  }
  return [...groups.values()]
    .map((g) => ({ ...g, salesAmount: round2(g.salesAmount) }))
    .sort((a, b) => b.salesAmount - a.salesAmount || b.orderCount - a.orderCount);
}

export function salespersonPerformance(orders) {
  return groupOrders(
    orders,
    (o) => o.salespersonId ?? 'unassigned',
    (o) => ({ salespersonId: o.salespersonId, salespersonName: o.salespersonName })
  );
}

// --- Period comparison ----------------------------------------------------------

const pctChange = (current, previous) =>
  previous === 0 ? null : Math.round(((current - previous) / previous) * 1000) / 10;

// Selected period vs the previous period of the same length (e.g. 1-31 Oct vs 31 Aug-30 Sep).
// Other filters (status, salesperson, ...) apply to both periods.
export function comparePeriods(allOrders, filters, timeZone) {
  const { startDate, endDate } = filters;
  const length = daysBetween(startDate, endDate) + 1;
  const previousRange = { startDate: addDays(startDate, -length), endDate: addDays(startDate, -1) };

  const current = summarize(filterOrders(allOrders, filters, timeZone));
  const previous = summarize(filterOrders(allOrders, { ...filters, ...previousRange }, timeZone));

  const change = {};
  for (const key of ['totalOrders', 'confirmedOrders', 'quotations', 'cancelledOrders', 'totalSalesAmount', 'averageOrderValue']) {
    change[key] = pctChange(current[key], previous[key]);
  }

  return {
    currentPeriod: { startDate, endDate, days: length },
    previousPeriod: { ...previousRange, days: length },
    current,
    previous,
    changePercent: change, // null when the previous value is 0
  };
}

// --- Filter dropdown options ----------------------------------------------------

export function filterOptions(orders) {
  const salespersons = new Map();
  const customers = new Map();
  let hasUnassigned = false;

  for (const o of orders) {
    if (o.salespersonId === null) hasUnassigned = true;
    else salespersons.set(o.salespersonId, o.salespersonName);
    if (o.customerId !== null) customers.set(o.customerId, o.customerName);
  }

  const byName = (a, b) => a.name.localeCompare(b.name);
  const salespersonList = [...salespersons].map(([id, name]) => ({ id, name })).sort(byName);
  if (hasUnassigned) salespersonList.push({ id: 'unassigned', name: 'Unassigned' });

  return {
    salespersons: salespersonList,
    customers: [...customers].map(([id, name]) => ({ id, name })).sort(byName),
  };
}

// --- Sales order list and detail -----------------------------------------------

// Sorting by amount uses the PHP amount so orders in different currencies compare fairly.
export function listOrders(orders, { page, limit, sortBy, sortOrder }) {
  const valueOf = sortBy === 'amount' ? (o) => o.amountTotalBase : (o) => o.orderDate;
  const direction = sortOrder === 'asc' ? 1 : -1;

  const sorted = [...orders].sort((a, b) => {
    const va = valueOf(a);
    const vb = valueOf(b);
    if (va === null && vb === null) return b.id - a.id;
    if (va === null) return 1; // missing values always last
    if (vb === null) return -1;
    if (va < vb) return -direction;
    if (va > vb) return direction;
    return b.id - a.id; // stable tie-break: newest record first
  });

  const total = sorted.length;
  const start = (page - 1) * limit;
  return {
    items: sorted.slice(start, start + limit),
    meta: { total, page, limit, totalPages: Math.max(1, Math.ceil(total / limit)) },
  };
}

export function orderDetail(order, lines, baseCurrency) {
  const orderLines = lines
    .filter((l) => l.orderId === order.id)
    .map((l) => {
      const subtotalBase = lineAmountBase(l, order, baseCurrency);
      return { ...l, subtotalBase: subtotalBase === null ? null : round2(subtotalBase) };
    });
  return { ...order, lines: orderLines };
}
