// Unit tests for the multiple SO# filter and the Product Category of the Consolidation Order page.
// ALL DATA IN THIS FILE IS MADE-UP TEST DATA (the category paths are real Odoo names, the orders and quantities are not).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildMatrix, consolidationData, filterRows, parseSoList, sortRows } from '../src/pages/consolidationOrder/consolidationOrder.js';
import { buildConsolidationSheets } from '../src/pages/consolidationOrder/consolidationOrderExport.js';
import { NO_CATEGORY, SHIPPED_OTHER, productCategoryLabel, shippedGroup } from '../src/config/categoryGroups.js';

const TZ = 'Asia/Manila';
const TODAY = '2026-10-26';
const FG = 'All / Finished Goods';

// --- the shared category rule ---------------------------------------------------------------------------------------

const PATHS = {
  [`${FG} / Accessories / Pails / Wooden`]: 'Accessories',
  [`${FG} / Accessories / Doors & Handles / Wooden Doors`]: 'Accessories',
  [`${FG} / Accessories`]: 'Accessories',
  [`${FG} / Heaters / Wall-Mounted`]: 'Heaters',
  [`${FG} / Heaters`]: 'Heaters',
  [`${FG} / Controls`]: 'Heaters', // CBM Shipped puts controls and steam into the Heaters group
  [`${FG} / Steam`]: 'Heaters',
  [`${FG} / Sauna Rooms / Infrared`]: 'Sauna Rooms',
  [`${FG} / Sauna Rooms`]: 'Sauna Rooms',
  // every other category keeps its own Odoo name (never a generic "Others")
  [`${FG} / Spare Parts / Heaters`]: 'Spare Parts / Heaters', // a Heaters name inside Spare Parts is NOT the Heaters group
  [`${FG} / Panels & Timbers / Cedar`]: 'Panels & Timbers / Cedar',
  [`${FG} / Marketing Material`]: 'Marketing Material',
  [`${FG} / Infrared`]: 'Infrared',
  [FG]: 'Finished Goods',
  'All / Semi-Finished / Wood': 'Semi-Finished / Wood',
};

test('category label: Accessories / Heaters / Sauna Rooms like the CBM Shipped chart, every other category by its own name', () => {
  for (const [path, label] of Object.entries(PATHS)) assert.equal(productCategoryLabel(path), label, path);
});

test('category label: always the same as the CBM Shipped group where that group applies, and never "Other"', () => {
  for (const path of Object.keys(PATHS)) {
    const group = shippedGroup(path);
    if (group === SHIPPED_OTHER) assert.notEqual(productCategoryLabel(path), SHIPPED_OTHER, path); // keeps its own name
    else assert.equal(productCategoryLabel(path), group, path); // exactly the CBM Shipped group
  }
});

test('category label: a product without a category is shown explicitly, not put into another category', () => {
  for (const missing of [null, undefined, '']) assert.equal(productCategoryLabel(missing), NO_CATEGORY);
  assert.equal(NO_CATEGORY, 'No category');
});

// --- rows, matrix and Excel carry the category ---------------------------------------------------------------------------

const so = (id, reference, extra = {}) => ({ id, reference, deliveryStatus: 'pending', customerName: 'TEST', destination: 'Australia', commitmentDate: '2026-10-28T02:00:00Z', moIds: [], ...extra });
const ORDERS = [
  so(1, 'S09259'),
  so(2, 'S09260', { destination: 'Canada', commitmentDate: '2026-11-20T02:00:00Z' }),
  so(3, 'S09261'),
  so(4, 'S00040', { destination: 'Canada' }),
  so(5, 'S092590'), // a longer number that only CONTAINS 9259
];
const PRODUCTS = {
  10: { category: `${FG} / Accessories / Pails / Wooden`, code: 'P-1', name: 'TEST Pail' },
  11: { category: `${FG} / Heaters / Wall-Mounted`, code: 'H-1', name: 'TEST Heater' },
  12: { category: `${FG} / Sauna Rooms / Infrared`, code: 'R-1', name: 'TEST Room' },
  13: { category: `${FG} / Spare Parts / Heaters`, code: 'SP-1', name: 'TEST Spare part' },
  14: { category: `${FG} / Panels & Timbers / Cedar`, code: 'PT-1', name: 'TEST Panel' },
};
let lineId = 0;
const line = (orderId, productId, qty) => ({ id: ++lineId, orderId, productId, productName: 'x', orderedQty: qty, deliveredQty: 0 });
const LINES = [line(1, 10, 5), line(1, 11, 2), line(2, 12, 1), line(2, 10, 7), line(3, 13, 4), line(3, 14, 6), line(4, 11, 3), line(5, 10, 1)];
const SNAP = { openSalesOrders: ORDERS, openOrderLines: LINES, lineProducts: PRODUCTS };
const rows = () => consolidationData(SNAP, TZ).rows;
const sos = (f) => [...new Set(filterRows(rows(), f, TODAY).map((r) => r.so))].sort();

