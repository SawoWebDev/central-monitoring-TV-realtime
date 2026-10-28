// Unit tests for the CSV cell writer. ALL DATA IN THIS FILE IS MADE-UP TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { csvCell } from '../src/utils/csv.js';
import { openOrdersCsv } from '../src/services/openOrders.js';

test('csvCell: quotes, doubled quotes, empty values and numbers', () => {
  assert.equal(csvCell('TEST Acme'), '"TEST Acme"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell(null), '""');
  assert.equal(csvCell(undefined), '""');
  assert.equal(csvCell(0), '"0"');
  assert.equal(csvCell(-2.5), '"-2.5"'); // a number is not text: no ' in front
  assert.equal(csvCell('2026-10-27'), '"2026-10-27"');
});

test('csvCell: text that a spreadsheet would run as a formula gets a leading apostrophe', () => {
  assert.equal(csvCell('=HYPERLINK("http://x","Click")'), `"'=HYPERLINK(""http://x"",""Click"")"`);
  assert.equal(csvCell('+1+1'), `"'+1+1"`);
  assert.equal(csvCell('-2+3'), `"'-2+3"`);
  assert.equal(csvCell('@SUM(A1)'), `"'@SUM(A1)"`);
  assert.equal(csvCell('\tcmd'), `"'\tcmd"`);
  assert.equal(csvCell('a=b'), '"a=b"'); // only the FIRST character matters
});

test('the open orders CSV uses it for every cell', () => {
  const order = {
    reference: 'TEST-S1', customerName: '=EVIL()', orderDate: '2026-10-01T02:00:00Z', commitmentDate: null, deliveryStatus: 'pending', stage: 'waiting_production',
    orderCbm: 1, remainingCbm: 1, remainingQty: 2, daysOpen: 3, late: false,
  };
  const csv = openOrdersCsv([order], 'Asia/Manila').split('\r\n');
  assert.ok(csv[1].includes(`"'=EVIL()"`));
  assert.ok(!csv[1].includes(',"=EVIL()"'));
});
