import { AlertTriangle } from 'lucide-react';
import Panel from '../Panel';
import AsyncContent from '../AsyncContent';
import CbmShippedChart from './CbmShippedChart';
import { useApi } from '../../hooks/useApi';
import { formatCbm, formatNumber } from '../../utils/format';

const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
];

// Section 1: "Shipped CBM" (name confirmed by the client's manager 2026-10-22), finished goods only:
// today / this week / this month, and below them a monthly stacked bar chart of the
// last 12 months by product group (Accessories / Heaters / Sauna Rooms). No plant breakdown (client request 2026-10-21).
export default function CbmPanel({ className = '' }) {
  const cbm = useApi('/operations/cbm-shipped');
  const monthly = useApi('/operations/cbm-shipped/monthly');

  return (
    <Panel
      className={className}
      title="CBM Shipped"
      subtitle="Finished goods only (heaters, sauna rooms, accessories, other finished goods). Completed deliveries × product volume (m³). Week = Monday to Sunday."
    >
      <AsyncContent request={cbm}>
        {(data) => (
          <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              {PERIODS.map((p) => (
                <div key={p.key} className="rounded-lg bg-neutral-50 px-3 py-2.5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{p.label}</p>
                  <p className="mt-1 text-2xl font-bold tabular-nums text-neutral-950 2xl:text-3xl">
                    {formatCbm(data.totals[p.key].cbm)}
                  </p>
                  <p className="text-xs text-neutral-500">{formatNumber(data.totals[p.key].quantity)} pieces</p>
                </div>
              ))}
            </div>

            <h3 className="mb-2 text-sm font-semibold text-neutral-900">Shipped per month, by product group</h3>
            <CbmShippedChart request={monthly} />

            {data.missingVolume.products > 0 && (
              <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  {formatNumber(data.missingVolume.products)} of {formatNumber(data.missingVolume.shippedProducts)} shipped
                  products have no volume in Odoo ({formatNumber(data.missingVolume.quantity)} pieces), so these totals are
                  lower than the real volume.
                </span>
              </p>
            )}
          </>
        )}
      </AsyncContent>
    </Panel>
  );
}
