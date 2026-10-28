import Panel from '../Panel';
import AsyncContent from '../AsyncContent';
import { DELIVERY_META } from './salesStatus';
import { useApi } from '../../hooks/useApi';
import { formatNumber } from '../../utils/format';

const ORDER = ['pending', 'started', 'partial', 'full'];

// H. How far the confirmed orders of the period have been delivered. Counts only (no money).
export default function DeliveryStatusPanel({ range, className = '' }) {
  const delivery = useApi('/dashboard/delivery-status', { startDate: range.startDate, endDate: range.endDate });

  return (
    <Panel
      className={className}
      title="Delivery Status of Confirmed Orders"
      subtitle="Confirmed sales orders in this period, by delivery progress."
      legend={ORDER.map((k) => DELIVERY_META[k])}
    >
      <AsyncContent request={delivery} height={180} isEmpty={(d) => d.confirmed === 0} emptyText="No confirmed orders in this period.">
        {(d) => (
          <>
            {/* One bar split by share; each part also has its count in the list below */}
            <div className="flex h-5 overflow-hidden rounded-full bg-neutral-100" aria-hidden>
              {ORDER.map((k) =>
                d[k] > 0 ? (
                  <div key={k} style={{ width: `${(d[k] / d.confirmed) * 100}%`, backgroundColor: DELIVERY_META[k].color }} />
                ) : null
              )}
            </div>
            <ul className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {ORDER.map((k) => (
                <li key={k} className="rounded-lg bg-neutral-50 px-3 py-2.5">
                  <p className="flex items-center gap-1.5 text-sm font-medium text-neutral-700">
                    <span className="size-3 rounded-sm" style={{ backgroundColor: DELIVERY_META[k].color }} aria-hidden />
                    {DELIVERY_META[k].label}
                  </p>
                  <p className="mt-1 text-3xl font-light tabular-nums text-neutral-950">{formatNumber(d[k])}</p>
                  <p className="text-xs text-neutral-500">{Math.round((d[k] / d.confirmed) * 100)}% of {formatNumber(d.confirmed)}</p>
                </li>
              ))}
            </ul>
            {d.noDelivery > 0 && (
              <p className="mt-3 text-xs text-neutral-500">
                {formatNumber(d.noDelivery)} confirmed orders have nothing to deliver (e.g. services) and are not shown.
              </p>
            )}
          </>
        )}
      </AsyncContent>
    </Panel>
  );
}
