import { toLocalDate, daysBetween } from '../utils/dateUtils.js';
import { stageOf } from './operationsAnalytics.js';
import { categoryLabel } from './manufacturingCbm.js';
import { csvCell } from '../utils/csv.js';

// "Open Sales Ordered" table and "Open SO by Product Category" board. NO MONEY anywhere (client request).
// Pure functions on the production snapshot (unit-tested in test/openOrders.test.js).
//
// DEFINITIONS (agreed with the developer on 2026-10-19)
// - Open order = state "sale" AND delivery_status is set and not "full" (orders with no delivery status,
//   e.g. nothing to deliver, are left out).
// - Order CBM     = Odoo's sale.order total_cbm (whole order).
//   Remaining CBM = SUM over lines of (ordered qty - delivered qty) x product volume (m³). Products with no volume
//   add 0 m³ and are counted, so remaining CBM is a minimum.
// - Remaining quantity = SUM of (ordered - delivered) over lines, in each line's own unit ("units (mixed UoM)").
// - Days open = today - order date (date_order, business timezone).
//   NOTE: this may change to create_date ("Sales Order created" log note) if the client asks for it.
// - Delivery Date = Odoo's sale.order commitment_date (labelled "Delivery Date" in Odoo Sales; kept as
//   commitmentDate in our code). Late = it is before now; the order is open, so not fully delivered.
//   No commitment_date = "No delivery date" (never late).
// - Stage = lead-time stage (Waiting for production / In production / Ready to ship / Partly shipped).
// - Manufacturing Order State (per line, added 2026-10-21) = the state of EVERY MO for the line's product that
//   belongs to the order: linked by Odoo (mrp_production_ids) OR whose Source (origin) mentions the order
//   reference ("S09259" or "SO9259"; "PO#9259" does not count). A line can have 0, 1 or many MOs.

// True when an MO Source text mentions this sales order reference (S09259 also matches "SO9259").
// The reference must not be part of a longer word or number ("S092590", "XS09259" do not match).
export function originMentions(origin, reference) {
  return originMatcher(reference)(origin);
}

// Same test, but the search pattern is built once per order and then used for many MOs.
function originMatcher(reference) {
  if (!reference) return () => false;
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const alt = reference.replace(/^S0/i, 'SO');
  const pattern = new RegExp(`(^|[^A-Za-z0-9])(${esc(reference)}|${esc(alt)})(?![0-9])`, 'i');
  return (origin) => Boolean(origin) && pattern.test(origin);
}

const MO_STATE_ORDER = ['draft', 'confirmed', 'progress', 'to_close', 'done', 'cancel'];

export const AGE_BUCKETS = [
  { key: '0-30', label: '0–30 days', max: 30 },
  { key: '31-90', label: '31–90 days', max: 90 },
  { key: '91-365', label: '91–365 days', max: 365 },
  { key: 'over365', label: 'Over 365 days', max: Infinity },
];

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;

export function isOpenOrder(so) {
  return Boolean(so.deliveryStatus) && so.deliveryStatus !== 'full';
}

export function ageBucket(days) {
  if (days === null) return null;
  return AGE_BUCKETS.find((b) => days <= b.max).key;
}

// One row per open order, with its lines and the calculated fields.
// The heavy part (lines, MO matching, CBM) only changes when Odoo is synced, so it is built once per sync and
// kept (the snapshot's arrays are replaced at every sync); only the clock-dependent fields (days open, age bucket,
// late) are worked out on each call. Nobody mutates the returned rows' shared parts.
const baseCache = new WeakMap(); // snapshot.openSalesOrders -> { sources, timeZone, items }
const NO_MOS = []; // one shared empty list, so a snapshot without MOs still hits the cache

