// Unit tests for the one-order Excel export. ALL DATA HERE IS MADE-UP TEST DATA, not company data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateRawSync } from 'node:zlib';
import { createXlsx } from '../src/utils/xlsxWriter.js';
import { buildOrderSheets, htmlToText, orderFileName, orderWorkbook } from '../src/services/orderExport.js';

// Reads the ZIP back (central directory), checks every CRC and returns { fileName: text }.
function unzip(buf) {
  const end = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = buf.readUInt16LE(end + 10);
  let p = buf.readUInt32LE(end + 16);
  const out = {};
  for (let i = 0; i < count; i += 1) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50);
    const crc = buf.readUInt32LE(p + 16);
    const size = buf.readUInt32LE(p + 20);
    const rawSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    const dataStart = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    const raw = inflateRawSync(buf.subarray(dataStart, dataStart + size));
    assert.equal(raw.length, rawSize);
    // CRC-32 check with a bit-by-bit calculation (independent of the writer's table)
    let c = 0xffffffff;
    for (const b of raw) { c ^= b; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; }
    assert.equal((c ^ 0xffffffff) >>> 0, crc, `CRC of ${name}`);
    out[name] = raw.toString('utf8');
    p += 46 + nameLen;
  }
  return out;
}

const ORDER = {
  reference: 'S00001', state: 'sale', orderDate: '2026-10-01 01:02:03', totalCbm: 0.07156,
  customer: 'TEST Customer & <Co>', deliveryAddress: 'TEST Customer & <Co>, Site 1', pricelist: 'TEST Pricelist (EUR)', paymentTerms: 'TEST Terms', totalAmount: 626.4,
  shipTo: { name: 'Site 1', street: '1 Test St', city: 'Testville', country: 'Testland', email: 'a@test.example', note: '' },
  messages: [
    { date: '2026-10-01 01:00:00', author: 'TEST Author', type: 'notification', text: 'Sales Order created', attachments: 0 },
    { date: '2026-10-01 02:00:00', author: 'TEST Author', type: 'notification', text: '', attachments: 0 },
    { date: '2026-10-01 03:00:00', author: 'TEST Author', type: 'comment', text: 'Line 1\r\nLine 2', attachments: 2 },
  ],
  lines: [
    { reference: 'T-1', name: 'TEST Heater', qty: 6, cbm: 0.00756 },
    { reference: '', name: 'TEST Fee (no product reference)', qty: 1, cbm: 0 },
  ],
};

test('xlsx file: valid ZIP, sheet names, escaped text, numbers and styles', () => {
  const files = unzip(orderWorkbook(ORDER));
  assert.ok(files['[Content_Types].xml'] && files['xl/workbook.xml'] && files['xl/styles.xml']);
  assert.match(files['xl/workbook.xml'], /name="SO Overview".*name="Delivery Address".*name="Order Lines".*name="Log Messages"/s);
  assert.match(files['xl/worksheets/sheet1.xml'], /TEST Customer &amp; &lt;Co&gt;/); // XML-escaped
  assert.match(files['xl/worksheets/sheet1.xml'], /<c r="A1" s="1" t="inlineStr">/); // header style
  assert.match(files['xl/worksheets/sheet3.xml'], /<c r="E2"><v>0.00756<\/v><\/c>/); // a real number, not text
});

test('layout follows the SO 9259 reference, including the money rows', () => {
  const [overview, address, lines] = buildOrderSheets(ORDER);
  const text = (rows) => rows.map((r) => r.map((c) => (c && typeof c === 'object' ? c.v : c)));
  assert.deepEqual(text(overview.rows).map((r) => r[0]), ['Field', 'SO Number', 'Status', 'Order Date', 'Customer', 'Delivery Address', 'Pricelist', 'Payment Terms', 'Total Amount']);
  assert.deepEqual(text(overview.rows)[8], ['Total Amount', 626.4]); // a number, in the order's currency
  assert.deepEqual(text(address.rows).map((r) => r[0]), ['Field', 'Name', 'Street', 'City', 'Country', 'Email', 'Internal Note']);
  assert.deepEqual(text(lines.rows)[0], ['#', 'Product Reference', 'Product Name', 'Qty', 'Total CBM']);
  assert.deepEqual(text(lines.rows)[2], [2, '', 'TEST Fee (no product reference)', 1, 0]);
  assert.deepEqual(lines.rows[3], []); // blank row before TOTAL, as in the reference
  assert.deepEqual(text(lines.rows)[4], [null, null, 'TOTAL', 7, 0.0716]); // qty summed, CBM = order total to 4 decimals
  assert.equal(overview.widths[0], 22);
});

test('columns are widened for long text, never narrower than the reference', () => {
  const long = { ...ORDER, lines: [{ reference: 'X', name: 'N'.repeat(120), qty: 1, cbm: 0 }] };
  const widths = buildOrderSheets(long)[2].widths;
  assert.ok(widths[2] > 67.4);
  assert.ok(widths[1] >= 16.7);
});

test('file name and bad characters', () => {
  assert.equal(orderFileName('S09259'), 'SO 9259.xlsx');
  assert.equal(orderFileName('A/B:C'), 'A_B_C.xlsx');
  assert.equal(createXlsx([{ name: 'a:b/c', rows: [['x\u0001y']] }]).length > 0, true); // illegal sheet-name / XML characters
});

test('Log Messages sheet: header, one row per message, empty text and zero attachments stay empty', () => {
  const sheet = buildOrderSheets(ORDER)[3];
  assert.equal(sheet.name, 'Log Messages');
  const text = sheet.rows.map((r) => r.map((c) => (c && typeof c === 'object' ? c.v : c)));
  assert.deepEqual(text[0], ['Date', 'Author', 'Type', 'Message', 'Attachments']);
  assert.deepEqual(text[1], ['2026-10-01 01:00:00', 'TEST Author', 'notification', 'Sales Order created', null]);
  assert.deepEqual(text[2], ['2026-10-01 02:00:00', 'TEST Author', 'notification', '', null]);
  assert.deepEqual(text[3], ['2026-10-01 03:00:00', 'TEST Author', 'comment', 'Line 1\r\nLine 2', 2]);
  assert.equal(buildOrderSheets({ ...ORDER, messages: [] })[3].rows.length, 1); // header only
});

test('htmlToText: tags, mentions, line breaks and entities', () => {
  assert.equal(htmlToText('<p>Sales Order created</p>'), 'Sales Order created');
  assert.equal(htmlToText(''), '');
  assert.equal(htmlToText(null), '');
  const mention = '<span><a href="https://x.example/#id=1&amp;a=2" class="o_mail_redirect">@TEST One</a> <br><br>Please check<br>By air</span>';
  assert.equal(htmlToText(mention), '@TEST One \r\nPlease check\r\nBy air'); // double <br> = one line break
  assert.equal(htmlToText('<p>A &amp; B &lt;ok&gt; &#39;q&#39; &nbsp;x</p>'), "A & B <ok> 'q'  x");
});
