// Unit tests for "Open Sales Ordered" and "Open SO by Product Category" (no money).
// ALL DATA IN THIS FILE IS MADE-UP TEST DATA. It is not company data and is never shown on the dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOpenOrders,
  filterOpenOrders,
  sortOpenOrders,
  openOrdersByCategory,
  openOrdersCsv,
  isOpenOrder,
  originMentions,
} from '../src/services/openOrders.js';

const TZ = 'Asia/Manila';
const NOW = new Date('2026-10-16T02:00:00Z'); // Fri 16 Oct 2026, 10:00 in Manila
const so = (o) => ({ moIds: [], orderCbm: 0, commitmentDate: null, ...o });
const ORDERS = [
  so({ id: 1, reference: 'TEST-S1', customerId: 100, customerName: 'TEST Acme', deliveryStatus: 'pending', orderDate: '2026-10-01T02:00:00Z', commitmentDate: '2026-10-10T00:00:00Z', orderCbm: 2 }),
  so({ id: 2, reference: 'TEST-S2', destination: 'TEST Country', customerId: 200, customerName: 'TEST Beta', deliveryStatus: 'partial', orderDate: '2026-06-01T02:00:00Z', commitmentDate: '2026-10-20T00:00:00Z' }),
  so({ id: 3, reference: 'TEST-S3', customerId: 100, customerName: 'TEST Acme', deliveryStatus: 'started', orderDate: '2025-09-01T02:00:00Z' }), // no delivery date
  so({ id: 4, reference: 'TEST-S4', customerId: 100, customerName: 'TEST Acme', deliveryStatus: 'full', orderDate: '2026-10-01T02:00:00Z' }), // not open
  so({ id: 5, reference: 'TEST-S5', customerId: 100, customerName: 'TEST Acme', deliveryStatus: null, orderDate: '2026-10-01T02:00:00Z' }), // no delivery status
  // 15 Oct 20:00 UTC = 16 Oct 04:00 in Manila (0 days open); promised 16 Oct 01:00 UTC, before "now" -> late
  so({ id: 6, reference: 'TEST-S6', customerId: 300, customerName: 'TEST Gamma', deliveryStatus: 'pending', orderDate: '2026-10-15T20:00:00Z', commitmentDate: '2026-10-16T01:00:00Z' }),
];
const PRODUCTS = {
  10: { category: 'All / Finished Goods / Heaters / Towers', volume: 0.5 },
  11: { category: 'All / Finished Goods / Controls', volume: 0 }, // NO volume
  12: { category: 'All / Finished Goods / Sauna Rooms / Indoor', volume: 2 },
};
const line = (id, orderId, productId, orderedQty, deliveredQty, cbm = 0) => ({ id, orderId, productId, productName: `TEST Product ${productId}`, orderedQty, deliveredQty, cbm });
const LINES = [
  line(1, 1, 10, 4, 1, 2), // remaining 3 x 0.5 = 1.5
  line(2, 1, 11, 10, 0), // remaining 10, no volume
  line(3, 2, 12, 2, 2), // fully delivered line: remaining 0
  line(4, 2, 10, 5, 3), // remaining 2 x 0.5 = 1
  line(5, 3, 12, 1, 0), // remaining 1 x 2 = 2
  line(6, 4, 10, 9, 9),
  line(7, 6, 11, 2, 0), // remaining 2, no volume
];
const SNAP = { openSalesOrders: ORDERS, openOrderLines: LINES, lineProducts: PRODUCTS, moStates: {} };
const built = () => buildOpenOrders(SNAP, TZ, NOW);
const ids = (list) => list.map((o) => o.id);
const byId = (id) => built().find((o) => o.id === id);

test('open = delivery status set and not full', () => {
  assert.equal(isOpenOrder({ deliveryStatus: 'pending' }), true);
  assert.equal(isOpenOrder({ deliveryStatus: 'partial' }), true);
  assert.equal(isOpenOrder({ deliveryStatus: 'full' }), false);
  assert.equal(isOpenOrder({ deliveryStatus: null }), false);
  assert.deepEqual(ids(built()), [1, 2, 3, 6]);
});

test('late flag: promised date before now; no date is never late', () => {
  assert.equal(byId(1).late, true);
  assert.equal(byId(2).late, false); // promised in the future
  assert.equal(byId(3).late, false);
  assert.equal(byId(3).noDeliveryDate, true);
  assert.equal(byId(6).late, true); // 1 hour ago
});

