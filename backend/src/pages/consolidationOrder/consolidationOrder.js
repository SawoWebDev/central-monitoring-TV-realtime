import { toLocalDate } from '../../utils/dateUtils.js';
import { isOpenOrder } from '../../services/openOrders.js';
import { isFinishedGoods, productCategoryLabel } from '../../config/categoryGroups.js';

// "Consolidation Order" page (client's planning sheet "Consolidated Order of WWP1"). Pure functions on the production
// snapshot (unit-tested in test/consolidationOrder.test.js). Nothing here talks to Odoo: it uses the open sales orders and
// order lines that the production sync already copied.
//
// DEFINITIONS (agreed with the developer on 2026-10-26)
// - Rows = the lines of the OPEN sales orders (confirmed, not fully delivered: the same orders as "Open Sales Ordered").
//   One row per Odoo order line (never merged), so nothing is counted twice.
// - FINISHED GOODS only (category "All / Finished Goods ..."): fee lines such as "Bank Charge" are left out.
// - Quantity = REMAINING quantity = ordered - delivered (what is still to be made and shipped). Ordered and delivered are
//   kept on every row. Lines that are fully delivered (remaining 0) are kept in the rows too, but filterRows() hides them
//   unless the filter "includeDelivered" is on; they never add to the matrix (nothing is left to ship). The counts of what
//   was left out are in `excluded`.
// - Excel "Product Code"  = product Internal Reference (default_code);  Excel "Desciption" = product name.
//   Excel "so #" = the sales order number;  Excel "Completion Date" = the order's Delivery Date (commitment_date);
//   Excel "Destination" = country of the order's Delivery Address (the planner's own short names, e.g. "HALU", cannot
//   be reproduced from Odoo).
// - Items made for an order but NOT on it (filter "includeMo", added 2026-10-27): the planners add accessories to a container
//   that are not on the Odoo order; Odoo knows part of them as manufacturing orders (MOs) whose Source text mentions the
//   order. Such an MO becomes one row (source "mo", MO reference and state, quantity = the MO's quantity to produce) when
//   (a) its state is not cancelled, (b) its product is a finished good, (c) the product is not on any line of that order
//   (then the MO is just the production of that line), and (d) it belongs to an OPEN order. An MO belongs to ONE order only:
//   the order Odoo links it to, otherwise the first open order its Source text mentions. Hidden unless "includeMo".
// - Matrix (the sheet "Consolidation FG"): one column per sales order, ordered like the Excel: orders without a delivery
//   date ("TBA") first, then by delivery date, then by SO number; one row per product code; cells = summed remaining qty.

const round = (n, d = 3) => Math.round(n * 10 ** d) / 10 ** d;
const natural = (a, b) => String(a).localeCompare(String(b), 'en', { numeric: true, sensitivity: 'base' });

export const SORT_FIELDS = ['deliveryDate', 'so', 'destination', 'productCode', 'productName', 'quantity'];
export const MATRIX_MAX_ORDERS = 60; // wider than this is not readable on a screen: narrow the filters (the Excel has no limit)

// "[HP02-005] Heating Element" -> { code: "HP02-005", name: "Heating Element" } (Odoo's display name of a product)
function splitDisplayName(display = '') {
  const m = /^\[([^\]]*)\]\s*(.*)$/.exec(display);
  return m ? { code: m[1].trim(), name: m[2].trim() } : { code: '', name: display.trim() };
}

// "S09259" -> 9259 (how the Excel writes the SO#); anything else -> null
export function soNumber(reference) {
  const m = /^S0*(\d+)$/.exec(reference ?? '');
  return m ? Number(m[1]) : null;
}

const NO_MOS = []; // one shared empty list, so a snapshot without MOs still hits the cache
const MO_STATES = new Set(['draft', 'confirmed', 'progress', 'to_close', 'done']); // everything but cancelled

// The sales order references mentioned in an MO Source text, in the order they appear ("S09259" and "SO9259" both mean S09259).
// Same rule as originMentions(): the reference must not be part of a longer word or number.
const REFERENCE_IN_TEXT = /(?<![A-Za-z0-9])S[0O]?\d+(?![0-9])/gi;
function mentionedReferences(origin) {
  return [...String(origin ?? '').matchAll(REFERENCE_IN_TEXT)].map((m) => m[0].toUpperCase());
}

// CBM of a line = quantity x the product's volume in Odoo (m³), the same rule as Remaining CBM on Open Sales Ordered.
// A product with no volume adds 0 and is flagged (noVolume), so every CBM total is a minimum.
function cbmOf(product, orderedQty, remainingQty) {
  const volume = product?.volume > 0 ? product.volume : 0;
  const cbm = (qty) => Math.round(qty * volume * 1000) / 1000;
  return { cbmOrdered: cbm(orderedQty), cbmRemaining: cbm(remainingQty), noVolume: volume === 0 };
}

