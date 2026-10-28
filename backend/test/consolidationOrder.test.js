// Unit tests for the Consolidation Order page and its Excel export.
// ALL DATA IN THIS FILE IS MADE-UP TEST DATA. It is not company data and is never shown on the dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import {
  buildMatrix,
  consolidationData,
  filterRows,
  MATRIX_MAX_ORDERS,
  sortRows,
  soNumber,
  summarize,
} from '../src/pages/consolidationOrder/consolidationOrder.js';
import { buildConsolidationSheets, consolidationFileName, consolidationWorkbook } from '../src/pages/consolidationOrder/consolidationOrderExport.js';

const TZ = 'Asia/Manila';
const TODAY = '2026-10-26';
const FG = 'All / Finished Goods';

// Open orders. Delivery dates are UTC; Manila is UTC+8.
const ORDERS = [
  { id: 1, reference: 'S00001', deliveryStatus: 'pending', customerName: 'TEST Acme', destination: 'Australia', commitmentDate: '2026-10-28T02:00:00Z' },
  { id: 2, reference: 'S00002', deliveryStatus: 'partial', customerName: 'TEST Beta', destination: 'Canada', commitmentDate: '2026-10-30T20:00:00Z' }, // 31 Oct 04:00 Manila
  { id: 3, reference: 'S00003', deliveryStatus: 'started', customerName: 'TEST Gamma', destination: null, commitmentDate: null }, // no date, no country
  { id: 4, reference: 'S00004', deliveryStatus: 'pending', customerName: 'TEST Delta', destination: 'Australia', commitmentDate: '2026-10-10T02:00:00Z' }, // overdue
  { id: 5, reference: 'S00005', deliveryStatus: 'full', customerName: 'TEST Epsilon', destination: 'Canada', commitmentDate: '2026-10-28T02:00:00Z' }, // not open
  { id: 6, reference: 'S00006', deliveryStatus: null, customerName: 'TEST Zeta', destination: 'Canada', commitmentDate: '2026-10-28T02:00:00Z' }, // no delivery status: not open
];
const PRODUCTS = {
  10: { category: `${FG} / Accessories / Pails`, code: 'P-100', name: 'TEST Pail 4L' },
  11: { category: `${FG} / Heaters`, code: 'H-200', name: 'TEST Heater' },
  12: { category: `${FG} / Accessories`, code: null, name: 'TEST Item without a code' },
  13: { category: 'All / Semi-Finished', code: 'S-300', name: 'TEST Part' }, // not finished goods
  14: { category: `${FG} / Accessories`, code: 'Q-400', name: 'TEST Display name only' },
};
const line = (id, orderId, productId, ordered, delivered = 0, productName = 'x') => ({ id, orderId, productId, productName, orderedQty: ordered, deliveredQty: delivered });
const LINES = [
  line(1, 1, 10, 36), // S00001 P-100: 36
  line(2, 1, 10, 17), // the same product again on another line of the same order: 17 (kept as two rows)
  line(3, 1, 11, 4, 1), // remaining 3
  line(4, 2, 10, 20, 20), // fully delivered: left out
  line(5, 2, 11, 10),
  line(6, 3, 12, 5),
  line(7, 3, 13, 50), // semi-finished: left out
  line(8, 4, 10, 8),
  line(9, 5, 10, 99), // order not open
  line(10, 6, 10, 99), // order not open
  line(11, 1, 14, 2, 0, '[Q-400] TEST Display name only'),
  line(12, 1, 99, 7, 0, '[Z-9] TEST Unknown product'), // product not in lineProducts: no category, so not finished goods
];
const SNAP = { openSalesOrders: ORDERS, openOrderLines: LINES, lineProducts: PRODUCTS };
const data = () => consolidationData(SNAP, TZ);
const codes = (rows) => rows.map((r) => `${r.so}/${r.productCode || r.productName}`);
const open = () => filterRows(data().rows, {}, TODAY); // what the page shows by default (lines still to ship)

