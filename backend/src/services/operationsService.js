import { appConfig } from '../config/app.js';
import { getClient, fetchAll, scopeDomain } from './odooService.js';
import { m2oId, m2oName, odooDateToIso, isoToOdooDate } from '../utils/odooHelpers.js';
import { todayLocal, bucketKey, localMidnightToUtcIso } from '../utils/dateUtils.js';

// Reads manufacturing and shipping data from Odoo (read-only) for the operations status report.
// Odoo holds far too much history to copy (≈806k stock moves, ≈30k MOs), so we only read:
// - OPEN records (open MOs, confirmed sales orders not fully delivered), and
// - records COMPLETED since the start of this week or this month (whichever is earlier),
//   which is all the "today / this week / this month" figures need.

const OPEN_MO_STATES = ['draft', 'confirmed', 'progress', 'to_close'];
const MO_LINE_FIELDS = ['name', 'state', 'product_id', 'origin', 'product_qty'];
const CHUNK = 1000;
// "CBM Shipped" monthly chart: how many months of shipped lines to keep (this month + the 11 before it).
export const CBM_HISTORY_MONTHS = 12;

// Reads records by id, `chunk` at a time.
async function readByIds(odoo, model, ids, fields, chunk = CHUNK) {
  const rows = [];
  for (let i = 0; i < ids.length; i += chunk) {
    rows.push(...(await odoo.execute(model, 'read', [ids.slice(i, i + chunk)], { fields })));
  }
  return rows;
}

// --- MO product cache ---------------------------------------------------------------------
// Reading category + volume + unit for ~3,200 MO products takes ~30 s (categ_id is calculated by Odoo,
// and 1,000 at a time timed out). Product data rarely changes, so it is kept in memory between syncs:
// new products are read straight away; known products are refreshed a few hundred at a time
// (oldest first), so a volume fixed in Odoo shows up within roughly 10 syncs.
const PRODUCT_BATCH = 200;
const PRODUCT_REFRESH_PER_SYNC = 400;
// A known product is read again only when its cached copy is older than this (the cache is shared by several
// product lists in one sync, so without it the same products were read again and again within seconds).
export const PRODUCT_REFRESH_MIN_AGE_MS = 20 * 60 * 1000;
const productCache = new Map(); // productId -> { category, volume, uomId, fetchedAt }

async function readProductBatch(odoo, ids) {
  const fields = ['categ_id', 'volume', 'uom_id', 'default_code', 'name']; // code + name: for the Consolidation Order page
  try {
    return await odoo.execute('product.product', 'read', [ids], { fields });
  } catch {
    return odoo.execute('product.product', 'read', [ids], { fields }); // retry once; a 2nd failure fails the sync
  }
}

export async function loadMoProducts(odoo, productIds, now = Date.now()) {
  const unknown = productIds.filter((pid) => !productCache.has(pid));
  const stale = productIds
    .filter((pid) => productCache.has(pid) && now - productCache.get(pid).fetchedAt >= PRODUCT_REFRESH_MIN_AGE_MS)
    .sort((a, b) => productCache.get(a).fetchedAt - productCache.get(b).fetchedAt)
    .slice(0, PRODUCT_REFRESH_PER_SYNC);
  const toRead = [...unknown, ...stale];
  for (let i = 0; i < toRead.length; i += PRODUCT_BATCH) {
    const readAt = Date.now();
    for (const p of await readProductBatch(odoo, toRead.slice(i, i + PRODUCT_BATCH))) {
      productCache.set(p.id, {
        category: m2oName(p.categ_id) || null,
        volume: Number(p.volume) || 0,
        uomId: m2oId(p.uom_id),
        code: p.default_code || null, // Odoo "Internal Reference" (Excel: Product Code)
        name: p.name || null,
        fetchedAt: readAt,
      });
    }
  }
  const result = {};
  for (const pid of productIds) {
    const c = productCache.get(pid);
    if (c) result[pid] = { category: c.category, volume: c.volume, uomId: c.uomId, code: c.code, name: c.name };
  }
  return result;
}

