// Unit tests for the operations period helpers. No Odoo access, no company data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localMidnightToUtcIso } from '../src/utils/dateUtils.js';
import { periodStart } from '../src/services/operationsService.js';

const TZ = 'Asia/Manila'; // UTC+8, no daylight saving

test('local midnight in Manila is 16:00 UTC the previous day', () => {
  assert.equal(localMidnightToUtcIso('2026-10-01', TZ), '2026-09-30T16:00:00.000Z');
  assert.equal(localMidnightToUtcIso('2026-01-01', 'UTC'), '2026-01-01T00:00:00.000Z');
});

test('period start: today, Monday of this week, 1st of this month, earliest of the two', () => {
  // Friday 16 Oct 2026, 10:00 in Manila
  const p = periodStart(TZ, new Date('2026-10-16T02:00:00Z'));
  assert.equal(p.today, '2026-10-16');
  assert.equal(p.weekStart, '2026-10-12');
  assert.equal(p.monthStart, '2026-10-01');
  assert.equal(p.earliest, '2026-10-01');
  assert.equal(p.earliestUtc, '2026-09-30T16:00:00.000Z');

  // Friday 2 Oct 2026: the week started on Monday 28 Sep, before the month
  const early = periodStart(TZ, new Date('2026-10-02T02:00:00Z'));
  assert.equal(early.earliest, '2026-09-28');
});

test('just after midnight in Manila already counts as the next day', () => {
  // 1 Nov 2026 00:30 in Manila = 31 Oct 16:30 UTC
  const p = periodStart(TZ, new Date('2026-10-31T16:30:00Z'));
  assert.equal(p.today, '2026-11-01');
  assert.equal(p.monthStart, '2026-11-01');
});
