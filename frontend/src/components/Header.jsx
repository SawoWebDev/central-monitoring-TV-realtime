import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock as ClockIcon, Loader2, PanelLeftClose, PanelLeftOpen, RefreshCw } from 'lucide-react';
import Logo from './Logo';
import { useApi } from '../hooks/useApi';
import { requestActivity } from '../services/api';
import { useRequestActivity } from '../hooks/useRequestActivity';
import { useRefresh } from '../context/refreshContext';
import { useDisplay } from '../context/displayContext';
import { formatDate, formatDay, formatTime, formatTimeWithSeconds, timezoneLabel } from '../utils/format';

// Manual Refresh button switch. false = "read-only" display for the wall monitor: the button is still
// shown (with the spinner and the countdown to the next automatic refresh) but cannot be clicked.
// The data keeps refreshing automatically. Set to true to make the button clickable again.
const MANUAL_REFRESH_ENABLED = false;

// Header: logo and title on white (left); a black band with a rounded inner corner (right) holding
// the connection status, last sync, Refresh button and clock. A SAWO red line runs underneath.
// periodText: what the dashboard is showing, e.g. "This Month · 1 Oct – 16 Oct 2026".
export default function Header({ periodText, today }) {
  const { refresh } = useRefresh();
  const { sidebarOpen, setSidebarOpen } = useDisplay();
  const busy = useRequestActivity();
  const headerRef = useRef(null);

  // Publish the header's real height as the CSS variable --header-h (it changes with the screen width),
  // so the side menu can sit exactly under the sticky header.
  useEffect(() => {
    const el = headerRef.current;
    const observer = new ResizeObserver(() => document.documentElement.style.setProperty('--header-h', `${el.offsetHeight}px`));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  const status = useApi('/sync/status'); // sales data sync
  const ops = useApi('/operations/status'); // production / shipping data sync

  // While the backend is still doing a first sync (or can't be reached), ask again every
  // 5 seconds so the page fills in by itself instead of waiting for a manual Refresh.
  const waitingForData =
    (!status.loading && (status.data?.connection === 'connecting' || (status.error && !status.data))) ||
    (!ops.loading && ops.data?.connection === 'connecting');
  useEffect(() => {
    if (!waitingForData) return;
    // Every 5 seconds, but never while requests are still running: a refresh cancels them and starts everything again
    // (the normal 30-second refresh skips busy moments the same way).
    const timer = setInterval(() => {
      if (requestActivity.getSnapshot() === 0) refresh();
    }, 5000);
    return () => clearInterval(timer);
  }, [waitingForData, refresh]);

  return (
    // Below xl (1280px) the header is two rows: title on top, black band full width underneath.
    // From xl up it is one row: title takes the free space, the band keeps its natural size on the right.
    // Sticky: stays at the top while the page scrolls (the page itself is the scroller, nothing inside it).
    // z-40 keeps it above the panels' own sticky table headers (z-10) and chart tooltips.
    // Wide screens (QHD, ultrawide, 4K): the content is capped at 2000px (= the dashboard's 1920px + its padding)
    // so logo and clock line up with the panels below; .header-bg keeps white/black running to the screen edges.
    <header ref={headerRef} className="header-bg sticky top-0 z-40 border-b-4 border-brand">
      <div className="mx-auto flex max-w-[2000px] flex-col xl:flex-row xl:items-stretch">
        <div className="flex min-w-0 items-center gap-3 bg-white px-4 py-3 sm:gap-4 sm:px-6 lg:px-8 xl:flex-1 2xl:px-10">
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-expanded={sidebarOpen}
            aria-controls="app-sidebar"
            aria-label={sidebarOpen ? 'Hide menu' : 'Show menu'}
            title={sidebarOpen ? 'Hide menu' : 'Show menu and display settings'}
            className="-ml-2 shrink-0 rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 hover:text-neutral-950 focus-visible:outline-2 focus-visible:outline-brand"
          >
            {sidebarOpen ? <PanelLeftClose className="size-5" aria-hidden /> : <PanelLeftOpen className="size-5" aria-hidden />}
          </button>
          <Logo height={null} className="h-10 shrink-0 sm:h-12 xl:h-[54px] 2xl:h-16" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold leading-tight text-neutral-950 sm:text-xl 2xl:text-2xl">Central Monitoring</h1>
            {/* wraps to a 2nd line on narrow screens rather than cutting off the period */}
            <p className="line-clamp-2 text-[11px] font-semibold uppercase tracking-wider text-brand-dark sm:text-xs">
              {status.data?.companyName ?? 'SAWO'}
              {/* the description only where there is room, so the period ("This Month · ...") is never cut off */}
              <span className="hidden min-[1800px]:inline"> · Production, shipping &amp; sales</span>
              {periodText ? ` · ${periodText}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 bg-neutral-950 px-4 py-3 text-white sm:px-6 lg:px-8 xl:shrink-0 xl:flex-nowrap xl:justify-end xl:rounded-bl-[28px] xl:pl-10 2xl:px-10 2xl:pl-12">
          <div className="flex min-w-0 flex-col items-start gap-1">
            <ConnectionStatus status={status} ops={ops} />
            <p className="text-xs text-neutral-400 xl:whitespace-nowrap">
              Last sync: {formatDate(status.data?.lastSyncedAt ?? ops.data?.lastSyncedAt)}{' '}
              <span className="font-semibold text-sky-300">SALES</span>{' '}
              <span className="font-medium text-neutral-200">{formatTime(status.data?.lastSyncedAt)}</span>
              {' · '}
              <span className="font-semibold text-amber-300">PRODUCTION</span>{' '}
              <span className="font-medium text-neutral-200">{formatTime(ops.data?.lastSyncedAt)}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={MANUAL_REFRESH_ENABLED ? refresh : undefined}
            disabled={!MANUAL_REFRESH_ENABLED || busy}
            title={MANUAL_REFRESH_ENABLED ? undefined : 'Data refreshes automatically'}
            className={`inline-flex shrink-0 items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-neutral-900 ${
              MANUAL_REFRESH_ENABLED
                ? 'hover:bg-neutral-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:cursor-wait disabled:opacity-70'
                : 'cursor-default'
            }`}
          >
            <RefreshCw className={`size-4 shrink-0 ${busy ? 'animate-spin' : ''}`} aria-hidden />
            {/* Fixed-width label and countdown slot: the button keeps the same size while "Refreshing…",
                so nothing next to it moves. */}
            <span className="inline-block w-[6.75rem] text-left">
              {busy ? 'Refreshing…' : MANUAL_REFRESH_ENABLED ? 'Refresh' : 'Auto-Refresh'}
            </span>
            <RefreshCountdown busy={busy} />
          </button>

          <Clock today={today} />
        </div>
      </div>
    </header>
  );
}

// Display only: seconds until the next automatic refresh (the browser reloading data from our backend).
// It does not change what the Refresh button does when clicked.
// The slot is always there with a fixed width (shows "…" while refreshing), so the header never shifts.
function RefreshCountdown({ busy }) {
  const { nextRefreshAt } = useRefresh();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const seconds = nextRefreshAt ? Math.max(0, Math.ceil((nextRefreshAt - now) / 1000)) : null;
  return (
    <span
      className="w-[2.75rem] shrink-0 rounded bg-neutral-200 px-1.5 py-0.5 text-center text-xs font-medium tabular-nums text-neutral-700"
      title={seconds != null && !busy ? `Next automatic refresh in ${seconds} s` : undefined}
      aria-hidden
    >
      {busy || seconds == null ? '…' : `${seconds}s`}
    </span>
  );
}

// Current time and date in the business timezone; updates by itself (useful on a wall monitor).
function Clock({ today }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000); // every second (the clock shows seconds)
    return () => clearInterval(timer);
  }, []);

  const zone = timezoneLabel(now);

  return (
    <div className="shrink-0 text-right">
      <div className="flex items-center justify-end gap-2">
        <p className="text-2xl font-light leading-none tabular-nums 2xl:text-3xl">{formatTimeWithSeconds(now.toISOString())}</p>
        {/* Which timezone the clock (and every date on the screen) uses */}
        <p className="border-l border-neutral-700 pl-2 text-left text-[11px] font-medium leading-tight text-neutral-400">
          <span className="block text-neutral-200">{zone.city}</span>
          {zone.offset}
        </p>
      </div>
      <p className="mt-1 text-xs text-neutral-400">
        {formatDay(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
      </p>
    </div>
  );
}

// True when the last successful sync is older than the backend's own stale limit. Worked out here in the browser
// (from the last good status answer, which is kept) so it still works while the backend can't be reached.
function isStale(request, now = Date.now()) {
  const status = request?.data;
  if (!status || status.dataAgeSeconds == null || !status.staleAfterSeconds || !request.receivedAt) return false;
  // The server says how old the data was when it answered; add the time that has passed in THIS browser since then.
  // Only differences of the browser's own clock are used, so a PC whose clock is wrong is not a problem.
  return status.dataAgeSeconds + (now - request.receivedAt) / 1000 > status.staleAfterSeconds;
}

// ok / delayed / outdated / unreachable / connecting for BOTH syncs (sales and production), always as
// icon + text (never color alone). A failed sync is shown calmly as "update delayed": the screen keeps
// the last good data and the backend tries again by itself. It turns red only when the viewer should
// stop trusting the numbers: the backend can't be reached, or the data is older than the stale limit.
function ConnectionStatus({ status, ops }) {
  const connections = [status.data?.connection, ops.data?.connection];
  let tone = 'bg-amber-400/15 text-amber-300';
  let Icon = Loader2;
  let text = 'Connecting…';
  let hint;

  // Checked first: useApi keeps the last good answer when a request fails, so status.data alone
  // would still say "ok" after the backend stopped.
  if (status.error || ops.error) {
    tone = 'bg-rose-500/20 text-rose-300';
    Icon = AlertTriangle;
    text = 'Backend unreachable';
    hint = 'The screen cannot reach the Central Monitoring server. It keeps showing the last loaded data and tries again automatically.';
  } else if (isStale(status) || isStale(ops)) {
    tone = 'bg-rose-500/20 text-rose-300';
    Icon = AlertTriangle;
    text = 'Data may be outdated';
    hint = 'Odoo has not been read successfully for a while. Check the "Last sync" times below.';
  } else if (connections.includes('error')) {
    Icon = ClockIcon;
    text = ops.data?.connection === 'error' && status.data?.connection !== 'error' ? 'Production update delayed' : 'Odoo update delayed';
    hint =
      'The latest update from Odoo did not finish. The screen keeps showing the most recent data ' +
      '(see the times below) and tries again automatically.';
  } else if (connections.every((c) => c === 'ok')) {
    tone = 'bg-emerald-400/15 text-emerald-300';
    Icon = CheckCircle2;
    text = 'Connected to Odoo';
  }

  return (
    <span role="status" title={hint} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>
      <Icon className={`size-3.5 ${Icon === Loader2 ? 'animate-spin' : ''}`} aria-hidden />
      {text}
    </span>
  );
}
