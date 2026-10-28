import { HttpError } from './httpError.js';
import { isValidDate } from './dateUtils.js';

// Checks the query string of every request. Bad input is rejected with 400
// and a message that says what is wrong; nothing invalid reaches the calculations.

export const STATUSES = ['quotation', 'quotation_sent', 'confirmed', 'cancelled'];
const SORT_FIELDS = ['orderDate', 'amount'];
const SORT_ORDERS = ['asc', 'desc'];

const bad = (message) => new HttpError(400, message);

// Returns one trimmed string, or undefined when the parameter is absent/empty.
// "?status=a&status=b" (the same name twice) is rejected.
function single(query, name) {
  const value = query[name];
  if (value === undefined || value === '') return undefined;
  if (typeof value !== 'string') throw bad(`"${name}" must be given only once`);
  return value.trim() || undefined;
}

function positiveInt(value, name) {
  if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > Number.MAX_SAFE_INTEGER) {
    throw bad(`"${name}" must be a positive whole number`);
  }
  return Number(value);
}

function oneOf(value, allowed, name) {
  if (!allowed.includes(value)) throw bad(`"${name}" must be one of: ${allowed.join(', ')}`);
  return value;
}

// Shared filters: startDate, endDate, status, salesperson, customer, search.
export function parseFilters(query) {
  const startDate = single(query, 'startDate');
  const endDate = single(query, 'endDate');
  for (const [name, value] of [['startDate', startDate], ['endDate', endDate]]) {
    if (value !== undefined && !isValidDate(value)) {
      throw bad(`"${name}" must be a real date in the format YYYY-MM-DD`);
    }
  }
  if (startDate && endDate && startDate > endDate) {
    throw bad('"startDate" must be on or before "endDate"');
  }

  const statusRaw = single(query, 'status');
  const statuses = statusRaw
    ? [...new Set(statusRaw.split(',').map((s) => oneOf(s.trim(), STATUSES, 'status')))]
    : null;

  const salespersonRaw = single(query, 'salesperson');
  let salesperson = null;
  if (salespersonRaw !== undefined) {
    salesperson =
      salespersonRaw.toLowerCase() === 'unassigned'
        ? 'unassigned'
        : positiveInt(salespersonRaw, 'salesperson');
  }

  const customerRaw = single(query, 'customer');
  const customer = customerRaw !== undefined ? positiveInt(customerRaw, 'customer') : null;

  const search = single(query, 'search') ?? null;
  if (search && search.length > 100) throw bad('"search" must be at most 100 characters');

  return {
    startDate: startDate ?? null,
    endDate: endDate ?? null,
    statuses,
    salesperson,
    customer,
    search,
  };
}

// For lists: page (default 1), limit (default 20, max 100), sortBy, sortOrder.
export function parsePagination(query) {
  const pageRaw = single(query, 'page');
  const sortBy = single(query, 'sortBy') ?? 'orderDate';
  const sortOrder = single(query, 'sortOrder') ?? 'desc';
  return {
    page: pageRaw !== undefined ? positiveInt(pageRaw, 'page') : 1,
    limit: parseLimit(query, 20),
    sortBy: oneOf(sortBy, SORT_FIELDS, 'sortBy'),
    sortOrder: oneOf(sortOrder, SORT_ORDERS, 'sortOrder'),
  };
}

export function parseLimit(query, defaultLimit, max = 100) {
  const raw = single(query, 'limit');
  if (raw === undefined) return defaultLimit;
  const limit = positiveInt(raw, 'limit');
  if (limit > max) throw bad(`"limit" must be at most ${max}`);
  return limit;
}

// Optional free text (trimmed), at most `max` characters; missing = null.
export function parseText(query, name, max = 100) {
  const value = single(query, name) ?? null;
  if (value && value.length > max) throw bad(`"${name}" must be at most ${max} characters`);
  return value;
}

// Optional positive whole number; missing = null.
export function parseOptionalInt(query, name) {
  const raw = single(query, name);
  return raw === undefined ? null : positiveInt(raw, name);
}

// Page number (default 1).
export function parsePage(query) {
  return parseOptionalInt(query, 'page') ?? 1;
}

// One value from a fixed list, e.g. parseChoice(query, 'period', ['today', 'week', 'month'], 'month').
export function parseChoice(query, name, allowed, defaultValue) {
  return oneOf(single(query, name) ?? defaultValue, allowed, name);
}

// "true"/"false" (also "1"/"0"); missing = defaultValue.
export function parseBoolean(query, name, defaultValue = false) {
  const raw = single(query, name);
  if (raw === undefined) return defaultValue;
  if (raw === 'true' || raw === '1') return true;
  if (raw === 'false' || raw === '0') return false;
  throw bad(`"${name}" must be true or false`);
}

// Optional real calendar date "YYYY-MM-DD"; missing = null.
export function parseDateParam(query, name) {
  const value = single(query, name);
  if (value === undefined) return null;
  if (!isValidDate(value)) throw bad(`"${name}" must be a real date in the format YYYY-MM-DD`);
  return value;
}

// Optional number from 0 up (decimals allowed, e.g. 2.5); missing = null.
export function parseQuantity(query, name) {
  const value = single(query, name);
  if (value === undefined) return null;
  if (!/^\d+(\.\d+)?$/.test(value) || Number(value) > 1e9) throw bad(`"${name}" must be a number from 0 up`);
  return Number(value);
}

export function parseId(value) {
  return positiveInt(String(value), 'id');
}