function build({ openSalesOrders, openOrderLines, lineProducts, orderMos = NO_MOS }, timeZone) {
  const orders = new Map(openSalesOrders.filter(isOpenOrder).map((so) => [so.id, so]));
  const rows = [];
  const excluded = { notFinishedGoods: 0, fullyDelivered: 0 };
  for (const l of openOrderLines) {
    const so = orders.get(l.orderId);
    if (!so) continue;
    const product = lineProducts[l.productId];
    if (!isFinishedGoods(product?.category)) {
      excluded.notFinishedGoods += 1;
      continue;
    }
    const remaining = round(Math.max(0, l.orderedQty - l.deliveredQty));
    if (remaining <= 0) excluded.fullyDelivered += 1; // kept as a row (shown with "include fully delivered lines")
    const fromName = splitDisplayName(l.productName);
    rows.push({
      lineId: l.id,
      orderId: so.id,
      so: so.reference,
      destination: so.destination ?? null, // country of the delivery address
      customerName: so.customerName,
      deliveryDate: so.commitmentDate ?? null,
      deliveryDay: toLocalDate(so.commitmentDate, timeZone), // "YYYY-MM-DD" in the business timezone, or null
      productId: l.productId,
      productCode: product?.code || fromName.code || '',
      productName: product?.name || fromName.name || l.productName || '',
      category: productCategoryLabel(product?.category), // same rule as the CBM Shipped chart, see categoryGroups.js
      categoryPath: product?.category ?? null, // Odoo's full category path
      orderedQty: round(l.orderedQty),
      deliveredQty: round(l.deliveredQty),
      remainingQty: remaining,
      ...cbmOf(product, l.orderedQty, remaining),
      source: 'order', // a line of the Odoo sales order
      moReference: null,
      moState: null,
    });
  }

  // ---- items made for an order but not on it (manufacturing orders) ----
  const productsOfOrder = new Map(); // orderId -> product ids on ANY of its lines (also the lines left out above)
  for (const l of openOrderLines) {
    if (!productsOfOrder.has(l.orderId)) productsOfOrder.set(l.orderId, new Set());
    productsOfOrder.get(l.orderId).add(l.productId);
  }
  const orderOfToken = new Map(); // "S09259" / "SO9259" -> open order
  const orderOfMo = new Map(); // MO id -> the one order it belongs to: Odoo's own link first
  for (const so of orders.values()) {
    const alt = so.reference.replace(/^S0/i, 'SO');
    for (const token of [so.reference.toUpperCase(), alt.toUpperCase()]) orderOfToken.set(token, so);
    for (const moId of so.moIds ?? []) if (!orderOfMo.has(moId)) orderOfMo.set(moId, so);
  }
  for (const mo of orderMos) {
    if (!MO_STATES.has(mo.state) || !(mo.qty > 0)) continue;
    const product = lineProducts[mo.productId];
    if (!isFinishedGoods(product?.category)) continue;
    // otherwise the first open order that the Source text mentions
    const so = orderOfMo.get(mo.id) ?? mentionedReferences(mo.origin).map((t) => orderOfToken.get(t)).find(Boolean);
    if (!so || productsOfOrder.get(so.id)?.has(mo.productId)) continue; // not an open order, or just the production of an order line
    rows.push({
      lineId: -mo.id, // negative: never the same as an order line's id
      orderId: so.id,
      so: so.reference,
      destination: so.destination ?? null,
      customerName: so.customerName,
      deliveryDate: so.commitmentDate ?? null,
      deliveryDay: toLocalDate(so.commitmentDate, timeZone),
      productId: mo.productId,
      productCode: product.code || '',
      productName: product.name || '',
      category: productCategoryLabel(product.category),
      categoryPath: product.category ?? null,
      orderedQty: round(mo.qty),
      deliveredQty: 0,
      remainingQty: round(mo.qty),
      ...cbmOf(product, mo.qty, mo.qty),
      source: 'mo',
      moReference: mo.reference,
      moState: mo.state,
    });
  }
  // Destination choices for the dropdown (countries that appear in the scope, with their number of orders)
  const toShip = rows.filter((r) => r.remainingQty > 0 && r.source === 'order');
  const perCountry = new Map();
  for (const r of toShip) {
    const key = r.destination ?? '';
    if (!perCountry.has(key)) perCountry.set(key, new Set());
    perCountry.get(key).add(r.orderId);
  }
  const destinations = [...perCountry]
    .filter(([key]) => key !== '')
    .sort((a, b) => natural(a[0], b[0]))
    .map(([value, ids]) => ({ value, label: value, orders: ids.size }));
  if (perCountry.has('')) destinations.push({ value: 'none', label: 'No Country', orders: perCountry.get('').size });
  return {
    rows,
    excluded,
    lineCount: toShip.length, // order lines still to ship
    moLineCount: rows.filter((r) => r.source === 'mo').length, // items made for an order but not on it
    orderCount: new Set(toShip.map((r) => r.orderId)).size,
    destinations,
  };
}

