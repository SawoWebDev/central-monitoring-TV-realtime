import { AlertTriangle } from 'lucide-react';
import Panel from '../Panel';
import AsyncContent from '../AsyncContent';
import { useApi } from '../../hooks/useApi';
import { formatNumber } from '../../utils/format';

// Older quotations get a stronger amber, so stale ones stand out.
const BUCKET_COLORS = ['#fde68a', '#fbbf24', '#f59e0b', '#b45309'];

// E. How long the open quotations (Quotation + Quotation Sent) have been waiting. Counts only (no money).
// Not limited to this month: it shows every quotation that is still open.
export default function QuotationAgingPanel({ className = '' }) {
  const aging = useApi('/dashboard/quotation-aging');

  return (
    <Panel
      className={className}
      title="Quotation Aging"
      subtitle="All open quotations, by days since the quotation date."
    >
      <AsyncContent request={aging} height={180} isEmpty={(d) => d.open === 0} emptyText="No open quotations.">
        {(d) => {
          const max = Math.max(1, ...d.buckets.map((b) => b.count));
          return (
            <>
              <ul className="space-y-2.5">
                {d.buckets.map((b, i) => (
                  <li key={b.key} className="grid grid-cols-[7rem_1fr_3rem] items-center gap-3 text-sm">
                    <span className="text-neutral-700">{b.label}</span>
                    <span className="h-5 overflow-hidden rounded bg-neutral-100">
                      <span
                        className="block h-full rounded"
                        style={{ width: `${(b.count / max) * 100}%`, backgroundColor: BUCKET_COLORS[i] }}
                      />
                    </span>
                    <span className="text-right font-semibold tabular-nums text-neutral-900">{formatNumber(b.count)}</span>
                  </li>
                ))}
              </ul>

              <p className="mt-4 text-sm text-neutral-600">
                <span className="font-semibold text-neutral-900">{formatNumber(d.open)}</span> open quotations
                {d.oldest && (
                  <>
                    {' '}· oldest <span className="font-semibold text-neutral-900">{d.oldest.reference}</span> ({d.oldest.customerName},{' '}
                    {formatNumber(d.oldest.days)} days)
                  </>
                )}
              </p>
              {d.expired > 0 && (
                <p className="mt-2 flex items-start gap-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="font-semibold">{formatNumber(d.expired)}</span> of these quotations are past their expiry date.
                  </span>
                </p>
              )}
            </>
          );
        }}
      </AsyncContent>
    </Panel>
  );
}
