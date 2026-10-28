// Unit tests for the dashboard calculations.
// ALL DATA IN THIS FILE IS MADE-UP TEST DATA. It is not company data and is never shown on the dashboard.
// Run with:  npm test   (from the backend folder)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  filterOrders,
  summarize,
  orderStatusBreakdown,
  salespersonPerformance,
  comparePeriods,
  filterOptions,
  listOrders,
  orderDetail,
} from '../src/services/analyticsService.js';
import { parseFilters, parsePagination } from '../src/utils/validation.js';
import { toLocalDate, bucketKey } from '../src/utils/dateUtils.js';

const TZ = 'Asia/Manila'; // UTC+8
const BASE = 'PHP';

// --- TEST DATA (fake) -----------------------------------------------------------
function order(o) {
  return {
    customerName: o.customerId === 100 ? 'TEST Acme' : 'TEST Beta',
    salespersonName: o.salespersonId === null ? 'Unassigned' : o.salespersonId === 7 ? 'TEST Ana' : 'TEST Ben',
    teamName: null,
    odooState: null,
    amountUntaxed: null,
    amountTax: null,
    ...o,
  };
}

const TEST_ORDERS = [
  // confirmed, PHP
  order({ id: 1, reference: 'TEST-SO001', orderDate: '2026-10-05T02:00:00Z', customerId: 100, salespersonId: 7, status: 'confirmed', currency: 'PHP', currencyRate: 1, amountTotal: 1000, amountTotalBase: 1000 }),
  // confirmed, USD, NO salesperson, and a TIMEZONE BOUNDARY: 15 Oct 16:30 UTC = 16 Oct 00:30 in Manila
  order({ id: 2, reference: 'TEST-SO002', orderDate: '2026-10-15T16:30:00Z', customerId: 200, salespersonId: null, status: 'confirmed', currency: 'USD', currencyRate: 0.02, amountTotal: 100, amountTotalBase: 5000 }),
  // quotation, PHP
  order({ id: 3, reference: 'TEST-SO003', orderDate: '2026-10-10T03:00:00Z', customerId: 100, salespersonId: 7, status: 'quotation', currency: 'PHP', currencyRate: 1, amountTotal: 300, amountTotalBase: 300 }),
  // quotation sent, EUR
  order({ id: 4, reference: 'TEST-SO004', orderDate: '2026-10-12T05:00:00Z', customerId: 200, salespersonId: 8, status: 'quotation_sent', currency: 'EUR', currencyRate: 0.016, amountTotal: 16, amountTotalBase: 1000 }),
  // cancelled, PHP
  order({ id: 5, reference: 'TEST-SO005', orderDate: '2026-10-01T01:00:00Z', customerId: 100, salespersonId: 8, status: 'cancelled', currency: 'PHP', currencyRate: 1, amountTotal: 700, amountTotalBase: 700 }),
  // confirmed, PHP, other boundary: 30 Sep 15:59 UTC = 30 Sep 23:59 in Manila (still September)
  order({ id: 6, reference: 'TEST-SO006', orderDate: '2026-09-30T15:59:00Z', customerId: 100, salespersonId: 8, status: 'confirmed', currency: 'PHP', currencyRate: 1, amountTotal: 2000, amountTotalBase: 2000 }),
];

const TEST_LINES = [
  { id: 11, orderId: 1, productId: 1, productName: 'TEST Widget', quantity: 2, subtotal: 800 },
  { id: 12, orderId: 1, productId: 2, productName: 'TEST Gadget', quantity: 1, subtotal: 200 },
  { id: 21, orderId: 2, productId: 1, productName: 'TEST Widget', quantity: 3, subtotal: 60 }, // USD -> 3000 PHP
  { id: 22, orderId: 2, productId: 2, productName: 'TEST Gadget', quantity: 1, subtotal: 40 }, // USD -> 2000 PHP
  { id: 31, orderId: 3, productId: 1, productName: 'TEST Widget', quantity: 10, subtotal: 300 }, // quotation: excluded
  { id: 51, orderId: 5, productId: 2, productName: 'TEST Gadget', quantity: 9, subtotal: 700 }, // cancelled: excluded
  { id: 61, orderId: 6, productId: 2, productName: 'TEST Gadget', quantity: 4, subtotal: 2000 },
  { id: 99, orderId: 999, productId: 1, productName: 'TEST Widget', quantity: 50, subtotal: 5000 }, // orphan: excluded
];

