// Odoo returns a many2one field as [id, "name"], or false when it is empty.
export const m2oId = (value) => (Array.isArray(value) ? value[0] : null);
export const m2oName = (value) => (Array.isArray(value) ? value[1] : null);

// Odoo datetimes look like "2026-10-16 02:41:24" and are in UTC.
// We convert them to ISO format ("2026-10-16T02:41:24Z") so they are unambiguous.
// The other direction, for search filters: "2026-09-30T16:00:00.000Z" -> "2026-09-30 16:00:00" (UTC)
export function isoToOdooDate(iso) {
  return iso.slice(0, 19).replace('T', ' ');
}

export function odooDateToIso(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.length === 10) return `${value}T00:00:00Z`; // date only
  return `${value.replace(' ', 'T')}Z`;
}