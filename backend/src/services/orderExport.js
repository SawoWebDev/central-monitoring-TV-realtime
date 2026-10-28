import { createXlsx } from '../utils/xlsxWriter.js';
import { m2oId, m2oName } from '../utils/odooHelpers.js';

// Excel export of ONE open sales order, laid out like the client's reference file "SO 9259.xlsx":
//   sheet "SO Overview"      Field | Value   (SO Number, Status, Order Date, Customer, Delivery Address,
//                                              Pricelist, Payment Terms, Total Amount)
//   sheet "Delivery Address" Field | Value   (Name, Street, City, Country, Email, Internal Note)
//   sheet "Order Lines"      # | Product Reference | Product Name | Qty | Total CBM, blank row, TOTAL row
//   sheet "Log Messages"     Date | Author | Type | Message | Attachments   (the order's chatter, oldest first)
// Notes (agreed with the developer 2026-10-21):
//   - Money (Pricelist, Payment Terms, Total Amount in the ORDER'S OWN currency, not converted) is in this file
//     only, as in the reference. The dashboard table still shows no money.
//   - Log Messages come from Odoo's mail.message model, added to the read-only allow-list for this (read only, one
//     order at a time). "Attachments" is a count: Odoo gives ids only, and ir.attachment is not on the allow-list.
// The file is built here, from a read-only read of this one order. Nothing is written to Odoo.

const round = (n, d = 10) => Math.round(n * 10 ** d) / 10 ** d;

// Reads the order, its delivery address and its product lines (read-only). `odoo` is the allow-listed client.
export async function fetchOrderExportData(odoo, orderId) {
  const [order] = await odoo.execute('sale.order', 'read', [[orderId]], {
    fields: ['name', 'state', 'date_order', 'partner_id', 'partner_shipping_id', 'total_cbm', 'pricelist_id', 'payment_term_id', 'amount_total'],
  });
  if (!order) return null;

  const shipToId = m2oId(order.partner_shipping_id);
  const [shipTo] = shipToId
    ? await odoo.execute('res.partner', 'read', [[shipToId]], { fields: ['name', 'street', 'city', 'country_id', 'email', 'comment'] })
    : [];

  const lines = await odoo.searchRead('sale.order.line', [['order_id', '=', orderId], ['display_type', '=', false]], {
    fields: ['product_id', 'name', 'product_uom_qty', 'total_product_cbm'],
    order: 'sequence, id',
  });
  const productIds = [...new Set(lines.map((l) => m2oId(l.product_id)).filter(Boolean))];
  const products = productIds.length
    ? await odoo.execute('product.product', 'read', [productIds], { fields: ['default_code', 'name'] })
    : [];
  const productOf = new Map(products.map((p) => [p.id, p]));

  // The order's chatter (Odoo "Log Messages"), oldest first. Only this one order's messages are read.
  const messages = await odoo.searchRead('mail.message', [['model', '=', 'sale.order'], ['res_id', '=', orderId]], {
    fields: ['date', 'author_id', 'message_type', 'body', 'attachment_ids'],
    order: 'date asc, id asc',
  });

  return {
    reference: order.name,
    messages: messages.map((m) => ({
      date: m.date || '', // Odoo's own value, UTC
      author: m2oName(m.author_id) || '',
      type: m.message_type || '',
      text: htmlToText(m.body),
      attachments: (m.attachment_ids ?? []).length, // Odoo gives ids only; the file names are not readable here
    })),
    totalCbm: Number(order.total_cbm) || 0, // Odoo's order total (the "Order CBM" of the dashboard)
    state: order.state,
    orderDate: order.date_order || '', // Odoo's own value, UTC, "YYYY-MM-DD HH:MM:SS" (as in the reference file)
    customer: m2oName(order.partner_id) || '',
    deliveryAddress: m2oName(order.partner_shipping_id) || '',
    pricelist: m2oName(order.pricelist_id) || '',
    paymentTerms: m2oName(order.payment_term_id) || '',
    totalAmount: Number(order.amount_total) || 0, // order currency
    shipTo: shipTo
      ? {
          name: shipTo.name || '',
          street: shipTo.street || '',
          city: shipTo.city || '',
          country: m2oName(shipTo.country_id) || '',
          email: shipTo.email || '',
          note: shipTo.comment || '',
        }
      : null,
    lines: lines.map((l) => {
      const p = productOf.get(m2oId(l.product_id));
      return {
        reference: p?.default_code || '',
        name: p?.name || l.name || '',
        qty: Number(l.product_uom_qty) || 0,
        cbm: round(Number(l.total_product_cbm) || 0),
      };
    }),
  };
}

