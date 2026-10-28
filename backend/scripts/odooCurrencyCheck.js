import { getOdooConfig } from '../src/config/odoo.js';
import { OdooClient } from '../src/services/odooClient.js';

const section = (title) => console.log(`\n=== ${title} ===`);

// Runs one check; if it fails, prints why and moves on to the next one.
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

let hasCurrencyRate = false;

section('1. Do the currency fields exist on sale.order?');
await attempt('field check', async () => {
  const fields = await client.fieldsGet('sale.order', ['string', 'type']);
  for (const f of ['currency_id', 'currency_rate', 'company_id']) {
    console.log(fields[f] ? `  OK       ${f}  (${fields[f].type})` : `  MISSING  ${f}`);
  }
  hasCurrencyRate = Boolean(fields.currency_rate);
});

section('2. Company currency');
await attempt('company read', async () => {
  const companies = await client.searchRead('res.company', [], { fields: ['name', 'currency_id'] });
  for (const c of companies) console.log(`  ${c.name}: ${c.currency_id?.[1]}`);
});

section('3. Confirmed orders (state = sale) grouped by currency');
await attempt('grouping', async () => {
  const groups = await client.execute(
    'sale.order',
    'read_group',
    [[['state', '=', 'sale']], ['amount_total:sum'], ['currency_id']],
    { lazy: false }
  );
  for (const g of groups) {
    console.log(`  ${g.currency_id?.[1]}: ${g.__count ?? g.currency_id_count} orders, total ${g.amount_total}`);
  }
});

section('4. Sample orders with exchange rate');
if (hasCurrencyRate) {
  await attempt('sample read', async () => {
    const orders = await client.searchRead('sale.order', [['state', '=', 'sale']], {
      fields: ['name', 'date_order', 'currency_id', 'amount_total', 'currency_rate'],
      limit: 5,
      order: 'date_order desc',
    });
    for (const o of orders) {
      console.log(`  ${o.name} | ${o.date_order} | ${o.amount_total} ${o.currency_id?.[1]} | rate: ${o.currency_rate}`);
    }
  });
} else {
  console.log('  Skipped: currency_rate field not available.');
}

console.log('\nDone. No data was modified.');