test('remaining CBM and remaining quantity; no-volume lines counted', () => {
  const s1 = byId(1);
  assert.equal(s1.orderCbm, 2); // Odoo total_cbm, as given
  assert.equal(s1.remainingCbm, 1.5);
  assert.equal(s1.remainingQty, 13);
  assert.equal(s1.linesWithoutVolume, 1);
  assert.equal(byId(2).remainingCbm, 1); // fully delivered line adds nothing
  assert.equal(byId(3).remainingCbm, 2);
  assert.deepEqual(
    s1.lines.map((l) => [l.orderedQty, l.deliveredQty, l.remainingQty, l.remainingCbm, l.noVolume]),
    [[4, 1, 3, 1.5, false], [10, 0, 10, 0, true]]
  );
});

test('days open (Manila dates), age buckets and stage', () => {
  assert.deepEqual([byId(1).daysOpen, byId(1).ageBucket], [15, '0-30']);
  assert.deepEqual([byId(2).daysOpen, byId(2).ageBucket], [137, '91-365']);
  assert.deepEqual([byId(3).daysOpen, byId(3).ageBucket], [410, 'over365']);
  assert.deepEqual([byId(6).daysOpen, byId(6).ageBucket], [0, '0-30']);
  assert.equal(byId(1).stage, 'ready_to_ship'); // no MOs, nothing shipped
  assert.equal(byId(2).stage, 'partly_shipped');
});

test('filters: category (incl. 3rd level), age, late only, search, customer', () => {
  const all = built();
  assert.deepEqual(ids(filterOpenOrders(all, { category: 'All / Finished Goods / Heaters' })), [1, 2]);
  assert.deepEqual(ids(filterOpenOrders(all, { category: 'All / Finished Goods / Sauna Rooms' })), [3]); // S2's sauna line is delivered
  assert.deepEqual(ids(filterOpenOrders(all, { category: 'All / Finished Goods / Heat' })), []); // whole levels only
  assert.deepEqual(ids(filterOpenOrders(all, { age: 'over365' })), [3]);
  assert.deepEqual(ids(filterOpenOrders(all, { lateOnly: true })), [1, 6]);
  assert.deepEqual(ids(filterOpenOrders(all, { search: 'acme' })), [1, 3]);
  assert.deepEqual(ids(filterOpenOrders(all, { search: 's2' })), [2]);
  assert.deepEqual(ids(filterOpenOrders(all, { customer: 200 })), [2]);
});

test('sorting: values, empty values last', () => {
  assert.deepEqual(ids(sortOpenOrders(built(), 'remainingCbm', 'desc')), [3, 1, 2, 6]);
  assert.deepEqual(ids(sortOpenOrders(built(), 'commitmentDate', 'asc')), [1, 6, 2, 3]);
  assert.deepEqual(ids(sortOpenOrders(built(), 'daysOpen', 'desc')), [3, 2, 1, 6]);
});

test('category board: open SOs, remaining quantity and CBM per category; delivered lines left out', () => {
  assert.deepEqual(openOrdersByCategory(built(), 'full'), [
    { category: 'All / Finished Goods / Heaters / Towers', remainingQty: 5, remainingCbm: 2.5, linesWithoutVolume: 0, openSos: 2 },
    { category: 'All / Finished Goods / Controls', remainingQty: 12, remainingCbm: 0, linesWithoutVolume: 2, openSos: 2 },
    { category: 'All / Finished Goods / Sauna Rooms / Indoor', remainingQty: 1, remainingCbm: 2, linesWithoutVolume: 0, openSos: 1 },
  ]);
  const level3 = openOrdersByCategory(built(), 'level3');
  assert.deepEqual(level3.map((r) => [r.category, r.openSos]), [
    ['All / Finished Goods / Heaters', 2],
    ['All / Finished Goods / Controls', 2],
    ['All / Finished Goods / Sauna Rooms', 1],
  ]);
});

test('CSV has no money columns and marks late / no delivery date', () => {
  const csv = openOrdersCsv(sortOpenOrders(built(), 'reference', 'asc'), TZ).split('\r\n');
  assert.equal(csv[0], '"SO#","Customer","Order date","Delivery date","Delivery status","Stage","Order CBM","Remaining CBM","Remaining quantity (mixed UoM)","Days open","Late"');
  assert.equal(csv[1], '"TEST-S1","TEST Acme","2026-10-01","2026-10-10","pending","ready_to_ship","2","1.5","13","15","yes"');
  assert.match(csv[3], /"No delivery date"/);
  assert.doesNotMatch(csv.join('\n'), /PHP|price|amount|€|\$/i);
});

