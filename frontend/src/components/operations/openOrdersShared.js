import { formatNumber } from '../../utils/format';

// Query parameters for the open-orders endpoints: only the filters that are set (no empty values).
export function filterParams({ search, customer, category, age, lateOnly }) {
  const params = {};
  if (search) params.search = search;
  if (customer) params.customer = customer;
  if (category) params.category = category;
  if (age && age !== 'all') params.age = age;
  if (lateOnly) params.lateOnly = true;
  return params;
}

// m³ with 2 decimals below 1 m³ (small orders), 1 decimal above.
export function formatM3(value) {
  if (value == null) return '—';
  const digits = Math.abs(value) < 1 ? 2 : 1;
  return `${new Intl.NumberFormat('en-PH', { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(value)} m³`;
}

export const formatQty = (value) => (value == null ? '—' : formatNumber(Math.round(value * 100) / 100));
