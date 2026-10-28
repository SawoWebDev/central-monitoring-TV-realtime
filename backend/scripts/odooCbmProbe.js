// READ-ONLY probe: can we calculate CBM (cubic meters) shipped per plant?
// 1. Finds every field whose name or label mentions volume / CBM / cubic on the relevant models.
// 2. Checks how many shipped products actually have a volume filled in (coverage).
// Run from the backend folder:  node scripts/odooCbmProbe.js
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

// 1. Volume-related fields (standard and custom "x_" fields)
const MATCH = /volume|cbm|cubic|m3|dimension|length|width|height/i;
for (const model of ['product.template', 'product.product', 'stock.picking', 'stock.move', 'sale.order', 'sale.order.line']) {
  section(`1. ${model}: volume-related fields`);
  await attempt(model, async () => {
    const fields = await client.fieldsGet(model, ['string', 'type', 'store']);
    const hits = Object.entries(fields).filter(([key, f]) => MATCH.test(key) || MATCH.test(f.string));
    if (hits.length === 0) console.log('  (none)');
    for (const [key, f] of hits) {
      console.log(`  ${key.padEnd(32)} ${f.type.padEnd(10)} stored=${f.store}  "${f.string}"`);
    }
  });
}

// 2. Coverage: products shipped (done deliveries) in the last 90 days, and how many have a volume
section('2. Products shipped in the last 90 days: is a volume filled in?');
await attempt('coverage', async () => {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
  const domain = [['state', '=', 'done'], ['picking_code', '=', 'outgoing'], ['date', '>=', since]];
  const groups = await client.execute('stock.move', 'read_group', [domain, ['quantity:sum'], ['product_id']], { lazy: false });
  const productIds = groups.map((g) => g.product_id?.[0]).filter(Boolean);
  const products = productIds.length
    ? await client.execute('product.product', 'read', [productIds], { fields: ['volume', 'volume_uom_name', 'uom_id'] })
    : [];
  const byId = new Map(products.map((p) => [p.id, p]));

  let moves = 0, movesWithVolume = 0, withVolume = 0, cbm = 0;
  const uoms = new Set();
  for (const g of groups) {
    const p = byId.get(g.product_id?.[0]);
    moves += g.__count;
    if (p?.volume > 0) {
      withVolume += 1;
      movesWithVolume += g.__count;
      cbm += g.quantity * p.volume;
      uoms.add(p.volume_uom_name);
    }
  }
  console.log(`  Shipped since ${since} UTC: ${groups.length} different products in ${moves} delivery lines`);
  console.log(`  Products WITH a volume: ${withVolume} of ${groups.length} (covering ${movesWithVolume} of ${moves} lines)`);
  console.log(`  Volume unit(s) used: ${[...uoms].join(', ') || '—'}`);
  console.log(`  Rough total (quantity x product volume), products with volume only: ${cbm.toFixed(2)}`);
});

// 3. The same rough total split per plant (delivery operation type)
section('3. Rough CBM shipped per plant, last 90 days (products with volume only)');
await attempt('per plant', async () => {
  const since = new Date(Date.now() - 90 * 86_400_000).toISOString().slice(0, 19).replace('T', ' ');
  const domain = [['state', '=', 'done'], ['picking_code', '=', 'outgoing'], ['date', '>=', since]];
  const groups = await client.execute(
    'stock.move', 'read_group', [domain, ['quantity:sum'], ['picking_type_id', 'product_id']], { lazy: false }
  );
  const ids = [...new Set(groups.map((g) => g.product_id?.[0]).filter(Boolean))];
  const products = ids.length ? await client.execute('product.product', 'read', [ids], { fields: ['volume'] }) : [];
  const vol = new Map(products.map((p) => [p.id, p.volume || 0]));
  const perPlant = new Map();
  for (const g of groups) {
    const plant = name(g.picking_type_id);
    const row = perPlant.get(plant) ?? { qty: 0, cbm: 0, missing: 0 };
    row.qty += g.quantity;
    const v = vol.get(g.product_id?.[0]) || 0;
    if (v > 0) row.cbm += g.quantity * v;
    else row.missing += g.quantity;
    perPlant.set(plant, row);
  }
  for (const [plant, r] of perPlant) {
    console.log(`  ${plant.padEnd(28)} qty shipped=${r.qty.toFixed(0).padStart(8)}  CBM=${r.cbm.toFixed(2).padStart(10)}  qty without volume=${r.missing.toFixed(0)}`);
  }
});

// 4. The "Total CBM" fields on sales orders: how often are they filled, and do they agree?
section('4. sale.order "Total CBM" fields (confirmed orders)');
await attempt('SO CBM fields', async () => {
  const confirmed = [['state', '=', 'sale']];
  const total = await client.searchCount('sale.order', confirmed);
  for (const field of ['x_studio_total_cbm', 'x_studio_total_cbm_1']) {
    const filled = await client.searchCount('sale.order', [...confirmed, [field, '>', 0]]);
    console.log(`  ${field.padEnd(22)} filled (> 0) on ${filled} of ${total} confirmed orders`);
  }
  const rows = await client.searchRead('sale.order', confirmed, {
    fields: ['name', 'warehouse_id', 'delivery_status', 'total_cbm', 'x_studio_total_cbm', 'x_studio_total_cbm_1'],
    limit: 8,
    order: 'id desc',
  });
  console.log('  Latest confirmed orders: name | warehouse | delivery | total_cbm | x_studio_total_cbm | x_studio_total_cbm_1');
  for (const r of rows) {
    console.log(`  ${r.name} | ${name(r.warehouse_id)} | ${r.delivery_status} | ${r.total_cbm} | ${r.x_studio_total_cbm} | ${r.x_studio_total_cbm_1}`);
  }
});

console.log('\nDone. Only read methods were used; no data was modified.');