test('originMentions: exact sales order reference in the MO Source only', () => {
  assert.equal(originMentions('S09259-UAE (27200) Quality pass', 'S09259'), true);
  assert.equal(originMentions('HP for SO9259 - UAE - 27200', 'S09259'), true);
  assert.equal(originMentions('hp for so9259', 'S09259'), true); // case does not matter
  assert.equal(originMentions('LOCAL - PO#9259', 'S09259'), false); // a purchase order, not this SO
  assert.equal(originMentions('For Local9259 - 15900', 'S09259'), false);
  assert.equal(originMentions('S092590', 'S09259'), false); // longer number
  assert.equal(originMentions('XS09259', 'S09259'), false);
  assert.equal(originMentions(null, 'S09259'), false);
});

test('Manufacturing Order State per line: linked or by Source, same product, several MOs, none', () => {
  // TEST DATA: order 1 (TEST-S1) has lines for products 10 and 11; order 2 (TEST-S2) has product 10.
  const snap = {
    ...SNAP,
    openSalesOrders: ORDERS.map((o) => (o.id === 1 ? { ...o, moIds: [901] } : o)),
    orderMos: [
      { id: 901, reference: 'TEST/MO/901', state: 'done', productId: 10, origin: 'something else' }, // linked by Odoo
      { id: 902, reference: 'TEST/MO/902', state: 'confirmed', productId: 10, origin: 'HP for TEST-S1 - target' }, // by Source
      { id: 903, reference: 'TEST/MO/903', state: 'confirmed', productId: 99, origin: 'TEST-S1' }, // component, not on a line
      { id: 904, reference: 'TEST/MO/904', state: 'done', productId: 10, origin: 'TEST-S2' }, // other order
    ],
  };
  const orders = buildOpenOrders(snap, TZ, NOW);
  const o1 = orders.find((o) => o.id === 1);
  assert.deepEqual(o1.lines.find((l) => l.id === 1).mos, [
    { reference: 'TEST/MO/902', state: 'confirmed' },
    { reference: 'TEST/MO/901', state: 'done' },
  ]);
  assert.deepEqual(o1.lines.find((l) => l.id === 2).mos, []); // product 11: no MO
  assert.deepEqual(orders.find((o) => o.id === 2).lines.find((l) => l.id === 4).mos, [{ reference: 'TEST/MO/904', state: 'done' }]);
  // Without MO data every line still builds, with an empty list
  assert.ok(built().every((o) => o.lines.every((l) => Array.isArray(l.mos) && l.mos.length === 0)));
});

test('destination: the delivery address country, null when Odoo has none', () => {
  assert.equal(byId(2).destination, 'TEST Country');
  assert.equal(byId(1).destination, null);
});

test('search also matches the destination (case ignored); orders without one are simply not matched', () => {
  const all = built();
  assert.deepEqual(ids(filterOpenOrders(all, { search: 'test country' })), [2]);
  assert.deepEqual(ids(filterOpenOrders(all, { search: 'COUNTRY' })), [2]);
  assert.deepEqual(ids(filterOpenOrders(all, { search: 'test' })), [1, 2, 3, 6]); // SO#, customer and destination all match
});

test('open orders are built once per Odoo sync; only the clock-dependent fields change between calls', () => {
  const first = buildOpenOrders(SNAP, TZ, NOW);
  const later = buildOpenOrders(SNAP, TZ, new Date('2026-10-21T02:00:00Z')); // 5 days later
  const a = first.find((o) => o.id === 2);
  const b = later.find((o) => o.id === 2);
  assert.equal(b.lines, a.lines); // the heavy part is shared, not rebuilt
  assert.equal(a.late, false); // promised 20 Oct: not yet on 16 Oct
  assert.equal(b.late, true); // late on 21 Oct
  assert.equal(b.daysOpen, a.daysOpen + 5);
  // a new sync replaces the snapshot's arrays: everything is rebuilt
  const afterSync = buildOpenOrders({ ...SNAP, openSalesOrders: [...ORDERS] }, TZ, NOW);
  assert.notEqual(afterSync.find((o) => o.id === 2).lines, a.lines);
  assert.deepEqual(afterSync.map((o) => o.reference), first.map((o) => o.reference));
});
