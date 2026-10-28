// Unit tests for the order-status panels (counts only).
// ALL DATA IN THIS FILE IS MADE-UP TEST DATA. It is not company data and is never shown on the dashboard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  statusCounts,
  deliveryStatusCounts,
  lateOrders,
  withExpectedDate,
  quotationAging,
} from '../src/services/orderStatusAnalytics.js';

const TZ = 'Asia/Manila';
const NOW = new Date('2026-10-16T02:00:00Z'); // Fri 16 Oct 2026, 10:00 in Manila

const order = (o) => ({ customerName: `TEST Customer ${o.id}`, salespersonName: 'TEST Seller', ...o });

const TEST_ORDERS = [
  // confirmed, not delivered, promised 10 Oct -> 6 days late
  order({ id: 1, reference: 'TEST-S1', status: 'confirmed', deliveryStatus: 'pending', commitmentDate: '2026-10-10T00:00:00Z' }),
  // confirmed, partly delivered; promised 30 Sep 16:30 UTC = 1 Oct 00:30 in Manila -> 15 days late (timezone boundary)
  order({ id: 2, reference: 'TEST-S2', status: 'confirmed', deliveryStatus: 'partial', commitmentDate: '2026-09-30T16:30:00Z' }),
  // confirmed, fully delivered: never late
  order({ id: 3, reference: 'TEST-S3', status: 'confirmed', deliveryStatus: 'full', commitmentDate: '2026-10-01T00:00:00Z' }),
  // confirmed, nothing to deliver (no delivery status): never late
  order({ id: 4, reference: 'TEST-S4', status: 'confirmed', deliveryStatus: null, commitmentDate: '2026-10-01T00:00:00Z' }),
  // confirmed, promised in the future: not late
  order({ id: 5, reference: 'TEST-S5', status: 'confirmed', deliveryStatus: 'started', commitmentDate: '2026-10-20T00:00:00Z' }),
  // confirmed, no promised date: not late
  order({ id: 6, reference: 'TEST-S6', status: 'confirmed', deliveryStatus: 'started', commitmentDate: null }),
  // open quotations
  order({ id: 7, reference: 'TEST-Q7', status: 'quotation', orderDate: '2026-10-12T00:00:00Z', validityDate: '2026-10-20' }), // 4 days
  order({ id: 8, reference: 'TEST-Q8', status: 'quotation_sent', orderDate: '2026-09-01T00:00:00Z', validityDate: '2026-10-15' }), // 45 days, expired
  order({ id: 9, reference: 'TEST-Q9', status: 'quotation', orderDate: '2026-06-01T00:00:00Z', validityDate: '2026-07-01' }), // 137 days, expired
  order({ id: 10, reference: 'TEST-Q10', status: 'quotation', orderDate: '2026-10-01T00:00:00Z', validityDate: null }), // 15 days
  order({ id: 12, reference: 'TEST-Q12', status: 'quotation', orderDate: '2026-10-09T00:00:00Z', validityDate: '2026-10-16' }), // 7 days, expires today (not expired)
  // cancelled
  order({ id: 11, reference: 'TEST-C11', status: 'cancelled' }),
];

test('A. status counts and cancellation rate', () => {
  assert.deepEqual(statusCounts(TEST_ORDERS), {
    total: 12,
    quotation: 4,
    quotation_sent: 1,
    confirmed: 6,
    cancelled: 1,
    cancellationRate: 8.3, // 1 of 12
  });
  assert.equal(statusCounts([]).cancellationRate, null);
});

test('H. delivery status counts confirmed orders only', () => {
  assert.deepEqual(deliveryStatusCounts(TEST_ORDERS), {
    confirmed: 6,
    pending: 1,
    started: 2,
    partial: 1,
    full: 1,
    noDelivery: 1,
  });
});

test('I. late orders: past promised date, not fully delivered, most late first', () => {
  const r = lateOrders(TEST_ORDERS, TZ, { now: NOW });
  assert.equal(r.total, 2);
  assert.deepEqual(
    r.items.map((o) => [o.reference, o.daysLate, o.deliveryStatus]),
    [
      ['TEST-S2', 15, 'partial'],
      ['TEST-S1', 6, 'pending'],
    ]
  );
  assert.deepEqual(r.byDelivery, { pending: 1, started: 0, partial: 1 });
  assert.equal(lateOrders(TEST_ORDERS, TZ, { now: NOW, limit: 1 }).items.length, 1);
  assert.equal(lateOrders(TEST_ORDERS, TZ, { now: NOW, limit: 1 }).total, 2); // total is not cut by the limit
});

test('E. quotation aging buckets, expired count and oldest', () => {
  const r = quotationAging(TEST_ORDERS, TZ, { now: NOW });
  assert.equal(r.open, 5);
  assert.equal(r.expired, 2); // Q8 and Q9; Q12 expires today, so it is not expired yet
  assert.deepEqual(
    r.buckets.map((b) => [b.key, b.count]),
    [
      ['0-7', 2], // Q7 (4 days), Q12 (7 days)
      ['8-30', 1], // Q10 (15 days)
      ['31-90', 1], // Q8 (45 days)
      ['90+', 1], // Q9 (137 days)
    ]
  );
  assert.deepEqual(r.oldest, { reference: 'TEST-Q9', customerName: 'TEST Customer 9', days: 137 });
});

test('late orders: Expected Date is joined from the open sales orders, null when unknown', () => {
  // TEST DATA
  const items = [{ id: 1, reference: 'TEST-A' }, { id: 2, reference: 'TEST-B' }, { id: 3, reference: 'TEST-C' }];
  const open = [{ id: 1, expectedDate: '2026-10-16T05:17:32Z' }, { id: 2, expectedDate: null }];
  assert.deepEqual(withExpectedDate(items, open).map((o) => o.expectedDate), ['2026-10-16T05:17:32Z', null, null]);
  assert.deepEqual(withExpectedDate(items).map((o) => o.expectedDate), [null, null, null]); // operations data not ready
});
