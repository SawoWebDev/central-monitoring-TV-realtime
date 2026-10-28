// READ-ONLY probe: what manufacturing and shipping data does our Odoo have?
// Answers the client's status-report questions (lead time, shipped per plant/warehouse,
// SO per shipment, MO status). Uses only read methods through the allow-listed OdooClient.
// Run from the backend folder:  node scripts/odooOperationsProbe.js
import { getOdooConfig } from '../src/config/odoo.js';
import { OdooClient } from '../src/services/odooClient.js';

const section = (title) => console.log(`\n=== ${title} ===`);
const name = (m2o) => (Array.isArray(m2o) ? m2o[1] : '—');

async function attempt(label, fn) {
  try {
    await fn();
  } catch (err) {
    console.log(`  (${label} failed: ${err.message})`);
  }
}

const { config, missing } = getOdooConfig();
if (missing.length > 0) {
  console.error('Missing .env settings:', missing.join(', '));
  process.exit(1);
}
const client = new OdooClient(config);
await client.authenticate();

// Which of these candidate fields exist on a model? Prints name, type and label.
async function showFields(model, candidates) {
  const all = await client.fieldsGet(model, ['string', 'type', 'relation']);
  const found = candidates.filter((f) => all[f]);
  const notFound = candidates.filter((f) => !all[f]);
  for (const f of found) {
    const rel = all[f].relation ? ` -> ${all[f].relation}` : '';
    console.log(`  ${f.padEnd(26)} ${all[f].type.padEnd(10)} "${all[f].string}"${rel}`);
  }
  if (notFound.length) console.log(`  (not present: ${notFound.join(', ')})`);
  return new Set(found);
}

async function countBy(model, domain, groupField) {
  const groups = await client.execute(model, 'read_group', [domain, [groupField], [groupField]], { lazy: false });
  for (const g of groups) {
    const key = Array.isArray(g[groupField]) ? g[groupField][1] : g[groupField];
    console.log(`  ${String(key ?? '(empty)').padEnd(40)} ${g.__count}`);
  }
}

// 1. Can we read each model, and how many records are there?
section('1. Access and record counts');
const models = [
  'mrp.production', 'mrp.workorder', 'mrp.workcenter',
  'stock.picking', 'stock.picking.type', 'stock.move', 'stock.warehouse', 'stock.location',
];
const readable = new Set();
for (const model of models) {
  await attempt(model, async () => {
    const canRead = await client.canDo(model, 'read');
    const count = canRead ? await client.searchCount(model, []) : '-';
    if (canRead) readable.add(model);
    console.log(`  ${model.padEnd(20)} read=${canRead}  records=${count}`);
  });
}

// 2. Plants = warehouses
section('2. Warehouses ("plants")');
await attempt('warehouses', async () => {
  const rows = await client.searchRead('stock.warehouse', [], { fields: ['name', 'code', 'company_id'] });
  for (const w of rows) console.log(`  [${w.id}] ${w.code}  ${w.name}  (${name(w.company_id)})`);
});

// 3. Operation types (receipts / deliveries / manufacturing per warehouse)
section('3. Operation types');
await attempt('picking types', async () => {
  const rows = await client.searchRead('stock.picking.type', [], {
    fields: ['name', 'code', 'warehouse_id', 'active'],
  });
  for (const t of rows) console.log(`  [${t.id}] ${String(t.code).padEnd(15)} ${t.name.padEnd(30)} ${name(t.warehouse_id)}`);
});

// 4. Transfers (stock.picking): fields and counts
section('4. stock.picking: useful fields');
await attempt('picking fields', () =>
  showFields('stock.picking', [
    'name', 'state', 'picking_type_id', 'picking_type_code', 'origin', 'sale_id', 'partner_id',
    'scheduled_date', 'date_deadline', 'date_done', 'location_id', 'location_dest_id', 'company_id',
  ])
);
section('4b. Deliveries (outgoing) by status');
await attempt('outgoing by state', () => countBy('stock.picking', [['picking_type_code', '=', 'outgoing']], 'state'));
section('4c. Deliveries (outgoing) by operation type');
await attempt('outgoing by type', () => countBy('stock.picking', [['picking_type_code', '=', 'outgoing']], 'picking_type_id'));