const OCTOBER = parseFilters({ startDate: '2026-10-01', endDate: '2026-10-31' });
const ALL = parseFilters({});
const october = () => filterOrders(TEST_ORDERS, OCTOBER, TZ);

// --- Dates and timezone ----------------------------------------------------------

test('UTC dates are converted to the Manila business date', () => {
  assert.equal(toLocalDate('2026-10-15T16:30:00Z', TZ), '2026-10-16');
  assert.equal(toLocalDate('2026-09-30T15:59:00Z', TZ), '2026-09-30');
  assert.equal(toLocalDate(null, TZ), null);
});

test('week buckets start on Monday', () => {
  assert.equal(bucketKey('2026-10-16', 'week'), '2026-10-12'); // Friday -> Monday
  assert.equal(bucketKey('2026-10-12', 'week'), '2026-10-12'); // Monday stays
  assert.equal(bucketKey('2026-10-18', 'week'), '2026-10-12'); // Sunday -> previous Monday
  assert.equal(bucketKey('2026-10-16', 'month'), '2026-10');
});

test('date filter uses the Manila date, not the UTC date (timezone boundary)', () => {
  const on16 = filterOrders(TEST_ORDERS, parseFilters({ startDate: '2026-10-16', endDate: '2026-10-16' }), TZ);
  assert.deepEqual(on16.map((o) => o.id), [2]);
  const upTo15 = filterOrders(TEST_ORDERS, parseFilters({ startDate: '2026-10-15', endDate: '2026-10-15' }), TZ);
  assert.deepEqual(upTo15, []);
  assert.deepEqual(october().map((o) => o.id), [1, 2, 3, 4, 5]); // order 6 is September in Manila
});

// --- KPIs -----------------------------------------------------------------------

test('summary: only confirmed orders count toward sales amount, mixed currencies in PHP', () => {
  assert.deepEqual(summarize(october()), {
    totalOrders: 5,
    confirmedOrders: 2,
    quotations: 2, // quotation + quotation_sent
    cancelledOrders: 1,
    totalSalesAmount: 6000, // 1000 PHP + (100 USD / 0.02) = 1000 + 5000
    averageOrderValue: 3000,
    confirmedWithoutRate: 0,
  });
});

test('summary: an order without a PHP amount is counted but not summed', () => {
  const noRate = order({ id: 7, reference: 'TEST-SO007', orderDate: '2026-10-02T00:00:00Z', customerId: 100, salespersonId: 7, status: 'confirmed', currency: 'USD', currencyRate: null, amountTotal: 50, amountTotalBase: null });
  const s = summarize([...october(), noRate]);
  assert.equal(s.confirmedOrders, 3);
  assert.equal(s.totalSalesAmount, 6000);
  assert.equal(s.averageOrderValue, 3000); // divided by the 2 orders that have an amount
  assert.equal(s.confirmedWithoutRate, 1);
});

test('summary of no orders is all zeros', () => {
  assert.equal(summarize([]).averageOrderValue, 0);
  assert.equal(summarize([]).totalOrders, 0);
});

// --- Filters --------------------------------------------------------------------

test('filter: salesperson "unassigned", a salesperson id, customer, status, search', () => {
  assert.deepEqual(filterOrders(TEST_ORDERS, parseFilters({ salesperson: 'unassigned' }), TZ).map((o) => o.id), [2]);
  assert.deepEqual(filterOrders(TEST_ORDERS, parseFilters({ salesperson: '7' }), TZ).map((o) => o.id), [1, 3]);
  assert.deepEqual(filterOrders(TEST_ORDERS, parseFilters({ customer: '200' }), TZ).map((o) => o.id), [2, 4]);
  assert.deepEqual(filterOrders(TEST_ORDERS, parseFilters({ status: 'quotation,quotation_sent' }), TZ).map((o) => o.id), [3, 4]);
  assert.deepEqual(filterOrders(TEST_ORDERS, parseFilters({ search: 'beta' }), TZ).map((o) => o.id), [2, 4]);
  assert.deepEqual(filterOrders(TEST_ORDERS, parseFilters({ search: 'so005' }), TZ).map((o) => o.id), [5]);
});

// --- Status and salespersons ----------------------------------------------------------

test('order status breakdown', () => {
  assert.deepEqual(orderStatusBreakdown(october()), [
    { status: 'quotation', count: 1, amount: 300 },
    { status: 'quotation_sent', count: 1, amount: 1000 },
    { status: 'confirmed', count: 2, amount: 6000 },
    { status: 'cancelled', count: 1, amount: 700 },
  ]);
});

