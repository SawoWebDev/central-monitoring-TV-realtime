import { ChevronRight } from 'lucide-react';
import Panel from '../Panel';
import AsyncContent from '../AsyncContent';
import { useApi } from '../../hooks/useApi';
import { formatNumber } from '../../utils/format';
import { STAGE_META } from './stageMeta';

const days = (n) => (n == null ? '—' : `${formatNumber(Math.round(n))} ${Math.round(n) === 1 ? 'day' : 'days'}`);

// Section 2: lead time shown as stages, like a status.
export default function LeadTimePanel({ className = '' }) {
  const lead = useApi('/operations/lead-time');

  return (
    <Panel
      className={className}
      title="Lead Time: Open Sales Orders by Stage"
      subtitle="Confirmed orders not fully delivered, by stage. Days open = today − order date."
    >
      <AsyncContent request={lead}>
        {(data) => (
          <>
            <ol className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {data.stages.map((s, index) => {
                const meta = STAGE_META[s.stage];
                return (
                  <li key={s.stage} className="relative rounded-lg border border-neutral-200 bg-white p-3" style={{ borderTop: `4px solid ${meta.color}` }}>
                    {index < data.stages.length - 1 && (
                      <ChevronRight className="absolute -right-3 top-1/2 z-10 hidden size-5 -translate-y-1/2 rounded-full bg-white text-neutral-400 lg:block" aria-hidden />
                    )}
                    <p className="text-sm font-semibold text-neutral-900">{meta.label}</p>
                    <p className="text-xs text-neutral-500">{meta.hint}</p>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-neutral-950">{formatNumber(s.count)}</p>
                    <p className="text-xs text-neutral-500">orders</p>
                    <dl className="mt-2 space-y-0.5 text-xs">
                      <div className="flex justify-between gap-2">
                        <dt className="text-neutral-500">Typical open</dt>
                        <dd className="font-medium tabular-nums text-neutral-900">{days(s.medianDaysOpen)}</dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-neutral-500">Oldest</dt>
                        <dd className="truncate font-medium tabular-nums text-neutral-900" title={s.oldest?.reference}>
                          {s.oldest ? `${s.oldest.reference} · ${days(s.oldest.days)}` : '—'}
                        </dd>
                      </div>
                    </dl>
                    {s.withoutManufacturing > 0 && (
                      <p className="mt-1.5 text-xs text-neutral-500">{formatNumber(s.withoutManufacturing)} need no production</p>
                    )}
                  </li>
                );
              })}
            </ol>

            <p className="mt-3 rounded-md bg-neutral-50 px-3 py-2 text-sm text-neutral-700">
              <span className="font-semibold text-neutral-900">Finished this month: </span>
              {data.finishedThisMonth.orders > 0 ? (
                <>
                  {formatNumber(data.finishedThisMonth.orders)} orders fully delivered, typically{' '}
                  <span className="font-semibold">{days(data.finishedThisMonth.medianDays)}</span> from order to last delivery
                  (fastest {days(data.finishedThisMonth.minDays)}, slowest {days(data.finishedThisMonth.maxDays)}).
                </>
              ) : (
                'no orders fully delivered yet.'
              )}
            </p>
          </>
        )}
      </AsyncContent>
    </Panel>
  );
}
