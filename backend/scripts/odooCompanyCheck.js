import { getOdooConfig } from '../src/config/odoo.js';
import { OdooClient } from '../src/services/odooClient.js';

const section = (title) => console.log(`\n=== ${title} ===`);

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
const uid = await client.authenticate();

let allowedIds = [];

section('1. Companies this Odoo user can access');
await attempt('user read', async () => {
  const [me] = await client.execute('res.users', 'read', [[uid]], {
    fields: ['company_id', 'company_ids'],
  });
  console.log(`  Default company: ${me.company_id?.[1]}`);
  allowedIds = me.company_ids || [];
  const companies = await client.execute('res.company', 'read', [allowedIds], {
    fields: ['name', 'currency_id'],
  });
  for (const c of companies) console.log(`  - [${c.id}] ${c.name} (${c.currency_id?.[1]})`);
});

section('2. Confirmed orders per company (default view)');
await attempt('default grouping', async () => {
  const groups = await client.execute(
    'sale.order',
    'read_group',
    [[['state', '=', 'sale']], ['amount_total:sum'], ['company_id']],
    { lazy: false }
  );
  for (const g of groups) console.log(`  ${g.company_id?.[1]}: ${g.__count} orders`);
  const total = await client.searchCount('sale.order', []);
  console.log(`  All orders (any status), default view: ${total}`);
});

section('3. Same check, asking for ALL accessible companies');
await attempt('all-company grouping', async () => {
  const context = { allowed_company_ids: allowedIds };
  const groups = await client.execute(
    'sale.order',
    'read_group',
    [[['state', '=', 'sale']], ['amount_total:sum'], ['company_id']],
    { lazy: false, context }
  );
  for (const g of groups) console.log(`  ${g.company_id?.[1]}: ${g.__count} orders`);
  const total = await client.execute('sale.order', 'search_count', [[]], { context });
  console.log(`  All orders (any status), all companies: ${total}`);
});

console.log('\nDone. No data was modified.');