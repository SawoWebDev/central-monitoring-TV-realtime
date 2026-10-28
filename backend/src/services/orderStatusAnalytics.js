import { toLocalDate, daysBetween } from '../utils/dateUtils.js';

// Order-status panels shown below "Orders by Status". COUNTS ONLY: no money anywhere (client request,
// 2026-10-19). Pure functions on the normalized orders from the sales snapshot (unit-tested in
// test/orderStatusAnalytics.test.js).
//
// DEFINITIONS
// - Status counts (A): orders in the period by status. Cancellation rate = cancelled / all orders in the
//   period x 100 (null when there are no orders).
// - Delivery status (H): CONFIRMED orders in the period by Odoo's delivery status
//   (pending = not delivered, started, partial = partly delivered, full = fully delivered);
//   orders with no delivery status (nothing to deliver) are counted separately.
// - Late orders (I): ALL confirmed orders (any period) whose promised delivery date (commitment_date)
//   is before now and that are not fully delivered. Days late use business dates (APP_TIMEZONE).
// - Quotation aging (E): ALL open quotations (draft + sent, any period), by days since the quotation
//   date (date_order): 0-7, 8-30, 31-90, 90+. Expired = expiry date (validity_date) before today.

const DELIVERY_STATES = ['pending', 'started', 'partial', 'full'];
const AGE_BUCKETS = [
  { key: '0-7', label: '0–7 days', max: 7 },
  { key: '8-30', label: '8–30 days', max: 30 },
  { key: '31-90', label: '31–90 days', max: 90 },
  { key: '90+', label: 'Over 90 days', max: Infinity },
];

// --- A. Status counts ---------------------------------------------------------------

export function statusCounts(orders) {
  const counts = { quotation: 0, quotation_sent: 0, confirmed: 0, cancelled: 0 };
  for (const o of orders) if (counts[o.status] !== undefined) counts[o.status] += 1;
  const total = orders.length;
  return {
    total,
    ...counts,
    cancellationRate: total ? Math.round((counts.cancelled / total) * 1000) / 10 : null, // percent
  };
}

// --- H. Delivery status of confirmed orders -------------------------------------------

export function deliveryStatusCounts(orders) {
  const counts = Object.fromEntries(DELIVERY_STATES.map((s) => [s, 0]));
  let noDelivery = 0;
  let confirmed = 0;
  for (const o of orders) {
    if (o.status !== 'confirmed') continue;
    confirmed += 1;
    if (counts[o.deliveryStatus] !== undefined) counts[o.deliveryStatus] += 1;
    else noDelivery += 1;
  }
  return { confirmed, ...counts, noDelivery };
}

// --- I. Late orders ---------------------------------------------------------------------

export function lateOrders(orders, timeZone, { limit = 10, now = new Date() } = {}) {
  const nowIso = now.toISOString();
  const today = toLocalDate(nowIso, timeZone);
  const late = [];
  for (const o of orders) {
    if (o.status !== 'confirmed' || !o.commitmentDate || o.commitmentDate >= nowIso) continue;
    if (!o.deliveryStatus || o.deliveryStatus === 'full') continue; // delivered, or nothing to deliver
    late.push({
      id: o.id,
      reference: o.reference,
      customerName: o.customerName,
      salespersonName: o.salespersonName,
      commitmentDate: o.commitmentDate,
      deliveryStatus: o.deliveryStatus,
      daysLate: Math.max(0, daysBetween(toLocalDate(o.commitmentDate, timeZone), today)),
    });
  }
  late.sort((a, b) => b.daysLate - a.daysLate || a.reference.localeCompare(b.reference));

  const byDelivery = Object.fromEntries(DELIVERY_STATES.filter((s) => s !== 'full').map((s) => [s, 0]));
  for (const o of late) byDelivery[o.deliveryStatus] += 1;

  return { total: late.length, byDelivery, items: late.slice(0, limit) };
}

// Adds Odoo's "Expected Date" (sale.order expected_date) to each late order. It is read by the operations sync
// (open orders only, which includes every late order); an order it does not know gets null ("—" on screen).
export function withExpectedDate(items, openSalesOrders = []) {
  const expected = new Map(openSalesOrders.map((so) => [so.id, so.expectedDate ?? null]));
  return items.map((o) => ({ ...o, expectedDate: expected.get(o.id) ?? null }));
}

// --- E. Quotation aging -------------------------------------------------------------------

export function quotationAging(orders, timeZone, { now = new Date() } = {}) {
  const today = toLocalDate(now.toISOString(), timeZone);
  const buckets = AGE_BUCKETS.map((b) => ({ key: b.key, label: b.label, count: 0 }));
  let open = 0;
  let expired = 0;
  let noDate = 0;
  let oldest = null;

  for (const o of orders) {
    if (o.status !== 'quotation' && o.status !== 'quotation_sent') continue;
    open += 1;
    if (o.validityDate && o.validityDate < today) expired += 1;
    const day = toLocalDate(o.orderDate, timeZone);
    if (!day) {
      noDate += 1;
      continue;
    }
    const age = Math.max(0, daysBetween(day, today));
    buckets[AGE_BUCKETS.findIndex((b) => age <= b.max)].count += 1;
    if (!oldest || age > oldest.days) oldest = { reference: o.reference, customerName: o.customerName, days: age };
  }

  return { open, expired, noDate, buckets, oldest };
}