test('rows: open orders, finished goods only, remaining quantity, one row per Odoo line', () => {
  const d = data();
  // the fully delivered line (S00002 P-100, 20 of 20) is a row too, hidden by default
  assert.deepEqual(codes(d.rows), ['S00001/P-100', 'S00001/P-100', 'S00001/H-200', 'S00002/P-100', 'S00002/H-200', 'S00003/TEST Item without a code', 'S00004/P-100', 'S00001/Q-400']);
  assert.deepEqual(d.rows.map((r) => r.remainingQty), [36, 17, 3, 0, 10, 5, 8, 2]);
  assert.deepEqual(codes(open()), ['S00001/P-100', 'S00001/P-100', 'S00001/H-200', 'S00002/H-200', 'S00003/TEST Item without a code', 'S00004/P-100', 'S00001/Q-400']);
  assert.equal(d.lineCount, 7); // lines still to ship
  assert.equal(new Set(d.rows.map((r) => r.lineId)).size, d.rows.length); // no duplicated lines
  assert.deepEqual(d.excluded, { notFinishedGoods: 2, fullyDelivered: 1 });
  assert.equal(d.orderCount, 4);
  const first = d.rows[0];
  assert.deepEqual([first.orderedQty, first.deliveredQty, first.remainingQty], [36, 0, 36]); // ordered / delivered / remaining kept
});

test('missing values: no product code, no delivery date, no country', () => {
  const r = data().rows.find((x) => x.so === 'S00003');
  assert.equal(r.productCode, '');
  assert.equal(r.deliveryDate, null);
  assert.equal(r.deliveryDay, null);
  assert.equal(r.destination, null);
  // a product whose code is missing in the cache is read from Odoo's display name "[code] name"
  const q = data().rows.find((x) => x.productId === 14);
  assert.equal(q.productCode, 'Q-400');
});

test('delivery day uses the business timezone (31 Oct 04:00 Manila, not 30 Oct UTC)', () => {
  assert.equal(data().rows.find((r) => r.so === 'S00002').deliveryDay, '2026-10-31');
});

test('destination choices come from the data, with "No country" for orders without one', () => {
  assert.deepEqual(data().destinations, [
    { value: 'Australia', label: 'Australia', orders: 2 },
    { value: 'Canada', label: 'Canada', orders: 1 },
    { value: 'none', label: 'No Country', orders: 1 },
  ]);
});

test('filters: SO#, destination, product ref, product name, quantity', () => {
  const rows = data().rows;
  assert.deepEqual([...new Set(filterRows(rows, { so: '2' }, TODAY).map((r) => r.so))], ['S00002']); // partial text, "2" finds S00002
  assert.deepEqual([...new Set(filterRows(rows, { so: 's0000' }, TODAY).map((r) => r.so))].length, 4); // case ignored
  assert.deepEqual(codes(filterRows(rows, { destination: 'canada' }, TODAY)), ['S00002/H-200']);
  assert.deepEqual([...new Set(filterRows(rows, { destination: 'none' }, TODAY).map((r) => r.so))], ['S00003']);
  assert.deepEqual(codes(filterRows(rows, { productRef: 'h-2' }, TODAY)), ['S00001/H-200', 'S00002/H-200']);
  assert.deepEqual(codes(filterRows(rows, { productName: 'pail' }, TODAY)), ['S00001/P-100', 'S00001/P-100', 'S00004/P-100']);
  assert.deepEqual(filterRows(rows, { qtyMin: 10, qtyMax: 20 }, TODAY).map((r) => r.remainingQty), [17, 10]);
  assert.deepEqual(filterRows(rows, { qtyMin: 36 }, TODAY).map((r) => r.remainingQty), [36]);
});