test('salespersons (with Unassigned)', () => {
  assert.deepEqual(salespersonPerformance(october()), [
    { salespersonId: null, salespersonName: 'Unassigned', orderCount: 1, confirmedOrders: 1, salesAmount: 5000 },
    { salespersonId: 7, salespersonName: 'TEST Ana', orderCount: 2, confirmedOrders: 1, salesAmount: 1000 },
    { salespersonId: 8, salespersonName: 'TEST Ben', orderCount: 2, confirmedOrders: 0, salesAmount: 0 },
  ]);
});

test('joining lines never double-counts orders in the summary', () => {
  // The summary is computed from orders only; order 1 has two lines but counts once.
  assert.equal(summarize(filterOrders(TEST_ORDERS, parseFilters({ customer: '100', status: 'confirmed' }), TZ)).confirmedOrders, 2);
});

// --- Comparison and filter options ------------------------------------------------

test('comparison: previous period has the same length', () => {
  const c = comparePeriods(TEST_ORDERS, OCTOBER, TZ);
  assert.deepEqual(c.previousPeriod, { startDate: '2026-08-31', endDate: '2026-09-30', days: 31 });
  assert.equal(c.current.totalSalesAmount, 6000);
  assert.equal(c.previous.totalSalesAmount, 2000); // order 6 (30 Sep, Manila)
  assert.equal(c.changePercent.totalSalesAmount, 200);
  assert.equal(c.changePercent.quotations, null); // previous was 0
});

test('filter options list salespersons (Unassigned last) and customers', () => {
  const opts = filterOptions(TEST_ORDERS);
  assert.deepEqual(opts.salespersons, [
    { id: 7, name: 'TEST Ana' },
    { id: 8, name: 'TEST Ben' },
    { id: 'unassigned', name: 'Unassigned' },
  ]);
  assert.deepEqual(opts.customers.map((c) => c.id), [100, 200]);
});

// --- List and detail --------------------------------------------------------------

test('list: sort by PHP amount, paginate', () => {
  const page1 = listOrders(filterOrders(TEST_ORDERS, ALL, TZ), parsePagination({ sortBy: 'amount', limit: '2' }));
  assert.deepEqual(page1.items.map((o) => o.id), [2, 6]);
  assert.deepEqual(page1.meta, { total: 6, page: 1, limit: 2, totalPages: 3 });
  const page2 = listOrders(TEST_ORDERS, parsePagination({ sortBy: 'amount', limit: '2', page: '2' }));
  assert.deepEqual(page2.items.map((o) => o.id), [4, 1]); // equal amounts: newer id first
});

test('list: default sort is newest order date first', () => {
  const { items } = listOrders(TEST_ORDERS, parsePagination({}));
  assert.deepEqual(items.map((o) => o.id), [2, 4, 3, 1, 5, 6]);
});

test('detail includes only that order\'s lines, with PHP amounts', () => {
  const d = orderDetail(TEST_ORDERS[1], TEST_LINES, BASE);
  assert.deepEqual(d.lines.map((l) => [l.id, l.subtotalBase]), [[21, 3000], [22, 2000]]);
});

// --- Validation -------------------------------------------------------------------

test('validation rejects bad input with status 400', () => {
  const rejects = (fn) => assert.throws(fn, (err) => err.status === 400);
  rejects(() => parseFilters({ startDate: '2026-13-01' }));
  rejects(() => parseFilters({ startDate: '2026-02-30' }));
  rejects(() => parseFilters({ startDate: '16/10/2026' }));
  rejects(() => parseFilters({ startDate: '2026-10-31', endDate: '2026-10-01' }));
  rejects(() => parseFilters({ status: 'done' }));
  rejects(() => parseFilters({ salesperson: 'abc' }));
  rejects(() => parseFilters({ customer: '-5' }));
  rejects(() => parseFilters({ status: ['confirmed', 'cancelled'] })); // given twice
  rejects(() => parseFilters({ search: 'x'.repeat(101) }));
  rejects(() => parsePagination({ limit: '101' }));
  rejects(() => parsePagination({ page: '0' }));
  rejects(() => parsePagination({ sortBy: 'name' }));
});

test('validation defaults', () => {
  assert.deepEqual(parsePagination({}), { page: 1, limit: 20, sortBy: 'orderDate', sortOrder: 'desc' });
  assert.deepEqual(parseFilters({ salesperson: 'Unassigned' }).salesperson, 'unassigned');
});
