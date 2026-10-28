import { createXlsx, columnLetter, excelSerial } from '../../utils/xlsxWriter.js';

// Excel export of the Consolidation Order page. Laid out like the client's workbook "1_ as of 10-20 Consolidated Order
// of WWP1.xlsx" (checked cell by cell on 2026-10-26):
//   sheet "Consolidation FG"  (the pivot of the sample, written as plain cells)
//       A1 "Sum of Qty", C1 "Completion Date: ", D1 "so #", E1 "Destination"
//       row 2 = Delivery Date of each order ("TBA" when it has none), row 3 = SO number, row 4 = destination;
//       A4 "Product Code", B4 "Description"; then one row per product with the remaining quantity per order;
//       a "Grand Total" column (green) and a "Grand Total" row, both SUM formulas.
//       Column C holds the Product Category (the sample keeps it hidden and empty), so the orders still start in column D.
//       Tab colour green, Calibri 11, thin black borders, numbers centred, no merged cells, no freeze panes.
//   sheet "Details"  (the flat list "Sheet4": Destination | so # | Product Code | Description | Qty | Completion Date:)
//       plus "Ordered" and "Delivered" so that the quantity can be traced; auto-filter on the header row.
// Differences from the sample: "Desciption" (typo) is written "Description"; the destination is the Odoo country, not the
// planner's short name; the pivot's own bold headers are written as bold cells. Built from the snapshot: nothing is read
// from or written to Odoo.

const GREEN = 'C4D79B'; // "Olive Green, Accent 3, Lighter 40%" (theme colour 6, tint 0.4 in the sample; the RGB Excel shows)
const S = {
  cell: { border: 'all' },
  center: { border: 'all', align: 'center' },
  left: { border: 'all', align: 'left' },
  boldLeft: { bold: true, border: 'all', align: 'left' },
  boldCenter: { bold: true, border: 'all', align: 'center' },
  date: { bold: true, border: 'all', align: 'center', numFmtId: 14 },
  totalHead: { bold: true, fill: GREEN, border: 'noRight', align: 'left' },
  totalCell: { bold: true, fill: GREEN, border: 'noRight' },
};

// Column width: the sample's width, widened when this data has longer text (so nothing is cut off).
const fit = (min, values) => Math.max(min, ...values.map((v) => String(v ?? '').length * 0.88 + 1));

const country = (destination) => destination ?? 'No country';
const dateCell = (day, style) => (day ? { v: excelSerial(day), style } : { v: 'TBA', style: { ...style, numFmtId: 0 } });

export function buildConsolidationSheets(matrix, rows) {
  const n = matrix.columns.length;
  const firstCol = 3; // D (A product code, B description, C product category)
  const totalCol = firstCol + n; // "Grand Total" column
  const lastCol = columnLetter(totalCol - 1);
  const firstData = 5; // first product row (1-based)
  const lastData = firstData + matrix.rows.length - 1;
  const width = totalCol + 1;
  const grid = [];
  const blank = () => Array.from({ length: width }, () => ({ style: S.center })); // empty cells keep the borders; numbers are centred

  // rows 1-4: the pivot's header
  const head = [blank(), blank(), blank(), blank()];
  head[0][0] = { v: 'Sum of Qty', style: S.boldLeft };
  head[0][3] = { v: 'so #', style: S.boldCenter };
  head[0][4] = { v: 'Destination', style: S.boldCenter };
  head[3][0] = { v: 'Product Code', style: S.boldLeft };
  head[3][1] = { v: 'Description', style: S.boldLeft };
  head[3][2] = { v: 'Product Category', style: S.boldLeft };
  matrix.columns.forEach((c, i) => {
    head[1][firstCol + i] = dateCell(c.deliveryDay, S.date);
    head[2][firstCol + i] = { v: c.soNumber ?? c.so, style: S.boldCenter };
    head[3][firstCol + i] = { v: country(c.destination), style: S.boldLeft };
  });
  head[1][totalCol] = { v: 'Grand Total', style: S.totalHead };
  head[2][totalCol] = { style: S.totalHead };
  head[3][totalCol] = { style: S.totalHead };
  grid.push(...head);

  // one row per product
  matrix.rows.forEach((p, k) => {
    const r = blank();
    const row = firstData + k;
    r[0] = { v: p.code, style: S.cell };
    r[1] = { v: p.name, style: S.cell };
    r[2] = { v: p.category, style: S.cell };
    p.cells.forEach((q, i) => {
      if (q !== null) r[firstCol + i] = { v: q, style: S.center };
    });
    r[totalCol] = { f: `SUM(D${row}:${lastCol}${row})`, v: p.total, style: S.totalCell };
    grid.push(r);
  });

  // Grand Total row
  const total = blank();
  total[0] = { v: 'Grand Total', style: S.boldLeft };
  matrix.columns.forEach((c, i) => {
    const col = columnLetter(firstCol + i);
    total[firstCol + i] = matrix.rows.length
      ? { f: `SUM(${col}${firstData}:${col}${lastData})`, v: c.total, style: S.boldCenter }
      : { v: 0, style: S.boldCenter };
  });
  total[totalCol] = matrix.rows.length
    ? { f: `SUM(${columnLetter(totalCol)}${firstData}:${columnLetter(totalCol)}${lastData})`, v: matrix.grandTotal, style: S.totalCell }
    : { v: 0, style: S.totalCell };
  grid.push(total);

  const widths = [13.7109375, fit(73.42578125, matrix.rows.map((p) => p.name)), fit(18, matrix.rows.map((p) => p.category)), ...matrix.columns.map(() => 19.140625), 11.28515625];

  // the flat list
  const details = [
    ['Destination', 'so #', 'Product Code', 'Description', 'Product Category', 'Qty', 'Completion Date:', 'Ordered', 'Delivered', 'Source', 'MO', 'MO state'].map((v) => ({ v, style: S.boldLeft })),
    ...rows.map((r) => [
      { v: country(r.destination), style: S.cell },
      { v: soCell(r), style: S.cell },
      { v: r.productCode, style: S.cell },
      { v: r.productName, style: S.cell },
      { v: r.category, style: S.cell },
      { v: r.remainingQty, style: S.cell },
      dateCell(r.deliveryDay, { border: 'all', numFmtId: 14 }),
      { v: r.orderedQty, style: S.cell },
      { v: r.deliveredQty, style: S.cell },
      { v: r.source === 'mo' ? 'Manufacturing order' : 'Order line', style: S.cell },
      { v: r.moReference ?? '', style: S.cell },
      { v: r.moState ?? '', style: S.cell },
    ]),
  ];

  return [
    { name: 'Consolidation FG', tabColor: 'FF00B050', widths, rows: grid },
    {
      name: 'Details',
      widths: [fit(18.28515625, rows.map((r) => country(r.destination))), fit(6, rows.map((r) => r.so)), fit(20.42578125, rows.map((r) => r.productCode)), fit(76.140625, rows.map((r) => r.productName)), fit(18, rows.map((r) => r.category)), 9, 13.140625, 9, 10, 20, fit(16, rows.map((r) => r.moReference)), 11],
      autoFilter: `A1:L${details.length}`,
      rows: details,
    },
  ];
}

// "S09259" -> 9259 like the Excel; anything else stays text
function soCell(row) {
  const m = /^S0*(\d+)$/.exec(row.so ?? '');
  return m ? Number(m[1]) : row.so;
}

export const consolidationWorkbook = (matrix, rows) => createXlsx(buildConsolidationSheets(matrix, rows));

export const consolidationFileName = (today) => `Consolidation_Order_${today}.xlsx`;
