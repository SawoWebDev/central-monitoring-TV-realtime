import Panel from '../components/Panel';
import AsyncContent from '../components/AsyncContent';
import OdooSyncPanel from '../components/settings/OdooSyncPanel';
import { useApi } from '../hooks/useApi';
import { formatDateTime } from '../utils/format';

// Read-only information. No secrets: the backend never sends Odoo URLs or credentials.
export default function SettingsPage() {
  const status = useApi('/sync/status'); // sales copy from Odoo
  const production = useApi('/operations/status'); // production copy from Odoo

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h2 className="font-serif text-3xl text-neutral-900">Settings</h2>
      <OdooSyncPanel sales={status} production={production} />
      <Panel title="Data source" subtitle="Read-only. These values are set on the server, not here.">
        <AsyncContent request={status} height={160}>
          {(d) => (
            <dl className="divide-y divide-neutral-100 text-sm">
              <Row label="Company" value={d.companyName ?? '—'} />
              <Row label="Base (reporting) currency" value={d.baseCurrency ?? '—'} />
              <Row label="Business timezone" value={d.timezone} />
              <Row label="Connection" value={d.connection} />
              <Row label="Last successful sync" value={formatDateTime(d.lastSyncedAt)} />
              <Row label="Last sync took" value={d.lastSyncDurationSeconds != null ? `${d.lastSyncDurationSeconds} s` : '—'} />
              <Row label="Server waits between syncs" value={`${d.syncIntervalSeconds} s`} />
              <Row label="Orders / order lines in memory" value={`${d.orderCount} / ${d.lineCount}`} />
            </dl>
          )}
        </AsyncContent>
      </Panel>
    </div>
  );
}

function Row({ label, value }) {
  return (
    <div className="flex justify-between gap-4 py-2.5">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right font-medium text-neutral-900">{value}</dd>
    </div>
  );
}