test('rows: the category of the actual product, plus the full Odoo path', () => {
  const byCode = Object.fromEntries(rows().map((r) => [r.productCode, r]));
  assert.deepEqual([byCode['P-1'].category, byCode['H-1'].category, byCode['R-1'].category], ['Accessories', 'Heaters', 'Sauna Rooms']);
  assert.equal(byCode['SP-1'].category, 'Spare Parts / Heaters');
  assert.equal(byCode['PT-1'].category, 'Panels & Timbers / Cedar');
  assert.equal(byCode['P-1'].categoryPath, `${FG} / Accessories / Pails / Wooden`);
  assert.equal(new Set(rows().map((r) => r.lineId)).size, rows().length); // no duplicated lines
});

test('matrix: the category sits on the product row; Excel: right of the Description, same text as the rows', () => {
  const all = filterRows(rows(), {}, TODAY);
  const m = buildMatrix(all);
  assert.deepEqual(m.rows.map((r) => [r.code, r.category]).sort(), [['H-1', 'Heaters'], ['P-1', 'Accessories'], ['PT-1', 'Panels & Timbers / Cedar'], ['R-1', 'Sauna Rooms'], ['SP-1', 'Spare Parts / Heaters']]);
  const [sheet, details] = buildConsolidationSheets(m, sortRows(all));
  assert.deepEqual([sheet.rows[3][1].v, sheet.rows[3][2].v], ['Description', 'Product Category']); // header row 4: B and C
  m.rows.forEach((p, i) => assert.equal(sheet.rows[4 + i][2].v, p.category)); // C = the same category as the browser table
  assert.deepEqual(details.rows[0].slice(3, 6).map((c) => c.v), ['Description', 'Product Category', 'Qty']);
  const sorted = sortRows(all);
  sorted.forEach((r, i) => assert.equal(details.rows[1 + i][4].v, r.category)); // Details: right of the Description
});

// --- multiple SO# -------------------------------------------------------------------------------------------------------

test('parseSoList: commas, semicolons, new lines, spaces, empty entries and duplicates', () => {
  assert.deepEqual(parseSoList('SO 9259'), ['SO 9259']);
  assert.deepEqual(parseSoList('SO 9259, SO 9260 ,SO 9261'), ['SO 9259', 'SO 9260', 'SO 9261']);
  assert.deepEqual(parseSoList('SO 9259\nSO 9260\r\nSO 9261\n'), ['SO 9259', 'SO 9260', 'SO 9261']); // pasted lines
  assert.deepEqual(parseSoList('9259;9260,,  ,9261'), ['9259', '9260', '9261']);
  assert.deepEqual(parseSoList('SO 9259, so9259, SO  9259, 9259'), ['SO 9259', '9259']); // duplicates ignoring case and spaces
  assert.deepEqual(parseSoList(['  S09259 ', '', 'S09259', 'S09260']), ['S09259', 'S09260']); // a list (as the screen sends it)
  assert.deepEqual(parseSoList('SO 9259, S09259, so9259'), ['SO 9259']); // the same order in three spellings
  assert.deepEqual(parseSoList(''), []);
  assert.deepEqual(parseSoList(null), []);
});

