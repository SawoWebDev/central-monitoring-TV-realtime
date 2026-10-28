// Unit tests for the operations status calculations.
// ALL DATA IN THIS FILE IS MADE-UP TEST DATA. It is not company data and is never shown on the dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cbmShipped,
  cbmShippedMonthly,
  leadTime,
  manufacturingByPlant,
  stageOf,
} from '../src/services/operationsAnalytics.js';

const TZ = 'Asia/Manila';
const PERIOD = { today: '2026-10-16', weekStart: '2026-10-12', monthStart: '2026-10-01' };
const NOW = new Date('2026-10-16T02:00:00Z'); // Fri 16 Oct 2026, 10:00 in Manila
const WAREHOUSES = [
  { id: 1, code: 'PL1', name: 'TEST Plant 1' },
  { id: 3, code: 'PL3', name: 'TEST Plant 3' },
];
const VOLUMES = { 10: 0.5, 11: 0, 12: 0.02, 13: 4 }; // product 11 has NO volume
// Categories for the CBM cards: 10-12 are finished goods, 13 is semi-finished (never counted)
const CARD_PRODUCTS = {
  10: { category: 'All / Finished Goods / Heaters' },
  11: { category: 'All / Finished Goods / Accessories' },
  12: { category: 'All / Finished Goods / Controls' },
  13: { category: 'All / Semi-Finished' },
};

// --- CBM shipped -----------------------------------------------------------------------

test('CBM shipped per plant for today / week / month, with missing volumes counted', () => {
  const shippedMoves = [
    { date: '2026-10-16T01:00:00Z', quantity: 2, productId: 10, warehouseId: 1 }, // today
    { date: '2026-10-15T16:30:00Z', quantity: 4, productId: 12, warehouseId: 1 }, // 16 Oct 00:30 Manila = today
    { date: '2026-10-13T03:00:00Z', quantity: 10, productId: 11, warehouseId: 3 }, // this week, no volume
    { date: '2026-10-05T03:00:00Z', quantity: 1, productId: 10, warehouseId: 3 }, // this month only
    { date: '2026-09-30T15:00:00Z', quantity: 99, productId: 10, warehouseId: 3 }, // 30 Sep Manila: outside
    { date: '2026-10-16T01:30:00Z', quantity: 50, productId: 13, warehouseId: 1 }, // today, but semi-finished: not counted
  ];
  const r = cbmShipped({ shippedMoves, productVolumes: VOLUMES, shippedProducts: CARD_PRODUCTS, warehouses: WAREHOUSES, period: PERIOD }, TZ);

  const pl1 = r.plants.find((p) => p.code === 'PL1');
  const pl3 = r.plants.find((p) => p.code === 'PL3');
  assert.deepEqual(pl1.today, { cbm: 1.08, quantity: 6 }); // 2 x 0.5 + 4 x 0.02
  assert.deepEqual(pl1.month, { cbm: 1.08, quantity: 6 });
  assert.deepEqual(pl3.today, { cbm: 0, quantity: 0 });
  assert.deepEqual(pl3.week, { cbm: 0, quantity: 10 });
  assert.deepEqual(pl3.month, { cbm: 0.5, quantity: 11 });
  assert.deepEqual(r.totals.month, { cbm: 1.58, quantity: 17 });
  assert.deepEqual(r.missingVolume, { products: 1, shippedProducts: 3, quantity: 10, lines: 1 });
});

// --- Lead-time stages --------------------------------------------------------------------

const MO_STATES = { 100: 'draft', 101: 'confirmed', 102: 'progress', 103: 'done', 104: 'done', 105: 'cancel' };

test('stage rules', () => {
  const so = (deliveryStatus, moIds) => ({ deliveryStatus, moIds });
  assert.equal(stageOf(so('pending', [100, 101]), MO_STATES), 'waiting_production');
  assert.equal(stageOf(so('pending', [102, 103]), MO_STATES), 'in_production');
  assert.equal(stageOf(so('pending', [103, 101]), MO_STATES), 'in_production'); // some done, some not
  assert.equal(stageOf(so('started', [103, 104]), MO_STATES), 'ready_to_ship');
  assert.equal(stageOf(so('pending', []), MO_STATES), 'ready_to_ship'); // nothing to manufacture
  assert.equal(stageOf(so('pending', [105]), MO_STATES), 'ready_to_ship'); // only a cancelled MO
  assert.equal(stageOf(so('partial', [100]), MO_STATES), 'partly_shipped');
});