export function buildOpenOrders(snapshot, timeZone, now = new Date()) {
  const { openSalesOrders, openOrderLines, lineProducts, moStates, orderMos = NO_MOS } = snapshot;
  const sources = [openOrderLines, lineProducts, moStates, orderMos];
  let base = baseCache.get(openSalesOrders);
  if (!base || base.timeZone !== timeZone || base.sources.some((s, i) => s !== sources[i])) {
    base = { sources, timeZone, items: buildBase(snapshot, timeZone) };
    baseCache.set(openSalesOrders, base);
  }
  const nowIso = now.toISOString();
  const today = toLocalDate(nowIso, timeZone);
  return base.items.map(({ order, orderDay }) => {
    const daysOpen = orderDay ? Math.max(0, daysBetween(orderDay, today)) : null;
    return { ...order, daysOpen, ageBucket: ageBucket(daysOpen), late: Boolean(order.commitmentDate && order.commitmentDate < nowIso) };
  });
}

// The part of every open order that does not depend on the clock.
function buildBase({ openSalesOrders, openOrderLines, lineProducts, moStates, orderMos = [] }, timeZone) {
  const linesOf = new Map();
  for (const l of openOrderLines) {
    if (!linesOf.has(l.orderId)) linesOf.set(l.orderId, []);
    linesOf.get(l.orderId).push(l);
  }
  const mosOfProduct = new Map();
  for (const mo of orderMos) {
    if (!mosOfProduct.has(mo.productId)) mosOfProduct.set(mo.productId, []);
    mosOfProduct.get(mo.productId).push(mo);
  }

  return openSalesOrders.filter(isOpenOrder).map((so) => {
    const linked = new Set(so.moIds ?? []);
    const mentionsOrder = originMatcher(so.reference);
    const mosOfLine = (productId) =>
      (mosOfProduct.get(productId) ?? [])
        .filter((mo) => linked.has(mo.id) || mentionsOrder(mo.origin))
        .sort((a, b) => MO_STATE_ORDER.indexOf(a.state) - MO_STATE_ORDER.indexOf(b.state) || a.reference.localeCompare(b.reference))
        .map((mo) => ({ reference: mo.reference, state: mo.state }));
    let remainingCbm = 0;
    let remainingQty = 0;
    let linesWithoutVolume = 0;
    const lines = (linesOf.get(so.id) ?? []).map((l) => {
      const product = lineProducts[l.productId];
      const volume = product?.volume ?? 0;
      const remaining = Math.max(0, l.orderedQty - l.deliveredQty);
      const lineRemainingCbm = volume > 0 ? remaining * volume : 0;
      if (remaining > 0 && !(volume > 0)) linesWithoutVolume += 1;
      remainingCbm += lineRemainingCbm;
      remainingQty += remaining;
      return {
        id: l.id,
        productName: l.productName,
        category: product?.category ?? 'No category',
        orderedQty: l.orderedQty,
        mos: mosOfLine(l.productId), // [{ reference, state }], empty = no MO found
        deliveredQty: l.deliveredQty,
        remainingQty: remaining,
        cbm: round(l.cbm),
        remainingCbm: round(lineRemainingCbm),
        noVolume: !(volume > 0),
      };
    });
    const orderDay = toLocalDate(so.orderDate, timeZone);
    const order = {
      id: so.id,
      reference: so.reference,
      customerId: so.customerId ?? null,
      customerName: so.customerName,
      destination: so.destination ?? null, // country of the delivery address
      orderDate: so.orderDate,
      commitmentDate: so.commitmentDate ?? null,
      deliveryStatus: so.deliveryStatus,
      stage: stageOf(so, moStates),
      orderCbm: round(so.orderCbm ?? 0),
      remainingCbm: round(remainingCbm),
      remainingQty: round(remainingQty, 2),
      noDeliveryDate: !so.commitmentDate,
      linesWithoutVolume,
      lines,
    };
    return { order, orderDay };
  });
}

// A line "matches" a category when its full path equals it or is below it (so a 3rd-level click works too).
const inCategory = (path, category) => path === category || path.startsWith(`${category} / `);