test('delivery date: the range is strict, and overdue / no date / any date are separate modes', () => {
  const rows = data().rows;
  const sos = (f) => [...new Set(filterRows(rows, f, TODAY).map((r) => r.so))];
  // the range: only the dates inside it, both ends included, in the business timezone
  assert.deepEqual(sos({ deliveryFrom: '2026-10-26', deliveryTo: '2026-10-30' }), ['S00001']); // S00002 is on 31 Oct
  assert.deepEqual(sos({ deliveryFrom: '2026-10-31', deliveryTo: '2026-10-31' }), ['S00002']);
  assert.deepEqual(sos({ deliveryFrom: '2026-10-26' }), ['S00001', 'S00002']); // no upper limit
  assert.deepEqual(sos({ deliveryTo: '2026-10-28' }), ['S00001', 'S00004']); // no lower limit
  // orders outside the range never appear, and an order without a date is in no range
  assert.equal(sos({ deliveryFrom: '2026-10-26', deliveryTo: '2026-11-05' }).includes('S00004'), false); // overdue (10 Oct)
  assert.equal(sos({ deliveryFrom: '2026-10-26', deliveryTo: '2026-11-05' }).includes('S00003'), false); // no date
  // range + the orders without a date (TBA): the range stays strict, only the "no date" orders are added
  assert.deepEqual(sos({ deliveryMode: 'rangeOrNoDate', deliveryFrom: '2026-10-26', deliveryTo: '2026-10-30' }), ['S00001', 'S00003']); // not S00002 (31 Oct), not S00004 (overdue)
  assert.deepEqual(sos({ deliveryMode: 'rangeOrNoDate', deliveryFrom: '2026-10-31' }), ['S00002', 'S00003']);
  assert.deepEqual(sos({ deliveryMode: 'rangeOrNoDate' }), ['S00001', 'S00002', 'S00003', 'S00004']); // no dates: everything
  // the other modes
  assert.deepEqual(sos({ deliveryMode: 'overdue' }), ['S00004']); // before today (26 Oct)
  assert.deepEqual(sos({ deliveryMode: 'noDate' }), ['S00003']);
  assert.deepEqual(sos({ deliveryMode: 'all' }), ['S00001', 'S00002', 'S00003', 'S00004']);
  assert.deepEqual(sos({ deliveryMode: 'overdue', deliveryFrom: '2026-10-26', deliveryTo: '2026-10-30' }), ['S00004']); // dates are ignored outside "range"
  // no dates chosen in "range" mode: everything, also orders without a date
  assert.deepEqual(sos({}), ['S00001', 'S00002', 'S00003', 'S00004']);
  assert.deepEqual(sos({ deliveryMode: 'range' }), ['S00001', 'S00002', 'S00003', 'S00004']);
});

test('filters work together', () => {
  const rows = data().rows;
  const f = { destination: 'Australia', deliveryFrom: '2026-10-26', deliveryTo: '2026-10-30', productRef: 'P-1', qtyMin: 20 };
  assert.deepEqual(filterRows(rows, f, TODAY).map((r) => [r.so, r.remainingQty]), [['S00001', 36]]);
  assert.deepEqual(filterRows(rows, { ...f, productName: 'heater' }, TODAY), []); // contradicting filters: nothing, no error
});

test('sorting: empty values last, then delivery date, SO number and product code', () => {
  const rows = open();
  assert.deepEqual(sortRows(rows).map((r) => r.so), ['S00004', 'S00001', 'S00001', 'S00001', 'S00001', 'S00002', 'S00003']); // default: delivery date asc, no date last
  assert.deepEqual(sortRows(rows, 'quantity', 'desc').map((r) => r.remainingQty), [36, 17, 10, 8, 5, 3, 2]);
  assert.deepEqual(sortRows(rows, 'productCode', 'asc').map((r) => r.productCode), ['H-200', 'H-200', 'P-100', 'P-100', 'P-100', 'Q-400', '']); // no code last
});

test('matrix: TBA columns first, then by date; same product on two lines is summed; totals add up', () => {
  const m = buildMatrix(data().rows);
  assert.deepEqual(m.columns.map((c) => [c.so, c.soNumber, c.deliveryDay]), [
    ['S00003', 3, null], // "TBA" first, like the Excel
    ['S00004', 4, '2026-10-10'],
    ['S00001', 1, '2026-10-28'],
    ['S00002', 2, '2026-10-31'],
  ]);
  const p100 = m.rows.find((r) => r.code === 'P-100');
  assert.deepEqual(p100.cells, [null, 8, 53, null]); // 36 + 17 on S00001
  assert.equal(p100.total, 61);
  assert.deepEqual(m.columns.map((c) => c.total), [5, 8, 58, 10]);
  assert.equal(m.grandTotal, 81);
  assert.equal(m.rows.reduce((s, r) => s + r.total, 0), m.grandTotal); // rows and columns agree
  assert.equal(m.columns.reduce((s, c) => s + c.total, 0), m.grandTotal);
  assert.deepEqual(m.rows.map((r) => r.code || r.name), ['H-200', 'P-100', 'Q-400', 'TEST Item without a code']); // by code, products without a code last
});

