import { Activity, AlertTriangle, CheckCircle2, Loader2, Lock, RefreshCw, WifiOff } from 'lucide-react';
import Panel from '../Panel';
import { formatDateTime } from '../../utils/format';
import { HEALTH, dataAge, formatAgo, formatDuration, syncHealth, worstHealth } from '../../utils/syncHealth';

const TONE = {
  emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  sky: 'bg-sky-50 text-sky-800 ring-sky-200',
  amber: 'bg-amber-50 text-amber-900 ring-amber-200',
  rose: 'bg-rose-50 text-rose-800 ring-rose-200',
  neutral: 'bg-neutral-100 text-neutral-700 ring-neutral-200',
};
const ICON = { smooth: CheckCircle2, stable: Activity, starting: Loader2, delayed: AlertTriangle, outdated: AlertTriangle, unreachable: WifiOff };

// "Odoo data sync": how long the server needs to copy the data from Odoo (the last time), how old the data is, and
// one overall "Odoo status". Read-only; both copies (sales and production) are shown.
export default function OdooSyncPanel({ sales, production }) {
  const salesHealth = syncHealth(sales);
  const productionHealth = syncHealth(production);
  const overall = worstHealth([salesHealth, productionHealth]);

  return (
    <Panel title="Odoo Data Sync" subtitle="How long our server needs to copy the data from Odoo, how old the data is, and how healthy the connection is.">
      <div className={`mb-4 flex items-start gap-3 rounded-lg px-4 py-3 ring-1 ring-inset ${TONE[HEALTH[overall.level].tone]}`}>
        <Pill level={overall.level} large />
        <div className="min-w-0">
          <p className="text-sm font-semibold">Odoo status: {HEALTH[overall.level].label}</p>
          <p className="text-xs">{overall.reason}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <SyncCard title="SALES" subtitle="Sales orders and their lines" request={sales} health={salesHealth} />
        <SyncCard title="PRODUCTION" subtitle="Manufacturing, deliveries, open orders" request={production} health={productionHealth} />
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-neutral-500">
        <Lock className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          <strong className="font-semibold text-neutral-700">Read-only:</strong> our server only reads from Odoo; writing is blocked in the code.
          <strong className="font-semibold text-neutral-700"> Smooth</strong> = last copy worked and the data is up to date;
          <strong className="font-semibold text-neutral-700"> Stable</strong> = working, but the data is a little older than usual;
          <strong className="font-semibold text-neutral-700"> Delayed / Outdated / Unreachable</strong> = needs attention.
        </span>
      </p>
    </Panel>
  );
}

function Pill({ level, large = false }) {
  const Icon = ICON[level];
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full font-semibold ${large ? 'text-sm' : 'px-2 py-0.5 text-xs ring-1 ring-inset ' + TONE[HEALTH[level].tone]}`}>
      <Icon className={`${large ? 'size-5' : 'size-3.5'} ${level === 'starting' ? 'animate-spin' : ''}`} aria-hidden />
      {!large && HEALTH[level].label}
    </span>
  );
}

function SyncCard({ title, subtitle, request, health }) {
  const d = request.data;
  const age = dataAge(request);
  return (
    <section className="rounded-lg border border-neutral-200 p-4" aria-label={`${title} copy from Odoo`}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-bold tracking-wide text-neutral-900">{title}</h3>
          <p className="text-xs text-neutral-500">{subtitle}</p>
        </div>
        <Pill level={health.level} />
      </div>
      <dl className="divide-y divide-neutral-100 text-sm">
        <Row label="Last Copy Took" value={formatDuration(d?.lastSyncDurationSeconds)} strong />
        <Row label="Waits Between Copies" value={d ? formatDuration(d.syncIntervalSeconds) : '—'} />
        <Row label="One Full Cycle" value={d?.lastSyncDurationSeconds != null ? formatDuration(d.lastSyncDurationSeconds + d.syncIntervalSeconds) : '—'} />
        <Row label="Data Updated" value={formatAgo(age)} />
        <Row label="Last Successful Copy" value={d?.lastSyncedAt ? formatDateTime(d.lastSyncedAt) : '—'} />
        <Row
          label="Right Now"
          value={
            d?.isSyncing ? (
              <span className="inline-flex items-center gap-1.5">
                <RefreshCw className="size-3.5 animate-spin" aria-hidden />
                Copying from Odoo
              </span>
            ) : (
              'Waiting for the Next Copy'
            )
          }
        />
      </dl>
    </section>
  );
}

function Row({ label, value, strong = false }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <dt className="text-neutral-500">{label}</dt>
      <dd className={`text-right ${strong ? 'text-base font-semibold' : 'font-medium'} text-neutral-900`}>{value}</dd>
    </div>
  );
}
