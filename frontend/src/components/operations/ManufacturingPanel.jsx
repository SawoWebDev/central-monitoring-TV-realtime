import Panel from '../Panel';
import AsyncContent from '../AsyncContent';
import HeatTable from '../HeatTable';
import { useApi } from '../../hooks/useApi';
import { formatNumber } from '../../utils/format';

const HEAT = { open: '115, 115, 115', progress: '14, 165, 233', late: '237, 28, 36', done: '16, 185, 129' };

// Section 4: manufacturing orders per plant: current status, late, finished, progress.
export default function ManufacturingPanel({ className = '' }) {
  const mos = useApi('/operations/manufacturing');

  return (
    <Panel
      className={className}
      title="Manufacturing Orders Per Plant"
      subtitle="Open MOs by status. Late = deadline passed. Progress = average of MOs in progress."
    >
      <AsyncContent request={mos}>
        {(data) => (
          <>
            <HeatTable
              rows={data.plants}
              getKey={(p) => p.warehouseId ?? 'none'}
              getValue={(p, key) => {
                if (key === 'plant') return p.code;
                if (key in p.open) return p.open[key];
                if (key === 'doneToday') return p.finished.today;
                if (key === 'doneMonth') return p.finished.month;
                return p[key];
              }}
              columns={[
                { key: 'plant', label: 'Plant' },
                { key: 'draft', label: 'Draft', align: 'right', format: formatNumber, heat: HEAT.open },
                { key: 'confirmed', label: 'Confirmed', align: 'right', format: formatNumber, heat: HEAT.open },
                { key: 'progress', label: 'In progress', align: 'right', format: formatNumber, heat: HEAT.progress },
                { key: 'to_close', label: 'To close', align: 'right', format: formatNumber, heat: HEAT.progress },
                { key: 'late', label: 'Late', align: 'right', format: formatNumber, heat: HEAT.late },
                { key: 'doneToday', label: 'Done today', align: 'right', format: formatNumber, heat: HEAT.done },
                { key: 'doneMonth', label: 'Done this month', align: 'right', format: formatNumber, heat: HEAT.done },
                {
                  key: 'inProgressAverage',
                  label: 'Progress',
                  align: 'right',
                  format: (v) => (v == null ? '—' : `${formatNumber(Math.round(v))}%`),
                },
              ]}
            />
            <p className="mt-3 text-sm text-neutral-600">
              <span className="font-semibold text-neutral-900">{formatNumber(data.totals.openTotal)}</span> open MOs, of which{' '}
              <span className="font-semibold text-brand-dark">{formatNumber(data.totals.late)} late</span> ·{' '}
              <span className="font-semibold text-neutral-900">{formatNumber(data.totals.finished.week)}</span> finished this week.
            </p>
          </>
        )}
      </AsyncContent>
    </Panel>
  );
}
