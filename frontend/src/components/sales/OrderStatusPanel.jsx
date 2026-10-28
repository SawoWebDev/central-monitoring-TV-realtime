import Panel from '../Panel';
import AsyncContent from '../AsyncContent';
import OrderStatusChart from './OrderStatusChart';
import { STATUS_META } from './salesStatus';
import { useApi } from '../../hooks/useApi';

const STATUS_LEGEND = Object.values(STATUS_META).map(({ label, color }) => ({ label, color }));

// The one remaining sales panel: sales orders per status in the period, with their PHP value.
// (Sales Trend, Top Products, Top Customers and Latest Orders were removed at the client's request,
// 2026-10-19.) range = the period shown ("This Month"), from the layout.
export default function OrderStatusPanel({ range, className = '' }) {
  const statuses = useApi('/dashboard/order-status', { startDate: range.startDate, endDate: range.endDate });

  return (
    <Panel
      className={className}
      title="Orders by Status"
      subtitle="Orders per status, with total value in PHP."
      legend={STATUS_LEGEND}
    >
      <AsyncContent request={statuses} height={300} isEmpty={(d) => d.every((r) => r.count === 0)}>
        {(data) => <OrderStatusChart data={data} />}
      </AsyncContent>
    </Panel>
  );
}
