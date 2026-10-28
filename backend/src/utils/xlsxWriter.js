import { deflateRawSync } from 'node:zlib';

// Minimal .xlsx (Excel) file builder, so the exports need no extra library and never touch Odoo.
// An .xlsx is a ZIP of XML files; this writes only what we need: several sheets, text / number / formula cells,
// column widths (and hidden columns), a tab colour, an auto-filter and a small set of cell styles.
//
// sheets: [{ name, widths: [number], hiddenCols: [1-based column numbers], tabColor: 'FF00B050',
//            autoFilter: 'A1:F20', rows: [[cell]] }]
//   cell: undefined/null (empty) | string | number | { v, f, style }
//     v     = the value (string or number); with f it is the cached result shown before Excel recalculates
//     f     = a formula without the leading "=" (e.g. "SUM(D5:D9)")
//     style = 'header' | 'bold'                       (the two styles of the "SO 9259" sample)
//           | { bold, fill: 'RRGGBB', border: 'all' | 'noRight', align: 'left' | 'center' | 'right', numFmtId }
//             (numFmtId 14 = the date format m/d/yyyy; dates are written as Excel serial numbers, see excelSerial)
// A row may be an empty array (blank row).

// Fixed positions (the same as the reference file "SO 9259.xlsx", which the single-order export follows)
const STYLE_INDEX = { header: 1, bold: 2 };
const BORDER_INDEX = { all: 1, noRight: 2 };

const xmlEscape = (s) =>
  String(s)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '') // characters XML does not allow
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

export function columnLetter(index) {
  let n = index + 1;
  let letters = '';
  while (n > 0) {
    const rest = (n - 1) % 26;
    letters = String.fromCharCode(65 + rest) + letters;
    n = Math.floor((n - 1) / 26);
  }
  return letters;
}

// "2026-10-29" -> 46324 (days since 1899-12-30, how Excel stores dates)
export function excelSerial(isoDate) {
  const [y, m, d] = isoDate.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 86_400_000 + 25569;
}

