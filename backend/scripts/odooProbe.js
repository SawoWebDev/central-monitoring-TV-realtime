import { getOdooConfig } from '../src/config/odoo.js';
import { OdooClient } from '../src/services/odooClient.js';

const section = (title) => console.log(`\n=== ${title} ===`);

// Development-only switch. Default is OFF: a writable account stops the probe.
const allowWritable = process.env.ALLOW_WRITABLE_ACCOUNT === 'true';

try {
  const { config, missing } = getOdooConfig();
  const client = new OdooClient(config);

  // 1. Version (no login needed)
  section('1. Server version');
  const v = await client.version();
  console.log('server_version:', v.server_version);

  if (missing.length > 0) {
    console.log(`\nStopping here: these settings are empty in your .env file: ${missing.join(', ')}`);
    console.log('Fill them in (read-only user + API key), then run this script again.');
    process.exit(0);
  }

  // 2. Authentication
  section('2. Authentication');
  const uid = await client.authenticate();
  console.log(`Authenticated OK. Odoo user id: ${uid}`);

  // 3. Prove the account is read-only (we ASK Odoo, we do not try to write)
  section('3. Permission check (asking Odoo what this user is allowed to do)');
  const models = ['sale.order', 'sale.order.line', 'res.partner', 'product.product'];
  const rows = [];
  let canModify = false;
  for (const model of models) {
    const row = { model };
    for (const op of ['read', 'create', 'write', 'unlink']) {
      row[op] = await client.canDo(model, op);
      if (op !== 'read' && row[op] === true) canModify = true;
    }
    rows.push(row);
  }
  console.table(rows);

  if (canModify) {
    if (!allowWritable) {
      console.error(
        '\nSTOPPED: this Odoo user CAN modify data. Do NOT use it for Central Monitoring.\n' +
          'Ask your Odoo admin for a user whose access rules only have the Read box ticked.\n' +
          '(Development only: set ALLOW_WRITABLE_ACCOUNT=true in .env to continue anyway.)'
      );
      process.exit(1);
    }
    console.warn(
      '\nWARNING: this account CAN modify Odoo data. Continuing only because ALLOW_WRITABLE_ACCOUNT=true.\n' +
        'Central Monitoring code never sends write calls, but replace this account with a read-only one\n' +
        'before real deployment.'
    );
  } else {
    console.log('Good: read is allowed, create/write/unlink are all refused.');
  }

  // 4. Which fields exist on sale.order and sale.order.line?
  section('4. Field inspection');
  const wanted = {
    'sale.order': [
      'name', 'date_order', 'partner_id', 'user_id', 'team_id',
      'amount_untaxed', 'amount_tax', 'amount_total', 'currency_id', 'state', 'order_line',
    ],
    'sale.order.line': [
      'order_id', 'product_id', 'name', 'product_uom_qty',
      'price_unit', 'price_subtotal', 'price_total', 'state',
    ],
  };
  for (const [model, names] of Object.entries(wanted)) {
    const fields = await client.fieldsGet(model, ['string', 'type', 'selection']);
    console.log(`\n${model}:`);
    for (const f of names) {
      console.log(fields[f] ? `  OK       ${f}  (${fields[f].type})` : `  MISSING  ${f}`);
    }
    if (model === 'sale.order' && fields.state?.selection) {
      console.log('  Status values:', JSON.stringify(fields.state.selection));
    }
  }

  // 5. Count orders
  section('5. Sales order counts');
  console.log('Total sale.order records:', await client.searchCount('sale.order', []));
  for (const state of ['draft', 'sent', 'sale', 'done', 'cancel']) {
    const n = await client.searchCount('sale.order', [['state', '=', state]]);
    console.log(`  state=${state}: ${n}`);
  }

  // 6. Read a few orders
  section('6. Three most recent orders');
  const orders = await client.searchRead('sale.order', [], {
    fields: ['name', 'date_order', 'partner_id', 'user_id', 'amount_total', 'currency_id', 'state'],
    limit: 3,
    order: 'date_order desc',
  });
  for (const o of orders) {
    console.log(
      `${o.name} | ${o.date_order} | ${o.partner_id?.[1]} | salesperson: ${o.user_id?.[1] ?? '-'} | ` +
        `${o.amount_total} ${o.currency_id?.[1]} | ${o.state}`
    );
  }

  console.log('\nProbe finished. No data was modified.');
} catch (err) {
  console.error('\nProbe failed:', err.message);
  process.exit(1);
}