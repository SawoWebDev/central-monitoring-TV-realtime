import { formatNumber } from '../../utils/format';

// Shared bits of the Consolidation Order page.

// The filters as the form holds them (text boxes: always strings). Delivery dates are "YYYY-MM-DD".
export const EMPTY_FILTERS = {
  so: [], // SO numbers (chips): one or more, matched with OR
  destination: '',
  deliveryFrom: '',
  deliveryTo: '',
  deliveryMode: 'range', // range | overdue | noDate | all (see the backend README)
  includeDelivered: false,
  includeMo: false,
  productRef: '',
  productName: '',
  qtyMin: '',
  qtyMax: '',
};

// "2026-10-26" + 30 days -> "2026-11-25" (calendar arithmetic only, no timezone involved)
export function addDays(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

// SO# entries are separated by a comma, a semicolon or a new line
export const SO_SEPARATORS = /[,;\n\r]/;

// A list or text of SO numbers -> a clean list: trimmed, no empty entries, no duplicates (ignoring case and spaces).
// (The server does the same again, so a hand-made request is handled the same way.)
export function parseSoList(input) {
  const parts = Array.isArray(input) ? input : String(input ?? '').split(/[,;\n\r]+/);
  const seen = new Set();
  const list = [];
  for (const part of parts) {
    const token = String(part ?? '').trim();
    // "SO 9460", "SO9460" and "S09460" are the same order, so they count as one entry
    const compact = token.replace(/\s+/g, '').toUpperCase();
    const m = /^(?:SO(\d+)|S(\d{5}))$/.exec(compact);
    const key = m ? `SO${Number(m[1] ?? m[2])}` : compact;
    if (!token || seen.has(key)) continue;
    seen.add(key);
    list.push(token);
  }
  return list;
}

// The delivery date modes in which the From / To dates are used
export const usesDates = (mode) => mode === 'range' || mode === 'rangeOrNoDate';

// What the page starts with: orders to be delivered from today to 30 days ahead (about the size of the Excel's plan).
export const defaultFilters = (today) => ({ ...EMPTY_FILTERS, deliveryFrom: today, deliveryTo: addDays(today, 30) });

// Query parameters for the backend: only the filters that are set (no empty values).
export function filterParams(f) {
  const params = {};
  const so = parseSoList(f.so);
  if (so.length > 0) params.so = so.join(','); // the server splits it again; any of them matches (OR)
  for (const key of ['destination', 'productRef', 'productName', 'qtyMin', 'qtyMax']) {
    const value = String(f[key] ?? '').trim();
    if (value) params[key] = value;
  }
  // the two dates only count in the two "range" modes; the other modes ignore them
  const mode = f.deliveryMode ?? 'range';
  if (mode !== 'range') params.deliveryMode = mode;
  if (usesDates(mode)) {
    for (const key of ['deliveryFrom', 'deliveryTo']) if (f[key]) params[key] = f[key];
  }
  if (f.includeDelivered) params.includeDelivered = true;
  if (f.includeMo) params.includeMo = true;
  return params;
}

// A problem with the filters that the backend would reject, as a short message (or null when they are fine).
export function filterProblem(f) {
  if (usesDates(f.deliveryMode ?? 'range') && f.deliveryFrom && f.deliveryTo && f.deliveryFrom > f.deliveryTo) return 'The "From" delivery date must be on or before the "To" date.';
  const min = f.qtyMin === '' ? null : Number(f.qtyMin);
  const max = f.qtyMax === '' ? null : Number(f.qtyMax);
  if ((min !== null && !(min >= 0)) || (max !== null && !(max >= 0))) return 'Quantities must be numbers from 0 up.';
  if (min !== null && max !== null && min > max) return 'The minimum quantity must not be more than the maximum.';
  return null;
}

export const sameFilters = (a, b) => JSON.stringify(filterParams(a)) === JSON.stringify(filterParams(b));

// Quantities can have decimals (e.g. metres): up to 2 decimals, no trailing zeros.
export const formatQty = (value) => (value == null ? '' : formatNumber(Math.round(value * 100) / 100));
