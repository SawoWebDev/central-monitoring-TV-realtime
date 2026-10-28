import { getOdooConfig } from '../config/odoo.js';
import { OdooClient } from './odooClient.js';
import { m2oId, m2oName, odooDateToIso } from '../utils/odooHelpers.js';
import { appConfig } from '../config/app.js';
import { customerScopeDomain } from '../utils/customerScope.js';

const { config, missing } = getOdooConfig();
let client = null;
let baseInfo = null; // company name + currency, read once

// Odoo status -> our own status names
const STATUS_MAP = {
  draft: 'quotation',
  sent: 'quotation_sent',
  sale: 'confirmed',
  done: 'confirmed',
  cancel: 'cancelled',
};

const ORDER_FIELDS = [
  'name', 'date_order', 'partner_id', 'user_id', 'team_id',
  'amount_untaxed', 'amount_tax', 'amount_total',
  'currency_id', 'currency_rate', 'state',
  // For the order-status panels (verified with fields_get 2026-10-19; all stored fields)
  'commitment_date', 'validity_date', 'delivery_status',
];

const LINE_FIELDS = [
  'order_id', 'product_id', 'name', 'product_uom_qty',
  'price_unit', 'price_subtotal', 'price_total',
];

export function getClient() {
  if (missing.length > 0) {
    throw new Error(`Odoo settings missing in .env: ${missing.join(', ')}`);
  }
  if (!client) client = new OdooClient(config);
  return client;
}

// Reads every record, 1000 at a time, so one huge request never overloads Odoo.
export async function fetchAll(odoo, model, domain, fields, pageSize = 1000) {
  const rows = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await odoo.searchRead(model, domain, {
      fields,
      limit: pageSize,
      offset,
      order: 'id asc',
    });
    rows.push(...page);
    if (page.length < pageSize) break;
  }
  return rows;
}

// The company the API user belongs to, and that company's currency (our reporting currency).
async function fetchBaseInfo(odoo) {
  if (baseInfo) return baseInfo;
  if (!odoo.uid) await odoo.authenticate();
  const [me] = await odoo.execute('res.users', 'read', [[odoo.uid]], { fields: ['company_id'] });
  const [company] = await odoo.execute('res.company', 'read', [[m2oId(me.company_id)]], {
    fields: ['name', 'currency_id', 'partner_id'],
  });
  baseInfo = { companyName: company.name, baseCurrency: m2oName(company.currency_id), partnerId: m2oId(company.partner_id) };
  return baseInfo;
}

// Odoo domain that keeps only the orders of the configured customer scope (empty = no filter).
// "field" is the path to the customer partner, e.g. "partner_id" or "sale_id.partner_id".
export async function scopeDomain(odoo, field = 'partner_id') {
  if (appConfig.customerScope === 'all') return [];
  const { partnerId } = await fetchBaseInfo(odoo);
  return customerScopeDomain(appConfig.customerScope, partnerId, field);
}

function normalizeOrder(o, baseCurrency) {
  const currency = m2oName(o.currency_id);
  const rate = Number(o.currency_rate) > 0 ? Number(o.currency_rate) : null;

  // Amount converted to the company (reporting) currency.
  let amountTotalBase = null;
  if (currency === baseCurrency) amountTotalBase = o.amount_total;
  else if (rate) amountTotalBase = o.amount_total / rate;

  return {
    id: o.id,
    reference: o.name,
    orderDate: odooDateToIso(o.date_order),
    customerId: m2oId(o.partner_id),
    customerName: m2oName(o.partner_id) || 'Unknown customer',
    salespersonId: m2oId(o.user_id),
    salespersonName: m2oName(o.user_id) || 'Unassigned',
    teamName: m2oName(o.team_id),
    status: STATUS_MAP[o.state] || 'other',
    odooState: o.state,
    currency,
    currencyRate: rate,
    amountUntaxed: o.amount_untaxed,
    amountTax: o.amount_tax,
    amountTotal: o.amount_total,
    amountTotalBase,
    // Promised delivery date ("Delivery Date" in Odoo), a datetime in UTC
    commitmentDate: odooDateToIso(o.commitment_date),
    // Quotation expiry date: a plain date ("YYYY-MM-DD"), no timezone
    validityDate: typeof o.validity_date === 'string' ? o.validity_date : null,
    // pending | started | partial | full, or null (e.g. nothing to deliver)
    deliveryStatus: o.delivery_status || null,
  };
}

function normalizeLine(l) {
  return {
    id: l.id,
    orderId: m2oId(l.order_id),
    productId: m2oId(l.product_id),
    productName: m2oName(l.product_id) || l.name || 'Unknown product',
    quantity: l.product_uom_qty,
    unitPrice: l.price_unit,
    subtotal: l.price_subtotal, // in the ORDER's currency
    total: l.price_total,
  };
}

// Reads everything we need from Odoo (read-only) and returns clean data.
export async function fetchSalesData() {
  const odoo = getClient();
  const { companyName, baseCurrency } = await fetchBaseInfo(odoo);

  const rawOrders = await fetchAll(odoo, 'sale.order', await scopeDomain(odoo), ORDER_FIELDS);
  // display_type = false skips section/note rows that are not real product lines
  let rawLines = await fetchAll(odoo, 'sale.order.line', [['display_type', '=', false]], LINE_FIELDS);
  if (appConfig.customerScope !== 'all') {
    const ids = new Set(rawOrders.map((o) => o.id));
    rawLines = rawLines.filter((l) => ids.has(m2oId(l.order_id)));
  }

  return {
    companyName,
    baseCurrency,
    orders: rawOrders.map((o) => normalizeOrder(o, baseCurrency)),
    lines: rawLines.map(normalizeLine),
  };
}