test('SO# filter: one number, several numbers (OR), in any spelling', () => {
  assert.deepEqual(sos({ so: 'SO 9259' }), ['S09259']); // exactly that order, not S092590
  assert.deepEqual(sos({ so: 'S09259' }), ['S09259']);
  assert.deepEqual(sos({ so: 'SO9259' }), ['S09259']);
  assert.deepEqual(sos({ so: 'SO 9259, SO 9260, SO 9261' }), ['S09259', 'S09260', 'S09261']); // OR
  assert.deepEqual(sos({ so: ['SO 9259', 'S09261'] }), ['S09259', 'S09261']);
  assert.deepEqual(sos({ so: 'SO 9259\nSO 9261' }), ['S09259', 'S09261']);
  assert.deepEqual(sos({ so: 'SO 9259, S09259, 9259' }), ['S09259', 'S092590']); // "9259" alone still means "contains 9259"
  assert.deepEqual(sos({ so: 'SO 40' }), ['S00040']); // short numbers too
  assert.deepEqual(sos({ so: 'SO 1234' }), []); // an order that does not exist: nothing, no error
  assert.deepEqual(sos({ so: 'SO 9259, SO 1234' }), ['S09259']); // one unknown entry does not hide the others
});

test('SO# filter: the old single search behaviour is unchanged (text inside the SO number, ignoring case)', () => {
  assert.deepEqual(sos({ so: '9259' }), ['S09259', 'S092590']);
  assert.deepEqual(sos({ so: 's0926' }), ['S09260', 'S09261']);
  assert.deepEqual(sos({ so: '040' }), ['S00040']);
  assert.deepEqual(sos({}), ['S00040', 'S09259', 'S092590', 'S09260', 'S09261']); // no SO# filter: everything
});

test('SO# filter: several numbers (OR) together with the other filters (AND)', () => {
  const list = 'SO 9259, SO 9260, SO 9261, SO 40';
  assert.deepEqual(sos({ so: list, destination: 'Australia' }), ['S09259', 'S09261']);
  assert.deepEqual(sos({ so: list, destination: 'Canada' }), ['S00040', 'S09260']);
  assert.deepEqual(sos({ so: list, deliveryFrom: '2026-11-01', deliveryTo: '2026-11-30' }), ['S09260']); // only S09260 is delivered in November
  assert.deepEqual(sos({ so: list, deliveryFrom: '2026-10-26', deliveryTo: '2026-10-30' }), ['S00040', 'S09259', 'S09261']);
  assert.deepEqual(sos({ so: list, productRef: 'h-1' }), ['S00040', 'S09259']); // product code
  assert.deepEqual(sos({ so: list, productName: 'pail' }), ['S09259', 'S09260']); // product name
  assert.deepEqual(sos({ so: list, productRef: 'p-1', productName: 'pail', destination: 'Canada', deliveryFrom: '2026-11-01' }), ['S09260']); // everything together
  assert.deepEqual(sos({ so: 'SO 9259, SO 9260', destination: 'Canada', productRef: 'h-1' }), []); // contradicting filters: nothing
});

test('SO# filter and the category: the category of each line stays the same whatever the filters', () => {
  const picked = filterRows(rows(), { so: 'SO 9259, SO 9261', destination: 'Australia' }, TODAY);
  assert.deepEqual(picked.map((r) => `${r.so}:${r.productCode}:${r.category}`).sort(), [
    'S09259:H-1:Heaters', 'S09259:P-1:Accessories', 'S09261:PT-1:Panels & Timbers / Cedar', 'S09261:SP-1:Spare Parts / Heaters',
  ]);
  assert.equal(new Set(picked.map((r) => r.lineId)).size, picked.length); // no duplicates
});

// --- CBM of a line: quantity x the product's volume --------------------------------------------------------------------

test('rows: CBM (ordered) and Remaining CBM = quantity x product volume; no volume = 0 and flagged', () => {
  const products = { ...PRODUCTS, 10: { ...PRODUCTS[10], volume: 0.0425 } }; // 11 and the others have no volume
  const lines = [{ id: 901, orderId: 1, productId: 10, productName: 'x', orderedQty: 5, deliveredQty: 2 }, { id: 902, orderId: 1, productId: 11, productName: 'x', orderedQty: 3, deliveredQty: 0 }];
  const out = consolidationData({ openSalesOrders: ORDERS, openOrderLines: lines, lineProducts: products }, TZ).rows;
  const a = out.find((r) => r.lineId === 901);
  const b = out.find((r) => r.lineId === 902);
  assert.deepEqual([a.cbmOrdered, a.cbmRemaining, a.noVolume], [0.213, 0.128, false]); // 5 x 0.0425 = 0.2125, 3 x 0.0425 = 0.1275 (3 decimals)
  assert.deepEqual([b.cbmOrdered, b.cbmRemaining, b.noVolume], [0, 0, true]);
});