// The rows are built once per Odoo sync (the snapshot's arrays are replaced at every sync), not on every request.
const cache = new WeakMap(); // snapshot.openOrderLines -> { openSalesOrders, lineProducts, orderMos, timeZone, data }

export function consolidationData(snapshot, timeZone) {
  const { openSalesOrders, openOrderLines, lineProducts, orderMos = NO_MOS } = snapshot;
  const hit = cache.get(openOrderLines);
  if (hit && hit.openSalesOrders === openSalesOrders && hit.lineProducts === lineProducts && hit.orderMos === orderMos && hit.timeZone === timeZone) return hit.data;
  const data = build(snapshot, timeZone);
  cache.set(openOrderLines, { openSalesOrders, lineProducts, orderMos, timeZone, data });
  return data;
}

const contains = (text, needle) => String(text ?? '').toLowerCase().includes(needle.toLowerCase());

// The SO# filter takes one or MORE sales order numbers, as a list or as text separated by commas, semicolons or new lines.
// Blank entries are dropped, the rest is trimmed and duplicates (ignoring case and spaces) are removed.
export function parseSoList(input) {
  const parts = Array.isArray(input) ? input : String(input ?? '').split(/[,;\n\r]+/);
  const seen = new Set();
  const list = [];
  for (const part of parts) {
    const token = String(part ?? '').trim();
    // "SO 9460", "SO9460" and "S09460" are the same order, so they count as one entry
    const compact = token.replace(/\s+/g, '').toUpperCase();
    const m = /^(?:SO(\d+)|S(\d{5}))$/.exec(compact);
    const key = m ? `SO${Number(m[1] ?? m[2])}` : compact;
    if (!token || seen.has(key)) continue;
    seen.add(key);
    list.push(token);
  }
  return list;
}

// One entry of the SO# filter -> a test for an SO number. "SO 9259", "SO9259" and the full reference "S09259" mean exactly that
// order; anything else ("9259", "925", "S0000") is looked for INSIDE the SO number, like before.
function soTest(token) {
  const m = /^(?:SO\s*(\d+)|S(\d{5}))$/i.exec(token);
  if (m) {
    const n = Number(m[1] ?? m[2]);
    return (reference) => soNumber(reference) === n;
  }
  return (reference) => contains(reference, token);
}

// filters (all optional, all combined with AND):
//   so            one or more SO numbers (a list or comma / new line separated text); a row matches if it matches ANY of them (OR),
//                 and all the other filters still apply with AND. "SO 9259" / "S09259" = exactly that order; "9259" = text inside
//                 the SO number
//   destination   a country name, or "none" for orders without a country
//   deliveryMode  how the Delivery Date is used (default "range"):
//                   range    only orders whose Delivery Date is inside deliveryFrom..deliveryTo ("YYYY-MM-DD", business
//                            timezone, both inclusive, either may be left empty). Nothing outside the range ever appears;
//                            orders without a date are not in any range. With no dates given, every order is kept.
//                   rangeOrNoDate  the same range PLUS the orders without a Delivery Date ("TBA"); still nothing else outside it
//                   overdue  only orders whose Delivery Date is before today (deliveryFrom / deliveryTo are ignored)
//                   noDate   only orders without a Delivery Date ("TBA")
//                   all      every order, whatever its Delivery Date
//   productRef    text inside the product code;   productName   text inside the product name
//   qtyMin, qtyMax   range of the line's quantity (remaining)
//   includeDelivered   also keep the lines that are fully delivered (remaining 0); without it they are hidden
//   includeMo          also keep the items made for an order but not on it (source "mo"); without it they are hidden