test('summary counts', () => {
  assert.deepEqual(summarize(open()), { lines: 7, orders: 4, products: 4, totalQty: 81 });
  assert.deepEqual(summarize([]), { lines: 0, orders: 0, products: 0, totalQty: 0 });
});

test('soNumber and constants', () => {
  assert.equal(soNumber('S09259'), 9259);
  assert.equal(soNumber('S00040'), 40);
  assert.equal(soNumber('ABC'), null);
  assert.ok(MATRIX_MAX_ORDERS >= 40);
});

test('rows are built once per Odoo sync (same snapshot arrays give the same rows)', () => {
  assert.equal(consolidationData(SNAP, TZ), consolidationData(SNAP, TZ));
  assert.notEqual(consolidationData({ ...SNAP, openSalesOrders: [...ORDERS] }, TZ), consolidationData(SNAP, TZ));
});

// --- Excel export -----------------------------------------------------------------------------------------------

function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = {};
  for (let i = 0; i < count; i += 1) {
    const size = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    out[name] = inflateRawSync(buf.subarray(start, start + size)).toString('utf8');
    p += 46 + nameLen;
  }
  return out;
}

test('Excel: sheet layout follows the sample (header rows, hidden column C, Grand Total with SUM formulas)', () => {
  const rows = sortRows(open());
  const [sheet, details] = buildConsolidationSheets(buildMatrix(rows), rows);
  assert.equal(sheet.name, 'Consolidation FG');
  assert.equal(sheet.hiddenCols, undefined); // column C now holds the Product Category (visible)
  assert.equal(sheet.tabColor, 'FF00B050');
  const cell = (r, c) => sheet.rows[r - 1][c - 1];
  assert.equal(cell(1, 1).v, 'Sum of Qty');
  assert.deepEqual([cell(1, 4).v, cell(1, 5).v], ['so #', 'Destination']);
  assert.equal(cell(2, 4).v, 'TBA'); // S00003 has no date
  assert.equal(cell(2, 5).style.numFmtId, 14); // a real date
  assert.equal(cell(3, 4).v, 3); // SO number like the Excel (3, not S00003)
  assert.equal(cell(4, 1).v, 'Product Code');
  assert.equal(cell(4, 2).v, 'Description');
  assert.equal(cell(4, 3).v, 'Product Category'); // right of the Description
  assert.equal(cell(5, 3).v, 'Heaters'); // H-200 = the Heaters group (same rule as the CBM Shipped chart)
  assert.equal(cell(4, 4).v, 'No country');
  assert.equal(cell(4, 5).v, 'Australia');
  assert.equal(cell(2, 8).v, 'Grand Total'); // 4 orders: D..G, Grand Total in H
  assert.equal(cell(5, 1).v, 'H-200');
  assert.equal(cell(5, 8).f, 'SUM(D5:G5)');
  const last = sheet.rows.length;
  assert.equal(cell(last, 1).v, 'Grand Total');
  assert.equal(cell(last, 4).f, 'SUM(D5:D8)');
  assert.equal(cell(last, 8).f, 'SUM(H5:H8)');
  assert.equal(cell(last, 8).v, 81); // cached value = the real total
  assert.equal(sheet.rows.length, 4 + 4 + 1); // 4 header rows + 4 products + Grand Total
  assert.equal(details.name, 'Details');
  assert.equal(details.autoFilter, `A1:L${rows.length + 1}`);
  assert.deepEqual(details.rows[0].map((c) => c.v), ['Destination', 'so #', 'Product Code', 'Description', 'Product Category', 'Qty', 'Completion Date:', 'Ordered', 'Delivered', 'Source', 'MO', 'MO state']);
  assert.equal(details.rows.length, rows.length + 1);
});