const header = (...labels) => labels.map((v) => ({ v, style: 'header' }));
const field = (label, value) => [{ v: label, style: 'bold' }, value];

// Column width: the reference file's width, widened when this order's text is longer (so nothing is cut off).
const fit = (min, values) => Math.max(min, ...values.map((v) => String(v ?? '').length * 0.88 - 0.5));

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

// Odoo message bodies are HTML ("<p>Sales Order created</p>", mentions as links, <br> for line breaks).
// Plain text for the cell: line breaks become \r\n (blank lines collapse, as in the reference), tags are removed.
export function htmlToText(html) {
  if (!html) return '';
  return String(html)
    .replace(/<br\s*\/?>(\s*<br\s*\/?>)*/gi, '\r\n')
    .replace(/<\/(p|div|li|tr|h[1-6])>/gi, '\r\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (all, e) => {
      if (e[0] !== '#') return ENTITIES[e.toLowerCase()] ?? all;
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : all;
    })
    .replace(/(\r\n\s*)+(?=\r\n)/g, '')
    .trim();
}

export function buildOrderSheets(d) {
  const a = d.shipTo ?? { name: '', street: '', city: '', country: '', email: '', note: '' };
  const overview = [
    header('Field', 'Value'),
    field('SO Number', d.reference),
    field('Status', d.state),
    field('Order Date', d.orderDate),
    field('Customer', d.customer),
    field('Delivery Address', d.deliveryAddress),
    field('Pricelist', d.pricelist),
    field('Payment Terms', d.paymentTerms),
    field('Total Amount', d.totalAmount),
  ];
  const address = [
    header('Field', 'Value'),
    field('Name', a.name),
    field('Street', a.street),
    field('City', a.city),
    field('Country', a.country),
    field('Email', a.email),
    field('Internal Note', a.note),
  ];
  const lineRows = d.lines.map((l, i) => [i + 1, l.reference, l.name, l.qty, l.cbm]);
  const totalQty = round(d.lines.reduce((s, l) => s + l.qty, 0));
  // Odoo's order total, rounded to 4 decimals like the reference file (0.07156 shows as 0.0716)
  const totalCbm = round(d.totalCbm ?? d.lines.reduce((s, l) => s + l.cbm, 0), 4);
  const lines = [
    header('#', 'Product Reference', 'Product Name', 'Qty', 'Total CBM'),
    ...lineRows,
    [],
    [null, null, { v: 'TOTAL', style: 'bold' }, { v: totalQty, style: 'bold' }, { v: totalCbm, style: 'bold' }],
  ];
  const log = [
    header('Date', 'Author', 'Type', 'Message', 'Attachments'),
    ...d.messages.map((m) => [m.date, m.author, m.type, m.text, m.attachments || null]),
  ];
  return [
    { name: 'SO Overview', widths: [22, fit(60, [d.reference, d.customer, d.deliveryAddress, d.pricelist, d.paymentTerms])], rows: overview },
    { name: 'Delivery Address', widths: [12.140625, fit(28.7109375, Object.values(a))], rows: address },
    {
      name: 'Order Lines',
      widths: [
        fit(2, [d.lines.length]),
        fit(16.7109375, d.lines.map((l) => l.reference)),
        fit(67.42578125, d.lines.map((l) => l.name)),
        fit(4, [totalQty, ...d.lines.map((l) => l.qty)]),
        fit(9.7109375, [totalCbm]),
      ],
      rows: lines,
    },
    {
      name: 'Log Messages',
      widths: [
        fit(18.140625, d.messages.map((m) => m.date)),
        fit(19.7109375, d.messages.map((m) => m.author)),
        fit(10.42578125, d.messages.map((m) => m.type)),
        fit(102.5703125, d.messages.map((m) => m.text)),
        11.7109375,
      ],
      rows: log,
    },
  ];
}

export const orderWorkbook = (data) => createXlsx(buildOrderSheets(data));

// "S09259" -> "SO 9259.xlsx" (the reference file's name); anything unexpected is made file-name safe.
export function orderFileName(reference) {
  const m = /^S0*(\d+)$/.exec(reference ?? '');
  const base = m ? `SO ${m[1]}` : String(reference ?? 'order').replace(/[^\w .-]/g, '_');
  return `${base}.xlsx`;
}