// filters: { search, customer, category, age, lateOnly }
// search matches the SO#, the customer or the destination (delivery address country), ignoring case.
export function filterOpenOrders(orders, { search = null, customer = null, category = null, age = 'all', lateOnly = false } = {}) {
  const needle = search ? search.toLowerCase() : null;
  const matches = (o) => [o.reference, o.customerName, o.destination].some((text) => text?.toLowerCase().includes(needle));
  return orders.filter((o) => {
    if (needle && !matches(o)) return false;
    if (customer && o.customerId !== customer) return false;
    if (age !== 'all' && o.ageBucket !== age) return false;
    if (lateOnly && !o.late) return false;
    if (category && !o.lines.some((l) => l.remainingQty > 0 && inCategory(l.category, category))) return false;
    return true;
  });
}

const SORT_VALUE = {
  reference: (o) => o.reference,
  customer: (o) => o.customerName.toLowerCase(),
  orderDate: (o) => o.orderDate,
  commitmentDate: (o) => o.commitmentDate,
  orderCbm: (o) => o.orderCbm,
  remainingCbm: (o) => o.remainingCbm,
  daysOpen: (o) => o.daysOpen,
};
export const SORT_FIELDS = Object.keys(SORT_VALUE);

export function sortOpenOrders(orders, sortBy = 'daysOpen', sortOrder = 'desc') {
  const value = SORT_VALUE[sortBy];
  const dir = sortOrder === 'asc' ? 1 : -1;
  return [...orders].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va == null && vb == null) return a.reference.localeCompare(b.reference);
    if (va == null) return 1; // empty values always last
    if (vb == null) return -1;
    if (va < vb) return -dir;
    if (va > vb) return dir;
    return a.reference.localeCompare(b.reference);
  });
}

// Remaining lines grouped by product category (full path or 3rd level).
export function openOrdersByCategory(orders, level = 'full') {
  const rows = new Map();
  for (const o of orders) {
    for (const l of o.lines) {
      if (l.remainingQty <= 0) continue;
      const category = categoryLabel(l.category === 'No category' ? null : l.category, level);
      const row = rows.get(category) ?? { category, orderIds: new Set(), remainingQty: 0, remainingCbm: 0, linesWithoutVolume: 0 };
      row.orderIds.add(o.id);
      row.remainingQty += l.remainingQty;
      row.remainingCbm += l.remainingCbm;
      if (l.noVolume) row.linesWithoutVolume += 1;
      rows.set(category, row);
    }
  }
  return [...rows.values()]
    .map(({ orderIds, ...r }) => ({ ...r, openSos: orderIds.size, remainingQty: round(r.remainingQty, 2), remainingCbm: round(r.remainingCbm) }))
    .sort((a, b) => b.openSos - a.openSos || b.remainingCbm - a.remainingCbm || a.category.localeCompare(b.category));
}

// CSV of the filtered orders. NO money columns.
export function openOrdersCsv(orders, timeZone) {
  const q = csvCell; // quoted, quotes doubled, formulas neutralised (utils/csv.js)
  const header = ['SO#', 'Customer', 'Order date', 'Delivery date', 'Delivery status', 'Stage', 'Order CBM', 'Remaining CBM',
    'Remaining quantity (mixed UoM)', 'Days open', 'Late'];
  const lines = [header.map(q).join(',')];
  for (const o of orders) {
    lines.push([
      o.reference, o.customerName, toLocalDate(o.orderDate, timeZone) ?? '', o.commitmentDate ? toLocalDate(o.commitmentDate, timeZone) : 'No delivery date',
      o.deliveryStatus, o.stage, o.orderCbm, o.remainingCbm, o.remainingQty, o.daysOpen ?? '', o.late ? 'yes' : 'no',
    ].map(q).join(','));
  }
  return `${lines.join('\r\n')}\r\n`;
}
