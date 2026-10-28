// Unit tests for manufacturing CBM by plant x product category.
// ALL DATA IN THIS FILE IS MADE-UP TEST DATA. It is not company data and is never shown on the dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manufacturingCbm, categoryKind, categoryLabel, missingVolumeCsv } from '../src/services/manufacturingCbm.js';
import { categoryGroup } from '../src/config/categoryGroups.js';

const TZ = 'Asia/Manila';
const NOW = new Date('2026-10-16T02:00:00Z'); // Fri 16 Oct 2026, 10:00 in Manila
const PERIOD = { today: '2026-10-16', weekStart: '2026-10-12', monthStart: '2026-10-01' };
const WAREHOUSES = [
  { id: 1, code: 'PL1', name: 'TEST Plant 1' },
  { id: 3, code: 'PL3', name: 'TEST Plant 3' },
];
const PRODUCTS = {
  10: { category: 'All / Finished Goods / Heaters / Towers', volume: 0.5, uomId: 1 },
  11: { category: 'All / Finished Goods / Controls', volume: 0.02, uomId: 1 },
  12: { category: 'All / Finished Goods / Sauna Rooms / Indoor', volume: 0, uomId: 1 }, // NO volume
  13: { category: 'All / Semi-Finished / Wood', volume: 0.1, uomId: 1 },
  14: { category: 'All / Raw Materials', volume: 1, uomId: 1 },
  15: { category: 'All / Finished Goods / Accessories / Doors & Handles / Wooden Doors', volume: 0.3, uomId: 1 },
  16: { category: 'All / Finished Goods / Heaters', volume: 0.4, uomId: 2 }, // MO below uses unit 3
};
const mo = (o) => ({ productName: `TEST Product ${o.productId}`, qtyProducing: 0, uomId: 1, deadline: null, linkedToOpenSo: false, ...o });
const OPEN = [
  mo({ id: 1, warehouseId: 3, productId: 10, qtyToProduce: 4, qtyProducing: 1, deadline: '2026-10-10T00:00:00Z', linkedToOpenSo: true }), // late
  mo({ id: 2, warehouseId: 3, productId: 11, qtyToProduce: 10, deadline: '2026-10-20T00:00:00Z' }),
  mo({ id: 3, warehouseId: 1, productId: 12, qtyToProduce: 3 }), // no volume
  mo({ id: 4, warehouseId: 1, productId: 13, qtyToProduce: 20 }), // semi-finished
  mo({ id: 5, warehouseId: 1, productId: 14, qtyToProduce: 7 }), // raw material: never shown
  mo({ id: 6, warehouseId: 1, productId: 15, qtyToProduce: 2 }), // unmapped category
  mo({ id: 7, warehouseId: 3, productId: 16, qtyToProduce: 5, uomId: 3 }), // unit differs from product unit
];
const DONE = [
  mo({ id: 21, warehouseId: 3, productId: 10, qtyToProduce: 2, finishedDate: '2026-10-16T01:00:00Z' }), // today
  mo({ id: 22, warehouseId: 3, productId: 10, qtyToProduce: 4, finishedDate: '2026-10-05T00:00:00Z' }), // this month, not this week
  mo({ id: 23, warehouseId: 1, productId: 12, qtyToProduce: 1, finishedDate: '2026-10-13T00:00:00Z' }), // this week, no volume
  mo({ id: 24, warehouseId: 3, productId: 10, qtyToProduce: 9, finishedDate: '2026-09-30T15:00:00Z' }), // 30 Sep 23:00 Manila: outside
];
const SNAP = { openMos: OPEN, finishedMos: DONE, moProducts: PRODUCTS, warehouses: WAREHOUSES, period: PERIOD };
const run = (opts = {}) => manufacturingCbm(SNAP, TZ, { now: NOW, ...opts });
const row = (r, plant, category) => r.rows.find((x) => x.plantCode === plant && x.category === category);

test('category kind and 3rd-level label', () => {
  assert.equal(categoryKind('All / Finished Goods / Heaters'), 'finished');
  assert.equal(categoryKind('All / Finished Goods'), 'finished');
  assert.equal(categoryKind('All / Semi-Finished / Wood'), 'semi');
  assert.equal(categoryKind('All / Raw Materials'), 'other');
  assert.equal(categoryKind('All / Finished GoodsX'), 'other'); // must be a whole level
  assert.equal(categoryLabel('All / Finished Goods / Heaters / Towers', 'level3'), 'All / Finished Goods / Heaters');
  assert.equal(categoryLabel('All / Finished Goods / Heaters / Towers', 'full'), 'All / Finished Goods / Heaters / Towers');
});

