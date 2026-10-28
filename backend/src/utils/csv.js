// One cell of a CSV file, always in quotes.
// Spreadsheet programs run text that starts with = + - @ (or a tab / carriage return) as a FORMULA when the file is
// opened, so a customer or product name like "=HYPERLINK(...)" could do harm. Such text gets a ' in front, which makes
// Excel show it as plain text. Numbers are written as they are (a negative number is not text).
export function csvCell(value) {
  let text = String(value ?? '');
  if (typeof value === 'string' && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}
