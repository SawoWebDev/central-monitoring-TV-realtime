import { toLocalDate, daysBetween } from '../utils/dateUtils.js';
import { isFinishedGoods, shippedGroup } from '../config/categoryGroups.js';

// Calculations for the operations status report. Pure functions: snapshot data in, result out
// (unit-tested in test/operationsAnalytics.test.js).
//
// DEFINITIONS
// - CBM shipped = SUM(delivered quantity x product volume in m³) over DONE outgoing delivery lines of
//   FINISHED GOODS only (category "All / Finished Goods ...": heaters, sauna rooms, accessories and other finished
//   goods; client's manager confirmed 2026-10-22), per plant (= warehouse of the delivery's operation type).
//   Semi-finished, raw-material and uncategorised lines are not counted. Products with no volume in Odoo add
//   0 m³ and are counted in `missingVolume`, so the total is a MINIMUM, not an estimate.
//   Today / this week (Monday-Sunday) / this month use the business timezone.
// - CBM Shipped monthly chart (client request 2026-10-21): the SAME shipped lines and volumes as above (done outgoing
//   delivery lines, quantity x product volume, month = date of the move in the business timezone), but
//   only FINISHED GOODS products (category "All / Finished Goods ..."), split into Accessories / Heaters / Sauna Rooms /
//   Other (see config/categoryGroups.js), for the last 12 months including the current one (zero-filled, no plants).
//   Semi-Finished, Raw Materials and uncategorised lines are left out and reported in `excluded`.
//   Each move is counted once; total = Accessories + Heaters + Sauna Rooms + Other.
// - Lead-time stages (open sales orders = confirmed and not fully delivered):
//     partly_shipped     some deliveries done (Odoo delivery status "partial")
//     in_production      at least one MO in progress / to close, or some MOs done and others not
//     ready_to_ship      every MO done, or the order needs no manufacturing; nothing shipped yet
//     waiting_production MOs exist but none has started (draft / confirmed)
//   Cancelled MOs are ignored. Days open = today - order date (business dates).
// - Finished lead time = order date -> date of the LAST completed delivery, for sales orders that are
//   fully delivered and whose last delivery was completed this month.
// - MO late = open MO whose deadline has passed. MO progress = average of (quantity producing /
//   quantity to produce) over MOs in progress, so different units are never added together.

const round = (n, digits = 2) => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};
const average = (values) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
// The middle value: not pulled up by a few very old orders (Odoo has open orders > 2 years old).
const median = (values) => {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
};

function plantInfo(warehouses) {
  const byId = new Map(warehouses.map((w) => [w.id, w]));
  return (id) => {
    const w = byId.get(id);
    return { warehouseId: id ?? null, code: w?.code ?? '—', name: w?.name ?? 'No plant' };
  };
}

// Which of today / this week / this month a local date falls in.
function periodsOf(day, period) {
  return {
    today: day === period.today,
    week: day >= period.weekStart && day <= period.today,
    month: day >= period.monthStart && day <= period.today,
  };
}

// --- 1. CBM shipped per plant -------------------------------------------------------

export function cbmShipped({ shippedMoves, productVolumes, shippedProducts: productInfo = {}, warehouses, period }, timeZone) {
  const plant = plantInfo(warehouses);
  const empty = () => ({ cbm: 0, quantity: 0 });
  const rows = new Map();
  const totals = { today: empty(), week: empty(), month: empty() };
  const missing = { products: new Set(), quantity: 0, lines: 0 };
  const shippedProducts = new Set();

  for (const move of shippedMoves) {
    const day = toLocalDate(move.date, timeZone);
    if (!day) continue;
    const inPeriod = periodsOf(day, period);
    if (!inPeriod.week && !inPeriod.month) continue;
    if (!isFinishedGoods(productInfo[move.productId]?.category)) continue; // finished goods only

    const volume = productVolumes[move.productId] || 0;
    const cbm = move.quantity * volume;
    let row = rows.get(move.warehouseId);
    if (!row) {
      row = { ...plant(move.warehouseId), today: empty(), week: empty(), month: empty() };
      rows.set(move.warehouseId, row);
    }
    for (const key of ['today', 'week', 'month']) {
      if (!inPeriod[key]) continue;
      row[key].cbm += cbm;
      row[key].quantity += move.quantity;
      totals[key].cbm += cbm;
      totals[key].quantity += move.quantity;
    }
    shippedProducts.add(move.productId);
    if (volume <= 0) {
      missing.products.add(move.productId);
      missing.quantity += move.quantity;
      missing.lines += 1;
    }
  }

  const finish = (p) => ({ cbm: round(p.cbm, 3), quantity: round(p.quantity) });
  return {
    plants: [...rows.values()]
      .map((r) => ({ ...r, today: finish(r.today), week: finish(r.week), month: finish(r.month) }))
      .sort((a, b) => a.code.localeCompare(b.code)),
    totals: { today: finish(totals.today), week: finish(totals.week), month: finish(totals.month) },
    missingVolume: {
      products: missing.products.size,
      shippedProducts: shippedProducts.size,
      quantity: round(missing.quantity),
      lines: missing.lines,
    },
    period,
  };
}