test('category -> Excel group mapping (exact prefixes only, longest wins, else Unmapped)', () => {
  assert.equal(categoryGroup('All / Finished Goods / Heaters / Towers'), 'Heaters');
  assert.equal(categoryGroup('All / Finished Goods / Controls / Additionals'), 'Controls');
  assert.equal(categoryGroup('All / Finished Goods / Panels & Timbers / Cedar'), 'Panels/Timbers');
  assert.equal(categoryGroup('All / Finished Goods / Accessories / Doors & Handles / Glass Doors'), 'Unmapped'); // Doors not guessed
  assert.equal(categoryGroup('All / Finished Goods / Accessories / Controls'), 'Unmapped');
  assert.equal(categoryGroup('All / Finished Goods / HeatersX'), 'Unmapped');
  assert.equal(categoryGroup(null), 'Unmapped');
  const custom = [{ group: 'A', prefixes: ['X'] }, { group: 'B', prefixes: ['X / Y'] }];
  assert.equal(categoryGroup('X / Y / Z', custom), 'B');
});

test('finished goods only by default; semi-finished only with the toggle; other categories never', () => {
  const r = run();
  assert.equal(r.rows.some((x) => x.category.startsWith('All / Semi-Finished')), false);
  assert.equal(r.rows.some((x) => x.category.startsWith('All / Raw Materials')), false);
  assert.deepEqual(r.excluded, { semiFinished: 1, otherCategories: 1, notLinked: 0 });

  const withSemi = run({ includeSemiFinished: true });
  assert.equal(row(withSemi, 'PL1', 'All / Semi-Finished / Wood').plannedCbm, 2); // 20 x 0.1
  assert.equal(withSemi.excluded.otherCategories, 1);
});

test('planned, in production and produced CBM are separate; produced follows the period', () => {
  const month = run();
  const towers = row(month, 'PL3', 'All / Finished Goods / Heaters / Towers');
  assert.equal(towers.plannedCbm, 2); // open 4 x 0.5
  assert.equal(towers.inProductionCbm, 0.5); // producing 1 x 0.5
  assert.equal(towers.producedCbm, 3); // done 2 + 4 this month, x 0.5
  assert.equal(towers.producedMos, 2);
  assert.equal(row(run({ periodKey: 'week' }), 'PL3', 'All / Finished Goods / Heaters / Towers').producedCbm, 1);
  assert.equal(row(run({ periodKey: 'today' }), 'PL3', 'All / Finished Goods / Heaters / Towers').producedCbm, 1);
  assert.equal(month.totals.plannedCbm, 2.8); // 2 + 0.2 + 0.6 (no-volume and unit-mismatch MOs add 0)
  assert.equal(month.totals.openMos, 5);
  assert.equal(month.totals.lateMos, 1);
  assert.deepEqual(month.plants.map((p) => [p.plantCode, p.plannedCbm, p.producedCbm]), [['PL1', 0.6, 0], ['PL3', 2.2, 3]]);
});

test('3rd-level grouping merges sub-categories; group column is filled', () => {
  const r = run({ level: 'level3' });
  const heaters = row(r, 'PL3', 'All / Finished Goods / Heaters'); // Towers (MO 1) + Heaters (MO 7)
  assert.equal(heaters.openMos, 2);
  assert.equal(heaters.group, 'Heaters');
  assert.equal(row(r, 'PL1', 'All / Finished Goods / Accessories').group, 'Unmapped');
  assert.equal(row(r, 'PL1', 'All / Finished Goods / Sauna Rooms').group, 'Sauna Rooms');
});

test('missing volume: counted per row, in totals and in the product list', () => {
  const r = run();
  const sauna = row(r, 'PL1', 'All / Finished Goods / Sauna Rooms / Indoor');
  assert.equal(sauna.mosWithoutVolume, 2); // open MO 3 + done MO 23
  assert.equal(sauna.productsWithoutVolume, 1);
  assert.equal(sauna.plannedCbm, 0);
  assert.equal(r.totals.mosWithoutVolume, 2);
  assert.equal(r.totals.productsWithoutVolume, 1);
  assert.deepEqual(r.missingVolume, [
    { productId: 12, productName: 'TEST Product 12', category: 'All / Finished Goods / Sauna Rooms / Indoor', plantCode: 'PL1', mos: 2, quantityNotCounted: 4 },
  ]);
});

test('unit mismatch: MO counted, CBM skipped, warning counted (not as missing volume)', () => {
  const r = run();
  const heaters = row(r, 'PL3', 'All / Finished Goods / Heaters');
  assert.equal(heaters.openMos, 1);
  assert.equal(heaters.plannedCbm, 0);
  assert.equal(heaters.unitMismatch, 1);
  assert.equal(heaters.mosWithoutVolume, 0);
  assert.equal(r.totals.unitMismatchSkipped, 1);
});

test('linked to open sales orders only', () => {
  const r = run({ linkedOnly: true });
  assert.equal(r.totals.openMos, 1); // only MO 1 is linked
  assert.equal(r.totals.producedMos, 0);
  assert.equal(r.excluded.notLinked, 7); // 4 open (MOs 2, 3, 6, 7) + 3 done this month (21, 22, 23); semi/raw excluded earlier
});

test('missing-volume CSV has no money columns and escapes quotes', () => {
  const csv = missingVolumeCsv([{ productName: 'TEST "Bench"', category: 'All / X', plantCode: 'PL1', mos: 2, quantityNotCounted: 4 }]);
  assert.equal(csv, '"Product","Category","Plant","MOs","Quantity not counted"\r\n"TEST ""Bench""","All / X","PL1","2","4"\r\n');
});
