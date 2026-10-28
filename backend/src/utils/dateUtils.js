// Date helpers.
// Odoo stores datetimes in UTC. All business dates (filters, chart buckets) use the app
// timezone (APP_TIMEZONE, e.g. Asia/Manila). Dates are kept as "YYYY-MM-DD" strings,
// which compare and sort correctly as plain text.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;
const formatters = new Map();
const localDateCache = new Map();

function formatterFor(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    // The en-CA locale formats dates as YYYY-MM-DD.
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

// "2026-10-15T16:30:00Z" in Asia/Manila -> "2026-10-16"
export function toLocalDate(iso, timeZone) {
  if (!iso) return null;
  const cacheKey = `${timeZone}|${iso}`;
  let value = localDateCache.get(cacheKey);
  if (value === undefined) {
    if (localDateCache.size > 100_000) localDateCache.clear();
    const d = new Date(iso);
    value = Number.isNaN(d.getTime()) ? null : formatterFor(timeZone).format(d);
    localDateCache.set(cacheKey, value);
  }
  return value;
}

export function todayLocal(timeZone, now = new Date()) {
  return formatterFor(timeZone).format(now);
}

function toUtcMs(dateStr) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtcMs(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

// True for real calendar dates only ("2026-02-30" is rejected).
export function isValidDate(value) {
  return typeof value === 'string' && DATE_RE.test(value) && fromUtcMs(toUtcMs(value)) === value;
}

export function addDays(dateStr, days) {
  return fromUtcMs(toUtcMs(dateStr) + days * DAY_MS);
}

export function daysBetween(from, to) {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

// How far the timezone is ahead of UTC at a given moment, in ms (Manila: +8 h).
function timezoneOffsetMs(ms, timeZone) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value])
  );
  const asUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  return asUtc - ms;
}

// Midnight at the start of a local date, as a UTC ISO string.
// "2026-10-01" in Asia/Manila -> "2026-09-30T16:00:00.000Z"
export function localMidnightToUtcIso(dateStr, timeZone) {
  const guess = toUtcMs(dateStr);
  return new Date(guess - timezoneOffsetMs(guess, timeZone)).toISOString();
}

// The chart bucket a local date belongs to:
// day -> "2026-10-16", week -> the Monday "2026-10-12", month -> "2026-10"
export function bucketKey(dateStr, granularity) {
  if (granularity === 'month') return dateStr.slice(0, 7);
  if (granularity === 'week') {
    const weekday = new Date(toUtcMs(dateStr)).getUTCDay(); // 0 = Sunday
    return addDays(dateStr, -((weekday + 6) % 7));
  }
  return dateStr;
}
