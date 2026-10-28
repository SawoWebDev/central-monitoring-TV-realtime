import { useMemo } from 'react';
import { Outlet } from 'react-router-dom';
import { Lock } from 'lucide-react';
import Header from '../components/Header';
import Sidebar from '../components/Sidebar';
import { useToday } from '../hooks/useToday';
import { thisMonthRange, describeRange } from '../utils/dateRanges';
import { APP_TIMEZONE } from '../utils/format';

// Monitor layout: sticky header band, an optional side menu (hidden by default), the page, and a dark
// footer strip with the "how to read these numbers" notes. "Today" and the period move on by themselves
// after midnight.
export default function AppLayout() {
  const today = useToday();
  // Fixed to "This Month" for now; the global filters come in step H.
  const range = useMemo(() => thisMonthRange(today), [today]);

  return (
    <div className="flex min-h-screen flex-col">
      <Header today={today} periodText={`${range.label} · ${describeRange(range)}`} />
      <div className="flex flex-1">
        <Sidebar />
        {/* min-w-0: lets wide tables scroll inside their panels instead of pushing the page wider */}
        <main className="min-w-0 flex-1 px-4 py-4 sm:px-6 lg:px-8 2xl:px-10">
          <Outlet context={{ today, range }} />
        </main>
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 bg-neutral-950 px-4 py-2.5 text-xs text-neutral-300 sm:px-6 lg:px-8 2xl:px-10">
        {/* <p className="flex items-center gap-2">
          <Lock className="size-3.5 text-brand" aria-hidden />
          Read-only view of Odoo production, shipping and sales data · Odoo is the source of truth
        </p> */}
        <p className="flex items-center gap-2">
          <Lock className="size-3.5 text-brand" aria-hidden />
          Read-only view of Odoo production, shipping and sales data · Odoo is the source of data
        </p>
        <p>
          Sales = confirmed orders only · PHP amounts use each order's stored exchange rate (estimate, not accounting
          figures) · {APP_TIMEZONE} time
        </p>
      </footer>
    </div>
  );
}