// --- 1b. CBM shipped per month, by product group -------------------------------------------

const GROUP_FIELD = { Accessories: 'accessories', Heaters: 'heaters', 'Sauna Rooms': 'saunaRooms', Other: 'other' };

// "2026-10" -> ["2025-11", ..., "2026-10"] (oldest first)
function monthKeys(currentMonth, months) {
  const [y, m] = currentMonth.split('-').map(Number);
  return Array.from({ length: months }, (_, i) => {
    const index = y * 12 + (m - 1) - (months - 1 - i);
    return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`;
  });
}

export function cbmShippedMonthly({ shippedMoves, shippedProducts, period }, timeZone, { months = 12 } = {}) {
  const currentMonth = period.today.slice(0, 7);
  const rows = new Map(monthKeys(currentMonth, months).map((month) => [month, { month, accessories: 0, heaters: 0, saunaRooms: 0, other: 0, quantity: 0 }]));
  const excluded = { cbm: 0, lines: 0 };
  const missing = { products: new Set(), quantity: 0 };

  for (const move of shippedMoves) {
    const row = rows.get(toLocalDate(move.date, timeZone)?.slice(0, 7));
    if (!row) continue;
    const product = shippedProducts[move.productId];
    const volume = product?.volume || 0;
    const cbm = move.quantity * volume;
    if (!isFinishedGoods(product?.category)) {
      excluded.cbm += cbm;
      excluded.lines += 1;
      continue;
    }
    row[GROUP_FIELD[shippedGroup(product.category)]] += cbm;
    row.quantity += move.quantity;
    if (volume <= 0) {
      missing.products.add(move.productId);
      missing.quantity += move.quantity;
    }
  }

  const data = [...rows.values()].map((r) => {
    const accessories = round(r.accessories, 3);
    const heaters = round(r.heaters, 3);
    const saunaRooms = round(r.saunaRooms, 3);
    const other = round(r.other, 3);
    return {
      month: r.month,
      accessories,
      heaters,
      saunaRooms,
      other,
      total: round(accessories + heaters + saunaRooms + other, 3),
      quantity: round(r.quantity),
      partial: r.month === currentMonth, // the current month is not finished yet
    };
  });
  return {
    months: data,
    missingVolume: { products: missing.products.size, quantity: round(missing.quantity) },
    excluded: { cbm: round(excluded.cbm, 3), lines: excluded.lines },
  };
}

// --- 2. Lead-time stages ---------------------------------------------------------------

export const STAGES = ['waiting_production', 'in_production', 'ready_to_ship', 'partly_shipped'];

export function stageOf(so, moStates) {
  if (so.deliveryStatus === 'partial') return 'partly_shipped';
  const states = so.moIds.map((id) => moStates[id]).filter((s) => s && s !== 'cancel');
  if (states.length === 0) return 'ready_to_ship'; // nothing to manufacture
  const done = states.filter((s) => s === 'done').length;
  if (done === states.length) return 'ready_to_ship';
  if (states.some((s) => s === 'progress' || s === 'to_close') || done > 0) return 'in_production';
  return 'waiting_production';
}

export function leadTime({ openSalesOrders, moStates, deliveredSalesOrders, doneDeliveries, period }, timeZone) {
  const stages = Object.fromEntries(
    STAGES.map((s) => [s, { stage: s, count: 0, days: [], oldest: null, withoutManufacturing: 0 }])
  );
  let notTracked = 0;

  for (const so of openSalesOrders) {
    if (!so.deliveryStatus) {
      notTracked += 1; // Odoo has no delivery status (e.g. service-only order)
      continue;
    }
    const stage = stages[stageOf(so, moStates)];
    const orderDay = toLocalDate(so.orderDate, timeZone);
    const days = orderDay ? Math.max(0, daysBetween(orderDay, period.today)) : null;
    stage.count += 1;
    if (days !== null) {
      stage.days.push(days);
      if (!stage.oldest || days > stage.oldest.days) stage.oldest = { reference: so.reference, days };
    }
    if (so.moIds.every((id) => !moStates[id] || moStates[id] === 'cancel')) stage.withoutManufacturing += 1;
  }

  // Finished: last completed delivery per sales order
  const lastDone = new Map();
  for (const d of doneDeliveries) {
    if (!d.saleOrderId || !d.dateDone) continue;
    if (!lastDone.has(d.saleOrderId) || d.dateDone > lastDone.get(d.saleOrderId)) lastDone.set(d.saleOrderId, d.dateDone);
  }
  const finishedDays = [];
  for (const so of deliveredSalesOrders) {
    if (so.deliveryStatus !== 'full' || !lastDone.has(so.id)) continue;
    const doneDay = toLocalDate(lastDone.get(so.id), timeZone);
    const orderDay = toLocalDate(so.orderDate, timeZone);
    if (!doneDay || !orderDay || doneDay < period.monthStart || doneDay > period.today) continue;
    finishedDays.push(Math.max(0, daysBetween(orderDay, doneDay)));
  }

  const avg = (values) => (values.length ? round(average(values), 1) : null);
  return {
    stages: STAGES.map((s) => {
      const { days, ...rest } = stages[s];
      return { ...rest, averageDaysOpen: avg(days), medianDaysOpen: median(days) };
    }),
    openOrders: openSalesOrders.length - notTracked,
    notTracked,
    finishedThisMonth: {
      orders: finishedDays.length,
      averageDays: avg(finishedDays),
      medianDays: median(finishedDays),
      minDays: finishedDays.length ? Math.min(...finishedDays) : null,
      maxDays: finishedDays.length ? Math.max(...finishedDays) : null,
    },
    period,
  };
}

// --- 3. Manufacturing orders per plant ------------------------------------------------

export const OPEN_MO_STATES = ['draft', 'confirmed', 'progress', 'to_close'];

export function manufacturingByPlant({ openMos, finishedMos, warehouses, period }, timeZone, now = new Date()) {
  const plant = plantInfo(warehouses);
  const nowIso = now.toISOString();
  const rows = new Map();
  const getRow = (id) => {
    let row = rows.get(id);
    if (!row) {
      row = {
        ...plant(id),
        open: Object.fromEntries(OPEN_MO_STATES.map((s) => [s, 0])),
        openTotal: 0,
        late: 0,
        finished: { today: 0, week: 0, month: 0 },
        progressRatios: [],
      };
      rows.set(id, row);
    }
    return row;
  };

  for (const mo of openMos) {
    const row = getRow(mo.warehouseId);
    if (row.open[mo.state] === undefined) continue;
    row.open[mo.state] += 1;
    row.openTotal += 1;
    if (mo.deadline && mo.deadline < nowIso) row.late += 1;
    if ((mo.state === 'progress' || mo.state === 'to_close') && mo.qtyToProduce > 0) {
      row.progressRatios.push(Math.min(1, mo.qtyProducing / mo.qtyToProduce));
    }
  }

  for (const mo of finishedMos) {
    const day = toLocalDate(mo.finishedDate, timeZone);
    if (!day) continue;
    const inPeriod = periodsOf(day, period);
    const row = getRow(mo.warehouseId);
    for (const key of ['today', 'week', 'month']) if (inPeriod[key]) row.finished[key] += 1;
  }

  const plants = [...rows.values()]
    .map(({ progressRatios, ...row }) => ({
      ...row,
      inProgressAverage: progressRatios.length ? round(average(progressRatios) * 100, 1) : null, // percent
    }))
    .sort((a, b) => a.code.localeCompare(b.code));

  const sum = (pick) => plants.reduce((n, p) => n + pick(p), 0);
  return {
    plants,
    totals: {
      open: Object.fromEntries(OPEN_MO_STATES.map((s) => [s, sum((p) => p.open[s])])),
      openTotal: sum((p) => p.openTotal),
      late: sum((p) => p.late),
      finished: { today: sum((p) => p.finished.today), week: sum((p) => p.finished.week), month: sum((p) => p.finished.month) },
    },
    period,
  };
}