test('lead time: counts and days open per stage, and finished orders this month', () => {
  const openSalesOrders = [
    { id: 1, reference: 'TEST-S1', deliveryStatus: 'pending', moIds: [100, 101], orderDate: '2026-10-06T02:00:00Z' },
    { id: 2, reference: 'TEST-S2', deliveryStatus: 'pending', moIds: [102, 103], orderDate: '2026-10-01T02:00:00Z' },
    { id: 3, reference: 'TEST-S3', deliveryStatus: 'started', moIds: [103, 104], orderDate: '2026-10-14T02:00:00Z' },
    { id: 4, reference: 'TEST-S4', deliveryStatus: 'pending', moIds: [], orderDate: '2026-10-10T02:00:00Z' },
    { id: 5, reference: 'TEST-S5', deliveryStatus: 'partial', moIds: [100], orderDate: '2026-09-16T02:00:00Z' },
    { id: 6, reference: 'TEST-S6', deliveryStatus: null, moIds: [], orderDate: '2026-10-01T02:00:00Z' },
    { id: 7, reference: 'TEST-S7', deliveryStatus: 'pending', moIds: [103, 101], orderDate: '2026-10-11T02:00:00Z' },
    // 15 Oct 20:00 UTC = 16 Oct 04:00 in Manila: open for 0 days
    { id: 8, reference: 'TEST-S8', deliveryStatus: 'pending', moIds: [105], orderDate: '2026-10-15T20:00:00Z' },
  ];
  const deliveredSalesOrders = [
    { id: 200, orderDate: '2026-10-02T02:00:00Z', deliveryStatus: 'full' },
    { id: 201, orderDate: '2026-09-20T02:00:00Z', deliveryStatus: 'full' },
    { id: 202, orderDate: '2026-10-01T02:00:00Z', deliveryStatus: 'partial' }, // not finished
  ];
  const doneDeliveries = [
    { saleOrderId: 200, dateDone: '2026-10-05T02:00:00Z' },
    { saleOrderId: 200, dateDone: '2026-10-12T02:00:00Z' }, // last one counts: 10 days
    { saleOrderId: 201, dateDone: '2026-09-30T15:00:00Z' },
    { saleOrderId: 201, dateDone: '2026-10-01T00:00:00Z' }, // last one: 1 Oct -> 11 days
    { saleOrderId: 202, dateDone: '2026-10-03T00:00:00Z' },
  ];

  const r = leadTime({ openSalesOrders, moStates: MO_STATES, deliveredSalesOrders, doneDeliveries, period: PERIOD }, TZ);
  const stage = Object.fromEntries(r.stages.map((s) => [s.stage, s]));

  assert.equal(r.openOrders, 7);
  assert.equal(r.notTracked, 1);
  assert.deepEqual(
    [stage.waiting_production.count, stage.in_production.count, stage.ready_to_ship.count, stage.partly_shipped.count],
    [1, 2, 3, 1]
  );
  assert.equal(stage.waiting_production.averageDaysOpen, 10);
  assert.equal(stage.in_production.averageDaysOpen, 10); // 15 and 5
  assert.deepEqual(stage.in_production.oldest, { reference: 'TEST-S2', days: 15 });
  assert.equal(stage.ready_to_ship.averageDaysOpen, 2.7); // 2, 6, 0
  assert.equal(stage.ready_to_ship.withoutManufacturing, 2);
  assert.equal(stage.partly_shipped.averageDaysOpen, 30);
  assert.equal(stage.ready_to_ship.medianDaysOpen, 2);
  assert.equal(stage.in_production.medianDaysOpen, 10); // middle of 5 and 15
  assert.deepEqual(r.finishedThisMonth, { orders: 2, averageDays: 10.5, medianDays: 10.5, minDays: 10, maxDays: 11 });
});

// --- Manufacturing per plant ---------------------------------------------------------------

test('manufacturing orders per plant: open by status, late, finished per period, progress', () => {
  const openMos = [
    { state: 'draft', warehouseId: 1, deadline: null, qtyToProduce: 1, qtyProducing: 0 },
    { state: 'confirmed', warehouseId: 1, deadline: '2026-10-10T00:00:00Z', qtyToProduce: 1, qtyProducing: 0 }, // late
    { state: 'progress', warehouseId: 1, deadline: null, qtyToProduce: 10, qtyProducing: 5 }, // 50 %
    { state: 'to_close', warehouseId: 3, deadline: '2026-10-20T00:00:00Z', qtyToProduce: 4, qtyProducing: 4 }, // 100 %
    { state: 'progress', warehouseId: 3, deadline: null, qtyToProduce: 0, qtyProducing: 0 }, // no quantity: skipped
  ];
  const finishedMos = [
    { warehouseId: 1, finishedDate: '2026-10-16T01:00:00Z' },
    { warehouseId: 3, finishedDate: '2026-10-13T00:00:00Z' },
    { warehouseId: 3, finishedDate: '2026-10-02T00:00:00Z' },
  ];
  const r = manufacturingByPlant({ openMos, finishedMos, warehouses: WAREHOUSES, period: PERIOD }, TZ, NOW);
  const [pl1, pl3] = r.plants;

  assert.deepEqual(pl1.open, { draft: 1, confirmed: 1, progress: 1, to_close: 0 });
  assert.equal(pl1.late, 1);
  assert.deepEqual(pl1.finished, { today: 1, week: 1, month: 1 });
  assert.equal(pl1.inProgressAverage, 50);
  assert.deepEqual(pl3.open, { draft: 0, confirmed: 0, progress: 1, to_close: 1 });
  assert.deepEqual(pl3.finished, { today: 0, week: 1, month: 2 });
  assert.equal(pl3.inProgressAverage, 100);
  assert.equal(r.totals.openTotal, 5);
  assert.equal(r.totals.late, 1);
  assert.deepEqual(r.totals.finished, { today: 1, week: 2, month: 3 });
});