test('Excel: the file is a valid ZIP with both sheets, formulas, a hidden column and fills', () => {
  const rows = sortRows(filterRows(data().rows, { destination: 'Australia' }, TODAY));
  const files = unzip(consolidationWorkbook(buildMatrix(rows), rows));
  assert.match(files['xl/workbook.xml'], /name="Consolidation FG".*name="Details"/s);
  const s1 = files['xl/worksheets/sheet1.xml'];
  assert.doesNotMatch(s1, /hidden="1"/); // no hidden column any more
  assert.match(s1, /<tabColor rgb="FF00B050"\/>/);
  assert.match(s1, /<f>SUM\(D5:E5\)<\/f><v>/);
  assert.match(files['xl/worksheets/sheet2.xml'], /<autoFilter ref="A1:L\d+"\/>/);
  assert.match(files['xl/styles.xml'], /fgColor rgb="FFC4D79B"/); // the green of the Grand Total
  assert.match(files['xl/styles.xml'], /numFmtId="14"/);
  assert.equal(consolidationFileName('2026-10-26'), 'Consolidation_Order_2026-10-26.xlsx');
});

test('Excel: an empty selection still gives a valid sheet (no broken SUM ranges)', () => {
  const sheets = buildConsolidationSheets(buildMatrix([]), []);
  assert.equal(sheets[0].rows.length, 5); // 4 header rows + Grand Total
  assert.equal(sheets[0].rows[4][3].f, undefined);
  assert.doesNotThrow(() => consolidationWorkbook(buildMatrix([]), []));
});

test('fully delivered lines: hidden by default, shown with includeDelivered, never in the matrix', () => {
  const rows = data().rows;
  assert.equal(filterRows(rows, {}, TODAY).some((r) => r.remainingQty === 0), false);
  const withDelivered = filterRows(rows, { includeDelivered: true }, TODAY);
  assert.equal(withDelivered.length, rows.length); // all 8 lines
  const delivered = withDelivered.find((r) => r.remainingQty === 0);
  assert.deepEqual([delivered.so, delivered.productCode, delivered.orderedQty, delivered.deliveredQty], ['S00002', 'P-100', 20, 20]);
  // the other filters still apply, and a minimum quantity of 1 hides the delivered line again
  assert.deepEqual(codes(filterRows(rows, { includeDelivered: true, so: '2' }, TODAY)), ['S00002/P-100', 'S00002/H-200']);
  assert.equal(filterRows(rows, { includeDelivered: true, qtyMin: 1 }, TODAY).some((r) => r.remainingQty === 0), false);
  // nothing is left to ship on that line, so the matrix is the same with or without it
  assert.deepEqual(buildMatrix(withDelivered), buildMatrix(open()));
  assert.equal(summarize(withDelivered).lines, 8);
  assert.equal(summarize(withDelivered).totalQty, 81); // the quantity to ship does not change
});

test('Excel "Details" lists the fully delivered lines when they are included', () => {
  const rows = sortRows(filterRows(data().rows, { includeDelivered: true }, TODAY));
  const [, details] = buildConsolidationSheets(buildMatrix(rows), rows);
  assert.equal(details.rows.length, 8 + 1);
  assert.ok(details.rows.some((r) => r[5].v === 0 && r[7].v === 20 && r[8].v === 20)); // Qty 0, Ordered 20, Delivered 20
});

// --- items made for an order but not on it (manufacturing orders) ------------------------------------------------

const MO_PRODUCTS = {
  ...PRODUCTS,
  20: { category: `${FG} / Accessories / Pails`, code: 'X-900', name: 'TEST Extra item' }, // on no order line
  21: { category: 'All / Semi-Finished', code: 'S-1', name: 'TEST Semi-finished' },
};
const mo = (id, state, productId, origin, qty) => ({ id, reference: `TEST/MO/${id}`, state, productId, origin, qty });
const MOS = [
  mo(501, 'confirmed', 20, 'EC for S00001 - target date', 15), // -> S00001
  mo(502, 'confirmed', 10, 'S00001', 36), // product P-100 IS on the order: just the production of that line -> no row
  mo(503, 'cancel', 20, 'S00001', 9), // cancelled -> no row
  mo(504, 'done', 20, 'for S00002 and S00001', 5), // mentions two orders: it belongs to the first one, S00002
  mo(505, 'confirmed', 20, 'S00001', 7), // Odoo links it to S00004 (moIds below): that wins over the text
  mo(506, 'confirmed', 21, 'S00001', 4), // semi-finished -> no row
  mo(507, 'confirmed', 77, 'S00001', 4), // unknown product -> no row
  mo(508, 'confirmed', 20, 'S00005', 4), // order S00005 is not open -> no row
  mo(509, 'confirmed', 20, 'S000010 / XS00001', 4), // longer number, part of a word -> no row
  mo(510, 'confirmed', 20, 'HP for SO0001 (Source)', 0), // quantity 0 -> no row
  mo(511, 'progress', 20, 'HP for SO0003', 6), // "SO0003" means S00003 -> S00003 (an order without a date)
];
const SNAP_MO = { ...SNAP, lineProducts: MO_PRODUCTS, openSalesOrders: ORDERS.map((o) => (o.id === 4 ? { ...o, moIds: [505] } : o)), orderMos: MOS };
const withMo = () => consolidationData(SNAP_MO, TZ);
const moRows = () => withMo().rows.filter((r) => r.source === 'mo');

