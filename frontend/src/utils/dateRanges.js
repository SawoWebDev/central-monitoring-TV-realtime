import { formatDay, todayInAppTimezone } from './format';

// "This Month": from the 1st of the current month up to today (Manila time).
// More presets (Today, This Week, Custom...) come with the global filters (step H).
export function thisMonthRange(today = todayInAppTimezone()) {
  return { label: 'This Month', startDate: `${today.slice(0, 8)}01`, endDate: today };
}

// "1 Oct – 16 Oct 2026"
export function describeRange({ startDate, endDate }) {
  if (startDate === endDate) return formatDay(startDate);
  return `${formatDay(startDate, { day: 'numeric', month: 'short' })} – ${formatDay(endDate)}`;
}
