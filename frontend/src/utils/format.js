// Formatting helpers. All dates and times are shown in the business timezone (Asia/Manila),
// matching how the backend groups and filters dates.
export const APP_TIMEZONE = import.meta.env.VITE_APP_TIMEZONE || 'Asia/Manila';

const LOCALE = 'en-PH';

const phpFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const phpCompactFormat = new Intl.NumberFormat(LOCALE, {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1,
});
const numberFormat = new Intl.NumberFormat(LOCALE);

export const formatPHP = (value) => (value == null ? '—' : phpFormat.format(value));
export const formatPHPCompact = (value) => (value == null ? '—' : phpCompactFormat.format(value));
export const formatNumber = (value) => (value == null ? '—' : numberFormat.format(value));

// A real moment in time (ISO UTC from the backend), shown in Manila time.
export function formatDateTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(LOCALE, {
    timeZone: APP_TIMEZONE,
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(iso));
}

export function formatDate(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: APP_TIMEZONE, dateStyle: 'medium' }).format(new Date(iso));
}

export function formatTime(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: APP_TIMEZONE, timeStyle: 'short' }).format(new Date(iso));
}

// Time with seconds, e.g. "10:54:34 AM" (the header clock).
export function formatTimeWithSeconds(iso) {
  if (!iso) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: APP_TIMEZONE, timeStyle: 'medium' }).format(new Date(iso));
}

// A business date that is already a "YYYY-MM-DD" string. Formatted in UTC so it never shifts a day.
export function formatDay(dateStr, options = { day: 'numeric', month: 'short', year: 'numeric' }) {
  if (!dateStr) return '—';
  return new Intl.DateTimeFormat(LOCALE, { timeZone: 'UTC', ...options }).format(
    new Date(`${dateStr}T00:00:00Z`)
  );
}

// Today's date in the business timezone, as "YYYY-MM-DD".
export function todayInAppTimezone() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

// Cubic meters, e.g. "34.9 m³" (one decimal; "0 m³" for nothing).
const cbmFormat = new Intl.NumberFormat(LOCALE, { maximumFractionDigits: 1 });
export const formatCbm = (value) => (value == null ? '—' : `${cbmFormat.format(value)} m³`);

// The business timezone as shown next to the clock: { city: "Manila", offset: "UTC+8" }.
// Both parts come from APP_TIMEZONE, so the label always matches the times on the screen.
export function timezoneLabel(date = new Date()) {
  const city = APP_TIMEZONE.split('/').pop().replace(/_/g, ' ');
  const part = new Intl.DateTimeFormat('en-US', { timeZone: APP_TIMEZONE, timeZoneName: 'shortOffset' })
    .formatToParts(date)
    .find((p) => p.type === 'timeZoneName');
  const offset = part ? part.value.replace('GMT', 'UTC') : '';
  return { city, offset: offset === 'UTC' ? 'UTC+0' : offset };
}