// --- CBM shipped per month, by product group ---------------------------------------------

const FG = 'All / Finished Goods';
const SHIPPED_PRODUCTS = {
  1: { category: `${FG} / Accessories / Pails / Wooden`, volume: 0.1 }, // Accessories
  2: { category: `${FG} / Heaters / Wall-Mounted`, volume: 0.5 }, // Heaters
  3: { category: `${FG} / Controls`, volume: 0.01 }, // Heaters (controls)
  4: { category: `${FG} / Sauna Rooms / Indoor`, volume: 2 }, // Sauna Rooms
  5: { category: `${FG} / Spare Parts / Heaters`, volume: 0.2 }, // Other
  6: { category: 'All / Semi-Finished', volume: 3 }, // not finished goods: left out
  7: { category: `${FG} / Accessories`, volume: 0 }, // NO volume
};
const MONTHLY_PERIOD = { today: '2026-10-16' };

test('CBM shipped per month: groups, total, zero-filled months, exclusions, timezone boundary', () => {
  const shippedMoves = [
    { date: '2026-10-05T03:00:00Z', quantity: 10, productId: 1 }, // Oct, Accessories 1.0
    { date: '2026-10-06T03:00:00Z', quantity: 2, productId: 2 }, // Oct, Heaters 1.0
    { date: '2026-10-06T04:00:00Z', quantity: 100, productId: 3 }, // Oct, Heaters 1.0 (controls)
    { date: '2026-10-07T03:00:00Z', quantity: 1, productId: 4 }, // Oct, Sauna Rooms 2.0
    { date: '2026-10-08T03:00:00Z', quantity: 5, productId: 5 }, // Oct, Other 1.0
    { date: '2026-10-09T03:00:00Z', quantity: 7, productId: 6 }, // Semi-Finished: excluded (21 m3)
    { date: '2026-10-10T03:00:00Z', quantity: 4, productId: 7 }, // no volume: 0 m3, counted as missing
    { date: '2026-09-30T16:30:00Z', quantity: 10, productId: 1 }, // 1 Oct 00:30 Manila -> October, not September
    { date: '2026-09-15T03:00:00Z', quantity: 3, productId: 4 }, // Sep, Sauna Rooms 6.0
    { date: '2025-09-30T03:00:00Z', quantity: 50, productId: 4 }, // older than 12 months: ignored
    { date: '2026-10-11T03:00:00Z', quantity: 1, productId: 99 }, // product we know nothing about: excluded
  ];
  const r = cbmShippedMonthly({ shippedMoves, shippedProducts: SHIPPED_PRODUCTS, period: MONTHLY_PERIOD }, TZ);

  assert.equal(r.months.length, 12);
  assert.equal(r.months[0].month, '2025-11'); // oldest first, current month last
  assert.equal(r.months[11].month, '2026-10');
  assert.equal(r.months[0].total, 0); // zero-filled

  const oct = r.months[11];
  assert.deepEqual(
    [oct.accessories, oct.heaters, oct.saunaRooms, oct.other, oct.total],
    [2, 2, 2, 1, 7] // accessories 1.0 + 1.0 (boundary move), heaters 1.0 + 1.0, rooms 2.0, other 1.0
  );
  assert.equal(oct.total, oct.accessories + oct.heaters + oct.saunaRooms + oct.other);
  assert.equal(oct.partial, true);
  assert.equal(r.months[10].partial, false);
  assert.deepEqual([r.months[10].saunaRooms, r.months[10].total], [6, 6]); // September
  assert.deepEqual(r.excluded, { cbm: 21, lines: 2 }); // 7 x 3 m3 Semi-Finished + the unknown product
  assert.deepEqual(r.missingVolume, { products: 1, quantity: 4 });
});

test('CBM shipped per month: this month equals the CBM card (both finished goods only)', () => {
  const shippedMoves = [
    { date: '2026-10-05T03:00:00Z', quantity: 10, productId: 1, warehouseId: 1 },
    { date: '2026-10-06T03:00:00Z', quantity: 2, productId: 4, warehouseId: 3 },
    { date: '2026-10-07T03:00:00Z', quantity: 7, productId: 6, warehouseId: 1 }, // semi-finished: left out of both
  ];
  const volumes = { 1: 0.1, 4: 2, 6: 3 };
  const card = cbmShipped({ shippedMoves, productVolumes: volumes, shippedProducts: SHIPPED_PRODUCTS, warehouses: WAREHOUSES, period: { ...PERIOD, today: '2026-10-16' } }, TZ);
  const monthly = cbmShippedMonthly({ shippedMoves, shippedProducts: SHIPPED_PRODUCTS, period: MONTHLY_PERIOD }, TZ);
  assert.equal(monthly.months[11].total, card.totals.month.cbm);
});