test('MO items: only the right manufacturing orders become rows, each for ONE order', () => {
  const rows = moRows();
  assert.deepEqual(
    rows.map((r) => [r.moReference, r.so, r.productCode, r.remainingQty, r.moState]).sort(),
    [
      ['TEST/MO/501', 'S00001', 'X-900', 15, 'confirmed'],
      ['TEST/MO/504', 'S00002', 'X-900', 5, 'done'],
      ['TEST/MO/505', 'S00004', 'X-900', 7, 'confirmed'],
      ['TEST/MO/511', 'S00003', 'X-900', 6, 'progress'],
    ]
  );
  assert.ok(rows.every((r) => r.lineId < 0 && r.orderedQty === r.remainingQty && r.deliveredQty === 0));
  const all = withMo().rows;
  assert.equal(new Set(all.map((r) => r.lineId)).size, all.length); // no duplicates
  assert.equal(withMo().moLineCount, 4);
  assert.equal(withMo().lineCount, 7); // the order lines are not changed by the MO rows
  assert.ok(withMo().rows.filter((r) => r.source === 'order').every((r) => r.moReference === null));
});

test('MO items: hidden by default, shown with includeMo, and they follow all the other filters', () => {
  const rows = withMo().rows;
  assert.equal(filterRows(rows, {}, TODAY).some((r) => r.source === 'mo'), false);
  const on = filterRows(rows, { includeMo: true }, TODAY);
  assert.equal(on.filter((r) => r.source === 'mo').length, 4);
  assert.deepEqual(filterRows(rows, { includeMo: true, so: '4', productRef: 'x-9' }, TODAY).map((r) => r.moReference), ['TEST/MO/505']);
  assert.deepEqual(filterRows(rows, { includeMo: true, deliveryFrom: '2026-10-27', deliveryTo: '2026-10-29', productRef: 'X-9' }, TODAY).map((r) => r.so), ['S00001']);
  assert.deepEqual(filterRows(rows, { includeMo: true, deliveryMode: 'noDate', productRef: 'X-9' }, TODAY).map((r) => r.so), ['S00003']); // S00003 has no date
  assert.deepEqual(filterRows(rows, { includeMo: true, qtyMin: 6, productRef: 'X-9' }, TODAY).map((r) => r.remainingQty).sort((x, y) => x - y), [6, 7, 15]);
});

test('MO items in the matrix and in the Excel', () => {
  const rows = sortRows(filterRows(withMo().rows, { includeMo: true }, TODAY));
  const m = buildMatrix(rows);
  const x = m.rows.find((r) => r.code === 'X-900');
  assert.equal(x.total, 33); // 15 + 5 + 7 + 6, each on its own order column
  assert.equal(x.cells.filter((q) => q !== null).length, 4);
  assert.equal(m.grandTotal, 81 + 33);
  const [, details] = buildConsolidationSheets(m, rows);
  const mine = details.rows.filter((r) => r[9]?.v === 'Manufacturing order');
  assert.equal(mine.length, 4);
  assert.deepEqual(mine.map((r) => r[10].v).sort(), ['TEST/MO/501', 'TEST/MO/504', 'TEST/MO/505', 'TEST/MO/511']);
  assert.ok(details.rows.slice(1).filter((r) => r[9].v === 'Order line').every((r) => r[10].v === ''));
});

test('MO items: a snapshot without orderMos still works', () => {
  assert.equal(consolidationData({ ...SNAP, orderMos: undefined }, TZ).moLineCount, 0);
});
