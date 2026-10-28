import Panel from '../Panel';
import AsyncContent from '../AsyncContent';
import { DELIVERY_META } from './salesStatus';
import { useApi } from '../../hooks/useApi';
import { formatDate, formatNumber } from '../../utils/format';

// I. Confirmed orders past their promised delivery date and not fully delivered. Counts only (no money).
// Not limited to this month: it shows every confirmed order that is late today.
export default function LateOrdersPanel({ className = '', limit = 8 }) {
  const late = useApi('/dashboard/late-orders', { limit });

  return (
    <Panel
      className={className}
      title="Late Orders"
      subtitle="Confirmed orders past their promised delivery date and not fully delivered. Most late first."
    >
      <AsyncContent request={late} height={180} isEmpty={(d) => d.total === 0} emptyText="No late orders.">
        {(d) => (
          <>
            <p className="mb-3 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-sm text-neutral-600">
              <span>
                <span className="text-3xl font-light tabular-nums text-brand-dark">{formatNumber(d.total)}</span> late orders
              </span>
              {Object.entries(d.byDelivery).map(([k, n]) => (
                <span key={k} className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm" style={{ backgroundColor: DELIVERY_META[k].color }} aria-hidden />
                  {DELIVERY_META[k].label}: <span className="font-semibold text-neutral-900">{formatNumber(n)}</span>
                </span>
              ))}
            </p>
            <div className="-mx-5 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-y border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                    <th scope="col" className="px-3 py-2 pl-5">Order</th>
                    <th scope="col" className="px-3 py-2">Customer</th>
                    <th scope="col" className="px-3 py-2">Delivery Date</th>
                    <th scope="col" className="px-3 py-2">Expected Date</th>
                    <th scope="col" className="px-3 py-2 text-right">Days late</th>
                    <th scope="col" className="px-3 py-2 pr-5">Delivery</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {d.items.map((o) => (
                    <tr key={o.id}>
                      <td className="whitespace-nowrap px-3 py-2 pl-5 font-medium text-neutral-900">{o.reference}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-neutral-700" title={o.customerName}>
                        {o.customerName}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 text-neutral-700">{formatDate(o.commitmentDate)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-neutral-700">{o.expectedDate ? formatDate(o.expectedDate) : <span className="text-neutral-400">—</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-brand-dark">
                        {formatNumber(o.daysLate)}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2 pr-5">
                        <span className="flex items-center gap-1.5 text-neutral-700">
                          <span className="size-3 rounded-sm" style={{ backgroundColor: DELIVERY_META[o.deliveryStatus]?.color }} aria-hidden />
                          {DELIVERY_META[o.deliveryStatus]?.label ?? o.deliveryStatus}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </AsyncContent>
    </Panel>
  );
}
