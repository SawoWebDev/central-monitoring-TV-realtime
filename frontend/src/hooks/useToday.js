import { useEffect, useState } from 'react';
import { todayInAppTimezone } from '../utils/format';

// Today's date ("YYYY-MM-DD", business timezone), re-checked every minute.
// A wall monitor runs for days, so "today" and "this month" must move on by themselves after midnight.
export function useToday() {
  const [today, setToday] = useState(todayInAppTimezone);
  useEffect(() => {
    const timer = setInterval(() => setToday(todayInAppTimezone()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return today;
}