// --- Cell styles ------------------------------------------------------------------------------
// One registry per workbook: every distinct style object becomes one <xf> in styles.xml.
function createStyles() {
  const extraFills = []; // fill colours after the 3 fixed fills
  const extraXfs = []; // <xf> elements after the 3 fixed ones
  const index = new Map();

  const fillId = (rgb) => {
    let i = extraFills.indexOf(rgb);
    if (i < 0) i = extraFills.push(rgb) - 1;
    return 3 + i;
  };

  return {
    // The xf index for a cell's style (undefined = the default style, no s attribute needed)
    of(style) {
      if (!style) return undefined;
      if (typeof style === 'string') return STYLE_INDEX[style];
      const key = JSON.stringify([!!style.bold, style.fill ?? null, style.border ?? null, style.align ?? null, style.numFmtId ?? 0]);
      if (!index.has(key)) {
        const numFmtId = style.numFmtId ?? 0;
        const font = style.bold ? 2 : 0;
        const fill = style.fill ? fillId(style.fill) : 0;
        const border = BORDER_INDEX[style.border] ?? 0;
        const align = style.align ? `<alignment horizontal="${style.align}"/>` : '';
        extraXfs.push(
          `<xf numFmtId="${numFmtId}" fontId="${font}" fillId="${fill}" borderId="${border}" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"${align ? ' applyAlignment="1">' + align + '</xf>' : '/>'}`
        );
        index.set(key, 3 + extraXfs.length - 1);
      }
      return index.get(key);
    },

    // styles.xml: the fixed part is the same as the reference file's (fonts, the near-black header fill, 3 cell formats)
    xml() {
      const thin = '<color indexed="64"/>';
      return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
        '<fonts count="3">' +
        '<font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>' + // no theme file, so Calibri is set directly
        '<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>' +
        '<font><b/><sz val="11"/><name val="Calibri"/><family val="2"/></font>' +
        '</fonts>' +
        `<fills count="${3 + extraFills.length}"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
        '<fill><patternFill patternType="solid"><fgColor rgb="FF1A1A1A"/><bgColor rgb="FF1A1A1A"/></patternFill></fill>' +
        extraFills.map((rgb) => `<fill><patternFill patternType="solid"><fgColor rgb="FF${rgb}"/><bgColor indexed="64"/></patternFill></fill>`).join('') +
        '</fills>' +
        '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>' +
        `<border><left style="thin">${thin}</left><right style="thin">${thin}</right><top style="thin">${thin}</top><bottom style="thin">${thin}</bottom><diagonal/></border>` +
        `<border><left style="thin">${thin}</left><right/><top style="thin">${thin}</top><bottom style="thin">${thin}</bottom><diagonal/></border>` +
        '</borders>' +
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
        `<cellXfs count="${3 + extraXfs.length}">` +
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
        '<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/>' +
        '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
        extraXfs.join('') +
        '</cellXfs>' +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
        '</styleSheet>'
      );
    },
  };
}

function cellXml(cell, ref, styles) {
  if (cell === undefined || cell === null || cell === '') return '';
  const { v, f, style } = typeof cell === 'object' ? cell : { v: cell, f: undefined, style: null };
  const idx = styles.of(style);
  const s = idx === undefined ? '' : ` s="${idx}"`;
  if (f) return `<c r="${ref}"${s}><f>${xmlEscape(f)}</f>${typeof v === 'number' && Number.isFinite(v) ? `<v>${v}</v>` : ''}</c>`;
  if (v === undefined || v === null || v === '') return idx === undefined ? '' : `<c r="${ref}"${s}/>`; // an empty cell that still has a style (borders / fill)
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${s}><v>${v}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`;
}

function sheetXml({ widths = [], hiddenCols = [], tabColor, autoFilter, rows }, styles) {
  const cols = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${hiddenCols.includes(i + 1) ? ' hidden="1"' : ''}/>`).join('')}</cols>`
    : '';
  const body = rows
    .map((row, r) => {
      const cells = row.map((cell, c) => cellXml(cell, `${columnLetter(c)}${r + 1}`, styles)).join('');
      return cells ? `<row r="${r + 1}">${cells}</row>` : '';
    })
    .join('');
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    (tabColor ? `<sheetPr><tabColor rgb="${tabColor}"/></sheetPr>` : '') +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    `${cols}<sheetData>${body}</sheetData>` +
    (autoFilter ? `<autoFilter ref="${autoFilter}"/>` : '') +
    '<pageMargins left="0.75" right="0.75" top="1" bottom="1" header="0.5" footer="0.5"/></worksheet>'
  );
}

// --- ZIP container ---------------------------------------------------------------------------
const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function zip(files) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const { name, text } of files) {
    const nameBuf = Buffer.from(name, 'utf8');
    const raw = Buffer.from(text, 'utf8');
    const data = deflateRawSync(raw);
    const crc = crc32(raw);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(0x0800, 6); // file names are UTF-8
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    parts.push(local, nameBuf, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(data.length, 20);
    entry.writeUInt32LE(raw.length, 24);
    entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const centralBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(centralBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, centralBuf, end]);
}

// Sheet names: Excel allows 31 characters and none of  : \ / ? * [ ]
const sheetName = (name) => name.replace(/[:\\/?*[\]]/g, ' ').slice(0, 31);

export function createXlsx(sheets) {
  const R = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const styles = createStyles();
  const sheetFiles = sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s, styles) })); // first, so the styles are known
  const files = [
    {
      name: '[Content_Types].xml',
      text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        sheets
          .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
          .join('') +
        '</Types>',
    },
    {
      name: '_rels/.rels',
      text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        `<Relationship Id="rId1" Type="${R}/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    },
    {
      name: 'xl/workbook.xml',
      text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        `<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="${R}"><sheets>` +
        sheets.map((s, i) => `<sheet name="${xmlEscape(sheetName(s.name))}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') +
        '</sheets></workbook>',
    },
    {
      name: 'xl/_rels/workbook.xml.rels',
      text:
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${R}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
        `<Relationship Id="rId${sheets.length + 1}" Type="${R}/styles" Target="styles.xml"/></Relationships>`,
    },
    { name: 'xl/styles.xml', text: styles.xml() },
    ...sheetFiles,
  ];
  return zip(files);
}
