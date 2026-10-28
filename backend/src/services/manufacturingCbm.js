import { toLocalDate } from '../utils/dateUtils.js';
import { categoryGroup } from '../config/categoryGroups.js';
import { csvCell } from '../utils/csv.js';

// Manufacturing CBM by plant x product category. Pure functions on the production snapshot
// (unit-tested in test/manufacturingCbm.test.js).
//
// DEFINITIONS
// - Which MOs: open MOs (draft, confirmed, in progress, to close; any age) and MOs DONE in the chosen period
//   (today / this week Mon-Sun / this month, by date_finished, business timezone). Cancelled MOs never count.
// - Category = full path of the finished product's category, e.g. "All / Finished Goods / Heaters / Towers".
//   Default: FINISHED GOODS only ("All / Finished Goods ..."). "Include semi-finished" adds "All / Semi-Finished ..."
//   (semi-finished parts go INTO finished goods, so they can double-count material). Other categories are never shown.
// - Planned CBM       = open MO product_qty   x product volume (m³)
//   In production CBM = open MO qty_producing x product volume
//   Produced CBM      = done MO product_qty   x product volume (done in the chosen period)
// - Products with no volume add 0 m³ and are counted, so every CBM is a MINIMUM.
// - An MO whose unit differs from its product's unit is NOT converted: its CBM is skipped and counted as a warning.
// - Late MO = open MO whose deadline (date_deadline) has passed.

const FINISHED = 'All / Finished Goods';
const SEMI = 'All / Semi-Finished';
const round = (n) => Math.round(n * 1000) / 1000;

export function categoryKind(path) {
  if (!path) return 'other';
  if (path === FINISHED || path.startsWith(`${FINISHED} / `)) return 'finished';
  if (path === SEMI || path.startsWith(`${SEMI} / `)) return 'semi';
  return 'other';
}

// "full" = whole path; "level3" = first three levels ("All / Finished Goods / Heaters").
export function categoryLabel(path, level) {
  if (!path) return 'No category';
  return level === 'level3' ? path.split(' / ').slice(0, 3).join(' / ') : path;
}

function inPeriod(day, period, key) {
  if (!day || day > period.today) return false;
  if (key === 'today') return day === period.today;
  if (key === 'week') return day >= period.weekStart;
  return day >= period.monthStart;
}

