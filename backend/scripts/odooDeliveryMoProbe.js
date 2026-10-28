// READ-ONLY probe: which Odoo fields hold the sales "Delivery Date" and the Manufacturing Order state,
// and how are MOs linked to a sales order and its products?
// Run from the backend folder:  node scripts/odooDeliveryMoProbe.js [SO reference, default S09259]
import { getOdooConfig } from '../src/config/odoo.js';
import { OdooClient } from '../src/services/odooClient.js';

const section = (title) => console.log(`\n=== ${title} ===`);
const name = (m2o) => (Array.isArray(m2o) ? m2o[1] : '—');
const ref = process.argv[2] || 'S09259';

const { config, missing } = getOdooConfig();
if (missing.length > 0) {
  console.error('Missing .env settings:', missing.join(', '));
  process.exit(1);
}
const client = new OdooClient(config);
await client.authenticate();

section('1. sale.order date fields (label shown in Odoo)');
const soFields = await client.fieldsGet('sale.order', ['string', 'type', 'store']);
for (const key of ['commitment_date', 'expected_date', 'date_order', 'mrp_production_ids']) {
  const f = soFields[key];
  console.log(`  ${key.padEnd(22)} ${f ? `${f.type.padEnd(10)} stored=${f.store}  "${f.string}"` : '(missing)'}`);
}

section('2. mrp.production state values (label shown in Odoo)');
const moFields = await client.fieldsGet('mrp.production', ['string', 'type', 'selection']);
console.log(`  state: "${moFields.state.string}"`, JSON.stringify(moFields.state.selection));
for (const key of ['origin', 'sale_line_id', 'procurement_group_id']) {
  console.log(`  ${key.padEnd(22)} ${moFields[key] ? `${moFields[key].type}  "${moFields[key].string}"` : '(missing)'}`);
}

section(`3. ${ref}: delivery date and linked MOs`);
const [so] = await client.execute('sale.order', 'search_read', [[['name', '=', ref]]], {
  fields: ['name', 'commitment_date', 'expected_date', 'mrp_production_ids'],
});
if (!so) {
  console.log('  (order not found)');
  process.exit(0);
}
console.log(`  commitment_date (UTC) = ${so.commitment_date}   expected_date (UTC) = ${so.expected_date}`);
const lines = await client.execute('sale.order.line', 'search_read', [[['order_id', '=', so.id], ['display_type', '=', false]]], {
  fields: ['product_id', 'product_uom_qty'],
});
console.log('  Lines:');
for (const l of lines) console.log(`    product ${l.product_id?.[0]}  ${name(l.product_id)}  qty ${l.product_uom_qty}`);
const linked = so.mrp_production_ids.length
  ? await client.execute('mrp.production', 'read', [so.mrp_production_ids], { fields: ['name', 'product_id', 'state', 'origin'] })
  : [];
console.log(`  Linked MOs (mrp_production_ids): ${linked.length}`);
for (const mo of linked) {
  console.log(`    ${mo.name.padEnd(16)} ${mo.state.padEnd(10)} product ${mo.product_id?.[0]}  ${name(mo.product_id)}  | origin: ${mo.origin}`);
}

section(`4. MOs whose Source (origin) contains "${ref.replace(/^S0*/, '')}" (what the Odoo screenshot searched)`);
const byOrigin = await client.execute('mrp.production', 'search_read', [[['origin', 'ilike', ref.replace(/^S0*/, '')]]], {
  fields: ['name', 'product_id', 'state', 'origin'],
});
const linkedIds = new Set(so.mrp_production_ids);
for (const mo of byOrigin) {
  console.log(`    ${linkedIds.has(mo.id) ? 'LINKED ' : 'other  '} ${mo.name.padEnd(16)} ${mo.state.padEnd(10)} ${name(mo.product_id)} | ${mo.origin}`);
}