export function filterRows(rows, f = {}, today) {
  const mode = f.deliveryMode ?? 'range';
  const soTests = parseSoList(f.so).map(soTest);
  return rows.filter((r) => {
    if (!f.includeDelivered && r.remainingQty <= 0) return false;
    if (r.source === 'mo' && !f.includeMo) return false;
    if (soTests.length > 0 && !soTests.some((test) => test(r.so))) return false;
    if (f.destination) {
      if (f.destination === 'none' ? r.destination !== null : r.destination?.toLowerCase() !== f.destination.toLowerCase()) return false;
    }
    const day = r.deliveryDay;
    if (mode === 'overdue' && !(day !== null && day < today)) return false;
    if (mode === 'noDate' && day !== null) return false;
    if ((mode === 'range' || mode === 'rangeOrNoDate') && (f.deliveryFrom || f.deliveryTo)) {
      if (day === null) {
        if (mode === 'range') return false; // "TBA" orders are in no range, unless "range + no delivery date" is chosen
      } else if ((f.deliveryFrom && day < f.deliveryFrom) || (f.deliveryTo && day > f.deliveryTo)) {
        return false;
      }
    }
    if (f.productRef && !contains(r.productCode, f.productRef)) return false;
    if (f.productName && !contains(r.productName, f.productName)) return false;
    if (f.qtyMin != null && r.remainingQty < f.qtyMin) return false;
    if (f.qtyMax != null && r.remainingQty > f.qtyMax) return false;
    return true;
  });
}

const SORT_VALUE = {
  deliveryDate: (r) => r.deliveryDate,
  so: (r) => r.so,
  destination: (r) => r.destination,
  productCode: (r) => r.productCode || null,
  productName: (r) => r.productName,
  quantity: (r) => r.remainingQty,
};

// Empty values are always last; ties are broken by delivery date, SO number, product code.
export function sortRows(rows, sortBy = 'deliveryDate', sortOrder = 'asc') {
  const value = SORT_VALUE[sortBy];
  const dir = sortOrder === 'desc' ? -1 : 1;
  const tie = (a, b) =>
    (a.deliveryDate === b.deliveryDate ? 0 : a.deliveryDate === null ? 1 : b.deliveryDate === null ? -1 : a.deliveryDate < b.deliveryDate ? -1 : 1) ||
    natural(a.so, b.so) ||
    natural(a.productCode, b.productCode) ||
    a.lineId - b.lineId;
  return [...rows].sort((a, b) => {
    const va = value(a);
    const vb = value(b);
    if (va == null && vb == null) return tie(a, b);
    if (va == null) return 1;
    if (vb == null) return -1;
    const c = typeof va === 'number' ? va - vb : natural(va, vb);
    return c === 0 ? tie(a, b) : c * dir;
  });
}

// The matrix of the sheet "Consolidation FG": products (rows) x sales orders (columns), cells = summed remaining qty.
export function buildMatrix(allRows) {
  const rows = allRows.filter((r) => r.remainingQty > 0); // fully delivered lines have nothing left to ship
  const orderMap = new Map();
  for (const r of rows) {
    if (!orderMap.has(r.orderId)) {
      orderMap.set(r.orderId, { orderId: r.orderId, so: r.so, soNumber: soNumber(r.so), destination: r.destination, deliveryDay: r.deliveryDay, total: 0 });
    }
  }
  const columns = [...orderMap.values()].sort((a, b) => {
    if (a.deliveryDay !== b.deliveryDay) {
      if (a.deliveryDay === null) return -1; // "TBA" first, like the Excel
      if (b.deliveryDay === null) return 1;
      return a.deliveryDay < b.deliveryDay ? -1 : 1;
    }
    return natural(a.so, b.so);
  });
  const columnOf = new Map(columns.map((c, i) => [c.orderId, i]));

  const products = new Map();
  let grandTotal = 0;
  for (const r of rows) {
    const key = r.productCode ? `code:${r.productCode.toLowerCase()}` : `name:${r.productName.toLowerCase()}`;
    let p = products.get(key);
    if (!p) {
      p = { key, code: r.productCode, name: r.productName, category: r.category, categoryPath: r.categoryPath, cells: Array(columns.length).fill(null), total: 0 };
      products.set(key, p);
    }
    const i = columnOf.get(r.orderId);
    p.cells[i] = round((p.cells[i] ?? 0) + r.remainingQty);
    p.total = round(p.total + r.remainingQty);
    columns[i].total = round(columns[i].total + r.remainingQty);
    grandTotal = round(grandTotal + r.remainingQty);
  }
  const sorted = [...products.values()].sort((a, b) => (a.code && !b.code ? -1 : !a.code && b.code ? 1 : natural(a.code || a.name, b.code || b.name)));
  return { columns, rows: sorted, grandTotal };
}

// Counts for the summary line of a (filtered) set of rows
export function summarize(rows) {
  return {
    lines: rows.length,
    orders: new Set(rows.map((r) => r.orderId)).size,
    products: new Set(rows.map((r) => r.productCode || r.productName.toLowerCase())).size,
    totalQty: round(rows.reduce((s, r) => s + r.remainingQty, 0)),
  };
}