// 5. Stock moves: shipped quantity
section('5. stock.move: useful fields');
await attempt('move fields', () =>
  showFields('stock.move', [
    'product_id', 'product_uom_qty', 'quantity', 'quantity_done', 'product_uom', 'state', 'picking_id',
    'picking_type_id', 'warehouse_id', 'sale_line_id', 'production_id', 'raw_material_production_id',
    'date', 'date_deadline', 'location_id', 'location_dest_id',
  ])
);
section('5b. Done outgoing moves by operation type (count)');
await attempt('done outgoing moves', () =>
  countBy('stock.move', [['state', '=', 'done'], ['picking_code', '=', 'outgoing']], 'picking_type_id')
);

// 6. Manufacturing orders
section('6. mrp.production: useful fields');
await attempt('MO fields', () =>
  showFields('mrp.production', [
    'name', 'state', 'product_id', 'product_qty', 'qty_producing', 'qty_produced', 'product_uom_id',
    'date_start', 'date_finished', 'date_deadline', 'origin', 'picking_type_id', 'location_dest_id',
    'company_id', 'user_id', 'workorder_ids', 'components_availability', 'reservation_state',
    'priority', 'procurement_group_id', 'sale_order_count',
  ])
);
section('6b. Manufacturing orders by status');
await attempt('MO by state', () => countBy('mrp.production', [], 'state'));
section('6c. Manufacturing orders by operation type (plant)');
await attempt('MO by type', () => countBy('mrp.production', [], 'picking_type_id'));
section('6d. How many MOs have an origin that looks like a sales order (S0...)');
await attempt('MO origin', async () => {
  const total = await client.searchCount('mrp.production', []);
  const fromSo = await client.searchCount('mrp.production', [['origin', '=like', 'S%']]);
  console.log(`  ${fromSo} of ${total} MOs have an origin starting with "S"`);
});

// 7. Work orders
section('7. mrp.workorder: fields and status');
await attempt('WO fields', () =>
  showFields('mrp.workorder', [
    'name', 'state', 'production_id', 'workcenter_id', 'duration_expected', 'duration',
    'date_start', 'date_finished', 'qty_produced', 'qty_production',
  ])
);
await attempt('WO by state', () => countBy('mrp.workorder', [], 'state'));
section('7b. Work centers');
await attempt('work centers', async () => {
  const rows = await client.searchRead('mrp.workcenter', [], { fields: ['name', 'company_id'] });
  for (const w of rows) console.log(`  [${w.id}] ${w.name}`);
});

// 8. Links and dates on sales orders (for lead time and "SO per shipment")
section('8. sale.order: delivery / manufacturing link and date fields');
await attempt('SO fields', () =>
  showFields('sale.order', [
    'picking_ids', 'delivery_count', 'mrp_production_count', 'mrp_production_ids', 'procurement_group_id',
    'commitment_date', 'expected_date', 'effective_date', 'delivery_status', 'warehouse_id',
  ])
);
section('8b. Confirmed sales orders by delivery status');
await attempt('SO delivery status', () => countBy('sale.order', [['state', '=', 'sale']], 'delivery_status'));
section('8c. Confirmed sales orders by warehouse');
await attempt('SO by warehouse', () => countBy('sale.order', [['state', '=', 'sale']], 'warehouse_id'));

// 9. Small samples so we can see real values (names only, no amounts)
section('9. Sample: 3 most recent manufacturing orders');
await attempt('MO sample', async () => {
  const rows = await client.searchRead('mrp.production', [], {
    fields: ['name', 'state', 'origin', 'product_qty', 'qty_producing', 'date_start', 'date_finished', 'date_deadline', 'picking_type_id'],
    limit: 3,
    order: 'id desc',
  });
  for (const r of rows) {
    console.log(`  ${r.name} | ${r.state} | origin=${r.origin || '—'} | qty ${r.qty_producing}/${r.product_qty} | start=${r.date_start || '—'} | finished=${r.date_finished || '—'} | deadline=${r.date_deadline || '—'} | ${name(r.picking_type_id)}`);
  }
});
section('9b. Sample: 3 most recent done deliveries');
await attempt('delivery sample', async () => {
  const rows = await client.searchRead('stock.picking', [['picking_type_code', '=', 'outgoing'], ['state', '=', 'done']], {
    fields: ['name', 'origin', 'scheduled_date', 'date_done', 'picking_type_id'],
    limit: 3,
    order: 'date_done desc',
  });
  for (const r of rows) {
    console.log(`  ${r.name} | origin=${r.origin || '—'} | scheduled=${r.scheduled_date} | done=${r.date_done} | ${name(r.picking_type_id)}`);
  }
});

console.log('\nDone. Only read methods were used; no data was modified.');