// First day of the oldest month of the chart, as a business-timezone date ("2025-11-01" for 2026-10-21).
export function historyStartDate(today, months = CBM_HISTORY_MONTHS) {
  const [y, m] = today.split('-').map(Number);
  const index = y * 12 + (m - 1) - (months - 1);
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}-01`;
}

// Start of the period we need completed records for, as an Odoo UTC datetime string.
export function periodStart(timeZone, now = new Date()) {
  const today = todayLocal(timeZone, now);
  const weekStart = bucketKey(today, 'week');
  const monthStart = `${today.slice(0, 8)}01`;
  const earliest = weekStart < monthStart ? weekStart : monthStart;
  return { today, weekStart, monthStart, earliest, earliestUtc: localMidnightToUtcIso(earliest, timeZone) };
}

export async function fetchOperationsData() {
  const odoo = getClient();
  const period = periodStart(appConfig.timezone);
  const since = isoToOdooDate(period.earliestUtc);
  // Shipped lines go further back (12 months) for the monthly chart; the cards still use only week / month.
  const historyStart = historyStartDate(period.today);
  const shippedSince = isoToOdooDate(localMidnightToUtcIso(historyStart < period.earliest ? historyStart : period.earliest, appConfig.timezone));

  // Plants (warehouses) and which warehouse each operation type belongs to
  const warehouses = await fetchAll(odoo, 'stock.warehouse', [], ['name', 'code']);
  const pickingTypes = await fetchAll(odoo, 'stock.picking.type', [], ['code', 'warehouse_id']);
  const warehouseOfType = new Map(pickingTypes.map((t) => [t.id, m2oId(t.warehouse_id)]));
  const warehouseOf = (typeField) => warehouseOfType.get(m2oId(typeField)) ?? null;

  // 1. Delivery lines shipped (done) since the start of the chart's first month -> CBM shipped
  const shippedMoves = await fetchAll(
    odoo,
    'stock.move',
    [['state', '=', 'done'], ['picking_code', '=', 'outgoing'], ['date', '>=', shippedSince], ...(await scopeDomain(odoo, 'picking_id.sale_id.partner_id'))],
    ['date', 'quantity', 'product_id', 'picking_type_id', 'picking_id']
  );

  // 2. (Open deliveries were read here for the "Open Shipments" board, removed 2026-10-19.)

  // 3. Deliveries completed since the period start that belong to a sales order -> finished lead time
  const doneDeliveries = await fetchAll(
    odoo,
    'stock.picking',
    [['picking_type_code', '=', 'outgoing'], ['state', '=', 'done'], ['date_done', '>=', since], ['sale_id', '!=', false], ...(await scopeDomain(odoo, 'sale_id.partner_id'))],
    ['sale_id', 'date_done', 'picking_type_id']
  );

  // 4. Manufacturing orders: all open ones, and those finished since the period start
  const openMos = await fetchAll(
    odoo,
    'mrp.production',
    [['state', 'in', OPEN_MO_STATES]],
    ['name', 'state', 'product_id', 'product_qty', 'qty_producing', 'product_uom_id', 'date_start', 'date_deadline', 'origin', 'picking_type_id']
  );
  const finishedMos = await fetchAll(
    odoo,
    'mrp.production',
    [['state', '=', 'done'], ['date_finished', '>=', since]],
    ['date_finished', 'picking_type_id', 'product_id', 'product_qty', 'product_uom_id']
  );

  // 5. Confirmed sales orders not fully delivered (the "open" ones) -> lead time stages
  const openSalesOrders = await fetchAll(
    odoo,
    'sale.order',
    [['state', '=', 'sale'], ['delivery_status', '!=', 'full'], ...(await scopeDomain(odoo))],
    ['name', 'date_order', 'partner_id', 'partner_shipping_id', 'warehouse_id', 'delivery_status', 'commitment_date']
  );
  // The SO -> MO link (and Odoo's order CBM) are calculated by Odoo on the fly and are slow
  // (1000 orders > 15 s timeout), so they are read separately, 100 orders per request.
  const moLinks = await readByIds(odoo, 'sale.order', openSalesOrders.map((so) => so.id), ['mrp_production_ids', 'total_cbm', 'expected_date'], 100);
  const moIdsOf = new Map(moLinks.map((so) => [so.id, so.mrp_production_ids || []]));
  const orderCbmOf = new Map(moLinks.map((so) => [so.id, Number(so.total_cbm) || 0]));
  // "Destination" of an open order = country of its Delivery Address (partner_shipping_id). Checked 2026-10-22 against
  // the client's shipment schedule ("CUST. CODE-DESTINATION"): it matched; the customer's own country often does not.
  const shipToIds = [...new Set(openSalesOrders.map((so) => m2oId(so.partner_shipping_id)).filter(Boolean))];
  const shipTos = await readByIds(odoo, 'res.partner', shipToIds, ['country_id']);
  const countryOfPartner = new Map(shipTos.map((p) => [p.id, m2oName(p.country_id) || null]));
  const expectedDateOf = new Map(moLinks.map((so) => [so.id, odooDateToIso(so.expected_date)])); // Odoo "Expected Date"

  // Product lines of the open orders ("Open Sales Ordered"). NO price fields are read.
  // total_product_cbm is calculated by Odoo, so 500 lines per request (~1.2 s each).
  const trackedOpenIds = openSalesOrders.filter((so) => so.delivery_status).map((so) => so.id);
  const openOrderLines = await fetchAll(
    odoo,
    'sale.order.line',
    [['order_id', 'in', trackedOpenIds], ['display_type', '=', false]],
    ['order_id', 'product_id', 'product_uom_qty', 'qty_delivered', 'total_product_cbm'],
    500
  );
  // Sales orders whose last delivery was completed in the period (needed for finished lead time)
  const doneSoIds = [...new Set(doneDeliveries.map((d) => m2oId(d.sale_id)).filter(Boolean))];
  const deliveredSalesOrders = await readByIds(odoo, 'sale.order', doneSoIds, ['name', 'date_order', 'delivery_status', 'warehouse_id']);

  // State of every MO linked to an open sales order (some of them are already done)
  const linkedMoIds = [...new Set([...moIdsOf.values()].flat())];
  const linkedMos = await readByIds(odoo, 'mrp.production', linkedMoIds, MO_LINE_FIELDS);

  // "Manufacturing Order State" per order line: many MOs are tied to a sales order only through their
  // Source (origin) text, e.g. "S09259-UAE ..." or "HP for SO9259 ...", and are missing from mrp_production_ids
  // (checked 2026-10-21: ~3,150 such MOs). So we also search the Source for each open order's reference,
  // for ALL products (not only those on the order lines): the Consolidation Order page also lists items that are made for
  // an order but are not on it ("Include items made for the order"). 100 orders per request (~5 s each, under the
  // timeout; 250 per request would come close to it without the product filter, measured 2026-10-27).
  // The exact match is done in the pages (originMentions), the search here is only a pre-filter.
  const lineProductIdList = [...new Set(openOrderLines.map((l) => m2oId(l.product_id)).filter(Boolean))];
  const sourceMos = [];
  const refs = openSalesOrders.filter((so) => so.delivery_status).map((so) => so.name);
  for (let i = 0; i < refs.length; i += 100) {
    const chunk = refs.slice(i, i + 100).flatMap((r) => [...new Set([r, r.replace(/^S0/, 'SO')])]);
    const anyRef = [...Array(chunk.length - 1).fill('|'), ...chunk.map((r) => ['origin', 'ilike', r])];
    sourceMos.push(...(await fetchAll(odoo, 'mrp.production', anyRef, MO_LINE_FIELDS)));
  }
  const orderMos = new Map([...linkedMos, ...sourceMos].map((mo) => [mo.id, mo]));

  // Product volumes (m³) for every product shipped in the period
  const productIds = [...new Set(shippedMoves.map((m) => m2oId(m.product_id)).filter(Boolean))];
  // Category + volume of every shipped product (same cache as the MO products, see loadMoProducts)
  const shippedProducts = await loadMoProducts(odoo, productIds);

  // Category, volume and unit of every MO product (cached between syncs, see loadMoProducts)
  const moProductIds = [...new Set([...openMos, ...finishedMos].map((mo) => m2oId(mo.product_id)).filter(Boolean))];
  const moProducts = await loadMoProducts(odoo, moProductIds);
  // Same cache for the products on open sales order lines (category + volume)
  // ... and of the products of the MOs found above (code, name and category are needed for the extra items of an order)
  const orderMoProductIds = [...new Set([...orderMos.values()].map((mo) => m2oId(mo.product_id)).filter(Boolean))];
  const lineProducts = await loadMoProducts(odoo, [...new Set([...lineProductIdList, ...orderMoProductIds])]);
  const linkedMoSet = new Set(linkedMoIds);

  return {
    period,
    warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name })),
    productVolumes: Object.fromEntries(Object.entries(shippedProducts).map(([id, p]) => [id, p.volume || 0])),
    // productId -> { category, volume, uomId } for shipped products (monthly composition)
    shippedProducts,
    shippedMoves: shippedMoves.map((m) => ({
      id: m.id,
      date: odooDateToIso(m.date),
      quantity: Number(m.quantity) || 0,
      productId: m2oId(m.product_id),
      productName: m2oName(m.product_id),
      warehouseId: warehouseOf(m.picking_type_id),
      pickingId: m2oId(m.picking_id),
    })),
    doneDeliveries: doneDeliveries.map((d) => ({
      saleOrderId: m2oId(d.sale_id),
      dateDone: odooDateToIso(d.date_done),
      warehouseId: warehouseOf(d.picking_type_id),
    })),
    openMos: openMos.map((mo) => ({
      id: mo.id,
      reference: mo.name,
      state: mo.state,
      productName: m2oName(mo.product_id),
      productId: m2oId(mo.product_id),
      qtyToProduce: Number(mo.product_qty) || 0,
      qtyProducing: Number(mo.qty_producing) || 0,
      uomId: m2oId(mo.product_uom_id),
      startDate: odooDateToIso(mo.date_start),
      deadline: odooDateToIso(mo.date_deadline),
      origin: mo.origin || null,
      warehouseId: warehouseOf(mo.picking_type_id),
      linkedToOpenSo: linkedMoSet.has(mo.id),
    })),
    finishedMos: finishedMos.map((mo) => ({
      id: mo.id,
      finishedDate: odooDateToIso(mo.date_finished),
      warehouseId: warehouseOf(mo.picking_type_id),
      productId: m2oId(mo.product_id),
      productName: m2oName(mo.product_id),
      qtyToProduce: Number(mo.product_qty) || 0,
      uomId: m2oId(mo.product_uom_id),
      linkedToOpenSo: linkedMoSet.has(mo.id),
    })),
    // productId -> { category, volume, uomId } for MO products
    moProducts,
    openSalesOrders: openSalesOrders.map((so) => ({
      id: so.id,
      reference: so.name,
      orderDate: odooDateToIso(so.date_order),
      customerId: m2oId(so.partner_id),
      customerName: m2oName(so.partner_id) || 'Unknown customer',
      warehouseId: m2oId(so.warehouse_id),
      deliveryStatus: so.delivery_status || null,
      commitmentDate: odooDateToIso(so.commitment_date), // Odoo label: "Delivery Date" (checked with fields_get)
      orderCbm: orderCbmOf.get(so.id) ?? 0, // Odoo's sale.order total_cbm
      expectedDate: expectedDateOf.get(so.id) ?? null,
      destination: countryOfPartner.get(m2oId(so.partner_shipping_id)) ?? null, // delivery address country
      moIds: moIdsOf.get(so.id) ?? [],
    })),
    openOrderLines: openOrderLines.map((l) => ({
      id: l.id,
      orderId: m2oId(l.order_id),
      productId: m2oId(l.product_id),
      productName: m2oName(l.product_id) || 'Unknown product',
      orderedQty: Number(l.product_uom_qty) || 0,
      deliveredQty: Number(l.qty_delivered) || 0,
      cbm: Number(l.total_product_cbm) || 0, // Odoo's line CBM (ordered quantity)
    })),
    // productId -> { category, volume, uomId } for products on open sales order lines
    lineProducts,
    deliveredSalesOrders: deliveredSalesOrders.map((so) => ({
      id: so.id,
      reference: so.name,
      orderDate: odooDateToIso(so.date_order),
      deliveryStatus: so.delivery_status || null,
      warehouseId: m2oId(so.warehouse_id),
    })),
    moStates: Object.fromEntries(linkedMos.map((mo) => [mo.id, mo.state])),
    // MOs that may belong to an open order line: linked by Odoo or found by Source (see buildOpenOrders)
    orderMos: [...orderMos.values()].map((mo) => ({
      id: mo.id,
      reference: mo.name,
      state: mo.state,
      productId: m2oId(mo.product_id),
      origin: mo.origin || null,
      qty: Number(mo.product_qty) || 0, // quantity to produce (the Consolidation Order page lists MOs that are not on the order)
    })),
  };
}
