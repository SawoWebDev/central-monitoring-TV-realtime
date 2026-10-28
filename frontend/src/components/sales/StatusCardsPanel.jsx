import Panel from '../Panel';
import AsyncContent from '../AsyncContent';
import { STATUS_META } from './salesStatus';
import { useApi } from '../../hooks/useApi';
import { formatNumber } from '../../utils/format';

// A. Order counts per status in the period, plus the cancellation rate. Counts only (no money).
export default function StatusCardsPanel({ range, className = '' }) {
  const counts = useApi('/dashboard/status-counts', { startDate: range.startDate, endDate: range.endDate });

  return (
    <Panel className={className} title="Order Status Counts" subtitle="Sales orders in this period, by status.">
      <AsyncContent request={counts} height={110}>
        {(d) => (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <Card label="All orders" value={formatNumber(d.total)} hint="every status" color="#404040" />
            <Card label={STATUS_META.quotation.label} value={formatNumber(d.quotation)} hint="not sent yet" color={STATUS_META.quotation.color} />
            <Card label={STATUS_META.quotation_sent.label} value={formatNumber(d.quotation_sent)} hint="waiting for the customer" color={STATUS_META.quotation_sent.color} />
            <Card label={STATUS_META.confirmed.label} value={formatNumber(d.confirmed)} hint="confirmed orders" color={STATUS_META.confirmed.color} />
            <Card label={STATUS_META.cancelled.label} value={formatNumber(d.cancelled)} hint="cancelled orders" color={STATUS_META.cancelled.color} />
            <Card
              label="Cancellation rate"
              value={d.cancellationRate == null ? '—' : `${d.cancellationRate}%`}
              hint="cancelled ÷ all orders"
              color={STATUS_META.cancelled.color}
            />
          </ul>
        )}
      </AsyncContent>
    </Panel>
  );
}

function Card({ label, value, hint, color }) {
  return (
    <li className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5" style={{ borderTop: `4px solid ${color}` }}>
      <p className="text-sm font-semibold text-neutral-800">{label}</p>
      <p className="mt-1 text-3xl font-light tabular-nums text-neutral-950">{value}</p>
      <p className="text-xs text-neutral-500">{hint}</p>
    </li>
  );
}