export function manufacturingCbm(
  { openMos, finishedMos, moProducts, warehouses, period },
  timeZone,
  { periodKey = 'month', includeSemiFinished = false, linkedOnly = false, level = 'full', now = new Date() } = {}
) {
  const nowIso = now.toISOString();
  const warehouse = new Map(warehouses.map((w) => [w.id, w]));
  const rows = new Map();
  const missing = new Map(); // productId|plant -> missing-volume row
  const excluded = { semiFinished: 0, otherCategories: 0, notLinked: 0 };
  let unitMismatchSkipped = 0;

  const rowFor = (mo, path) => {
    const w = warehouse.get(mo.warehouseId);
    const category = categoryLabel(path, level);
    const key = `${mo.warehouseId ?? 'none'}|${category}`;
    let row = rows.get(key);
    if (!row) {
      row = {
        warehouseId: mo.warehouseId ?? null,
        plantCode: w?.code ?? '—',
        plantName: w?.name ?? 'No plant',
        category,
        group: categoryGroup(category),
        openMos: 0,
        lateMos: 0,
        plannedCbm: 0,
        inProductionCbm: 0,
        producedMos: 0,
        producedCbm: 0,
        mosWithoutVolume: 0,
        productsWithoutVolume: new Set(),
        unitMismatch: 0,
      };
      rows.set(key, row);
    }
    return row;
  };

  // Returns the product volume, or null when the MO must not be counted in CBM.
  const volumeFor = (mo, product, row, qty) => {
    if (!product) return null;
    if (mo.uomId && product.uomId && mo.uomId !== product.uomId) {
      row.unitMismatch += 1;
      unitMismatchSkipped += 1;
      return null;
    }
    if (!(product.volume > 0)) {
      row.mosWithoutVolume += 1;
      row.productsWithoutVolume.add(mo.productId);
      const key = `${mo.productId}|${mo.warehouseId}`;
      const m = missing.get(key) ?? {
        productId: mo.productId,
        productName: mo.productName ?? `Product ${mo.productId}`,
        category: product.category ?? 'No category',
        plantCode: row.plantCode,
        mos: 0,
        quantityNotCounted: 0,
      };
      m.mos += 1;
      m.quantityNotCounted += qty;
      missing.set(key, m);
      return null;
    }
    return product.volume;
  };

  const include = (mo, path) => {
    const kind = categoryKind(path);
    if (kind === 'other') return (excluded.otherCategories += 1), false;
    if (kind === 'semi' && !includeSemiFinished) return (excluded.semiFinished += 1), false;
    if (linkedOnly && !mo.linkedToOpenSo) return (excluded.notLinked += 1), false;
    return true;
  };

  for (const mo of openMos) {
    const product = moProducts[mo.productId];
    const path = product?.category ?? null;
    if (!include(mo, path)) continue;
    const row = rowFor(mo, path);
    row.openMos += 1;
    if (mo.deadline && mo.deadline < nowIso) row.lateMos += 1;
    const volume = volumeFor(mo, product, row, mo.qtyToProduce);
    if (volume !== null) {
      row.plannedCbm += mo.qtyToProduce * volume;
      row.inProductionCbm += mo.qtyProducing * volume;
    }
  }

  for (const mo of finishedMos) {
    if (!inPeriod(toLocalDate(mo.finishedDate, timeZone), period, periodKey)) continue;
    const product = moProducts[mo.productId];
    const path = product?.category ?? null;
    if (!include(mo, path)) continue;
    const row = rowFor(mo, path);
    row.producedMos += 1;
    const volume = volumeFor(mo, product, row, mo.qtyToProduce);
    if (volume !== null) row.producedCbm += mo.qtyToProduce * volume;
  }

  const allNoVolume = new Set();
  const list = [...rows.values()].map(({ productsWithoutVolume, ...r }) => {
    productsWithoutVolume.forEach((p) => allNoVolume.add(p));
    return {
      ...r,
      plannedCbm: round(r.plannedCbm),
      inProductionCbm: round(r.inProductionCbm),
      producedCbm: round(r.producedCbm),
      productsWithoutVolume: productsWithoutVolume.size,
    };
  });
  list.sort((a, b) => a.plantCode.localeCompare(b.plantCode) || b.plannedCbm - a.plannedCbm || b.openMos - a.openMos);

  // Per-plant totals (for the chart)
  const plants = new Map();
  for (const r of list) {
    const p = plants.get(r.plantCode) ?? { plantCode: r.plantCode, plantName: r.plantName, plannedCbm: 0, inProductionCbm: 0, producedCbm: 0 };
    p.plannedCbm += r.plannedCbm;
    p.inProductionCbm += r.inProductionCbm;
    p.producedCbm += r.producedCbm;
    plants.set(r.plantCode, p);
  }

  const sum = (key) => list.reduce((n, r) => n + r[key], 0);
  return {
    rows: list,
    plants: [...plants.values()].map((p) => ({
      ...p,
      plannedCbm: round(p.plannedCbm),
      inProductionCbm: round(p.inProductionCbm),
      producedCbm: round(p.producedCbm),
    })),
    totals: {
      openMos: sum('openMos'),
      lateMos: sum('lateMos'),
      plannedCbm: round(sum('plannedCbm')),
      inProductionCbm: round(sum('inProductionCbm')),
      producedMos: sum('producedMos'),
      producedCbm: round(sum('producedCbm')),
      mosWithoutVolume: sum('mosWithoutVolume'),
      productsWithoutVolume: allNoVolume.size,
      unitMismatchSkipped,
    },
    excluded,
    missingVolume: [...missing.values()]
      .map((m) => ({ ...m, quantityNotCounted: round(m.quantityNotCounted) }))
      .sort((a, b) => b.mos - a.mos || b.quantityNotCounted - a.quantityNotCounted),
    options: { periodKey, includeSemiFinished, linkedOnly, level },
    period,
  };
}

// CSV of the products missing a volume (no money columns; values quoted, quotes doubled).
export function missingVolumeCsv(missingVolume) {
  const q = csvCell; // quoted, quotes doubled, formulas neutralised (utils/csv.js)
  const lines = [['Product', 'Category', 'Plant', 'MOs', 'Quantity not counted'].map(q).join(',')];
  for (const m of missingVolume) lines.push([m.productName, m.category, m.plantCode, m.mos, m.quantityNotCounted].map(q).join(','));
  return `${lines.join('\r\n')}\r\n`;
}
