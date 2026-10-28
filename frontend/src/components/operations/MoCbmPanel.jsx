import { AlertTriangle, Download } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import Panel from '../Panel';
import AsyncContent from '../AsyncContent';
import ChartTooltip from '../charts/ChartTooltip';
import { useApi } from '../../hooks/useApi';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { bool, oneOf, usePersistentState } from '../../hooks/usePersistentState';
import { useDisplay } from '../../context/displayContext';
import { chartColors } from '../../utils/chartColors';
import { formatCbm, formatNumber } from '../../utils/format';

const PERIODS = [
  { value: 'today', label: 'Today' },
  { value: 'week', label: 'This week' },
  { value: 'month', label: 'This month' },
];
const COLORS = { produced: '#10b981', inProduction: '#0ea5e9', notStarted: '#a3a3a3' };

// Manufacturing CBM by plant x product category: planned (open MOs), in production (open MOs),
// produced (MOs done in the chosen period). Finished goods only unless "Include semi-finished" is on.
// The four switches are remembered in Display mode (usePersistentState).
export default function MoCbmPanel({ className = '' }) {
  const [period, setPeriod] = usePersistentState('moCbm.period', 'month', oneOf('today', 'week', 'month'));
  const [semiFinished, setSemiFinished] = usePersistentState('moCbm.semiFinished', false, bool);
  const [linkedOnly, setLinkedOnly] = usePersistentState('moCbm.linkedOnly', false, bool);
  const [level, setLevel] = usePersistentState('moCbm.level', 'full', oneOf('full', 'level3'));
  const params = { period, semiFinished, linkedOnly, level };
  const cbm = useApi('/operations/mo-cbm', params);
  const scrollRef = useAutoScroll(); // the table scrolls slowly by itself (pauses under the mouse)
  const { displayMode } = useDisplay(); // Display mode hides the CSV download (nobody clicks on a wall monitor)
  const periodLabel = PERIODS.find((p) => p.value === period).label.toLowerCase();
  const csvUrl = `/api/operations/mo-cbm/missing-volume.csv?${new URLSearchParams(params)}`;

  return (
    <Panel
      className={className}
      title="Manufacturing CBM by Plant & Product Category"
      subtitle="Planned = open MOs (qty to produce × volume) · In production = open MOs (qty producing × volume) · Produced = MOs done in the period."
      legend={[
        { label: 'Produced', color: COLORS.produced },
        { label: 'In production', color: COLORS.inProduction },
        { label: 'Planned, not started', color: COLORS.notStarted },
      ]}
    >
      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
        <Segmented label="Produced in" options={PERIODS} value={period} onChange={setPeriod} />
        <Segmented
          label="Category"
          options={[
            { value: 'full', label: 'Full path' },
            { value: 'level3', label: '3rd level' },
          ]}
          value={level}
          onChange={setLevel}
        />
        <Toggle label="Include semi-finished" checked={semiFinished} onChange={setSemiFinished} />
        <Toggle label="Linked to open sales orders only" checked={linkedOnly} onChange={setLinkedOnly} />
      </div>

      <AsyncContent request={cbm} height={260} isEmpty={(d) => d.rows.length === 0} emptyText="No manufacturing orders match these filters.">
        {(d) => (
          <>
            {semiFinished && (
              <Note tone="amber">Semi-finished parts are included: semi-finished parts can double-count material.</Note>
            )}

            {/* Cards */}
            <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Card label="Planned CBM" value={formatCbm(d.totals.plannedCbm)} hint={`${formatNumber(d.totals.openMos)} open MOs`} />
              <Card label="In production" value={formatCbm(d.totals.inProductionCbm)} hint="open MOs, qty producing" color={COLORS.inProduction} />
              <Card label="Produced" value={formatCbm(d.totals.producedCbm)} hint={`${formatNumber(d.totals.producedMos)} MOs done ${periodLabel}`} color={COLORS.produced} />
              <Card label="Open MOs" value={formatNumber(d.totals.openMos)} hint="draft, confirmed, in progress, to close" />
              <Card label="Late MOs" value={formatNumber(d.totals.lateMos)} hint="open, deadline passed" alert />
              <Card
                label="No volume"
                value={formatNumber(d.totals.mosWithoutVolume)}
                hint={`MOs · ${formatNumber(d.totals.productsWithoutVolume)} products`}
                alert={d.totals.mosWithoutVolume > 0}
              />
            </div>

            {d.totals.mosWithoutVolume > 0 && (
              <Note tone="amber">
                {formatNumber(d.totals.mosWithoutVolume)} MOs / {formatNumber(d.totals.productsWithoutVolume)} products have no
                volume, CBM is a minimum.
              </Note>
            )}
            {d.totals.unitMismatchSkipped > 0 && (
              <Note tone="amber">
                {formatNumber(d.totals.unitMismatchSkipped)} MOs skipped: unit differs from product unit (their CBM is not counted).
              </Note>
            )}

            {/* Chart: one bar per plant; open MOs (in production + not started) stacked, produced separately */}
            <PlantChart plants={d.plants} />

            {/* Table */}
            <div ref={scrollRef} className="-mx-5 mt-4 max-h-[460px] overflow-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-y border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                    <th scope="col" className="px-3 py-2 pl-5">Plant</th>
                    <th scope="col" className="px-3 py-2">Category</th>
                    <th scope="col" className="px-3 py-2">Group</th>
                    <th scope="col" className="px-3 py-2 text-right">Open MOs</th>
                    <th scope="col" className="px-3 py-2 text-right">Late</th>
                    <th scope="col" className="px-3 py-2 text-right">Planned</th>
                    <th scope="col" className="px-3 py-2 text-right">In production</th>
                    <th scope="col" className="px-3 py-2 text-right">Produced ({periodLabel})</th>
                    <th scope="col" className="px-3 py-2 pr-5">Warnings</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {d.rows.map((r) => (
                    <tr key={`${r.plantCode}|${r.category}`}>
                      <td className="whitespace-nowrap px-3 py-2 pl-5 font-medium text-neutral-900">{r.plantCode}</td>
                      <td className="max-w-[340px] px-3 py-2 text-neutral-700" title={r.category}>
                        {r.category.replace(/^All \/ /, '')}
                      </td>
                      <td className={`whitespace-nowrap px-3 py-2 ${r.group === 'Unmapped' ? 'italic text-neutral-400' : 'text-neutral-700'}`}>{r.group}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatNumber(r.openMos)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.lateMos > 0 ? 'font-semibold text-brand-dark' : 'text-neutral-400'}`}>{formatNumber(r.lateMos)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-900">{formatCbm(r.plannedCbm)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-700">{formatCbm(r.inProductionCbm)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-700">{formatCbm(r.producedCbm)}</td>
                      <td className="px-3 py-2 pr-5">
                        <div className="flex flex-wrap gap-1">
                          {r.mosWithoutVolume > 0 && (
                            <Badge>
                              {formatNumber(r.mosWithoutVolume)} MOs / {formatNumber(r.productsWithoutVolume)} products no volume
                            </Badge>
                          )}
                          {r.unitMismatch > 0 && <Badge>{formatNumber(r.unitMismatch)} unit differs</Badge>}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Products missing volume (the client fixes these in Odoo) */}
            {d.missingVolumeTotal > 0 && (
              <div className="mt-4">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-neutral-900">
                    Products missing volume <span className="font-normal text-neutral-500">({formatNumber(d.missingVolumeTotal)}, top 10 shown)</span>
                  </h3>
                  {!displayMode && (
                    <a
                      href={csvUrl}
                      className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
                    >
                      <Download className="size-3.5" aria-hidden />
                      Download CSV (all {formatNumber(d.missingVolumeTotal)})
                    </a>
                  )}
                </div>
                <div className="-mx-5 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-left text-sm">
                    <thead>
                      <tr className="border-y border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                        <th scope="col" className="px-3 py-2 pl-5">Product</th>
                        <th scope="col" className="px-3 py-2">Category</th>
                        <th scope="col" className="px-3 py-2">Plant</th>
                        <th scope="col" className="px-3 py-2 text-right">MOs</th>
                        <th scope="col" className="px-3 py-2 pr-5 text-right">Quantity not counted</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100">
                      {d.missingVolume.map((m) => (
                        <tr key={`${m.productId}|${m.plantCode}`}>
                          <td className="max-w-[320px] truncate px-3 py-2 pl-5 text-neutral-900" title={m.productName}>{m.productName}</td>
                          <td className="max-w-[260px] truncate px-3 py-2 text-neutral-600" title={m.category}>{m.category.replace(/^All \/ /, '')}</td>
                          <td className="px-3 py-2 text-neutral-700">{m.plantCode}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{formatNumber(m.mos)}</td>
                          <td className="px-3 py-2 pr-5 text-right tabular-nums">{formatNumber(m.quantityNotCounted)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </AsyncContent>
    </Panel>
  );
}

function PlantChart({ plants }) {
  const data = plants.map((p) => ({
    ...p,
    notStarted: Math.max(0, p.plannedCbm - p.inProductionCbm),
  }));
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, 56 * data.length)}>
      <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 0 }} barCategoryGap={10}>
        <CartesianGrid horizontal={false} stroke={chartColors.grid} />
        <XAxis type="number" tickFormatter={(v) => `${formatNumber(Math.round(v))} m³`} tick={{ fill: chartColors.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
        <YAxis type="category" dataKey="plantCode" width={48} tick={{ fill: chartColors.axisStrong, fontSize: 13 }} axisLine={false} tickLine={false} />
        <Tooltip
          cursor={{ fill: chartColors.cursor }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const p = payload[0].payload;
            return (
              <ChartTooltip
                title={`${p.plantCode} · ${p.plantName}`}
                rows={[
                  ['Planned (open MOs)', formatCbm(p.plannedCbm)],
                  ['  of which in production', formatCbm(p.inProductionCbm)],
                  ['Produced (period)', formatCbm(p.producedCbm)],
                ]}
              />
            );
          }}
        />
        <Bar dataKey="producedCbm" stackId="done" fill={COLORS.produced} isAnimationActive={false} />
        <Bar dataKey="inProductionCbm" stackId="open" fill={COLORS.inProduction} isAnimationActive={false} />
        <Bar dataKey="notStarted" stackId="open" fill={COLORS.notStarted} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function Card({ label, value, hint, color, alert }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2.5" style={color ? { borderTop: `4px solid ${color}` } : undefined}>
      <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">{label}</p>
      <p className={`mt-1 text-2xl font-bold tabular-nums ${alert ? 'text-brand-dark' : 'text-neutral-950'}`}>{value}</p>
      <p className="text-xs text-neutral-500">{hint}</p>
    </div>
  );
}

function Note({ children }) {
  return (
    <p className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
      <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

function Badge({ children }) {
  return <span className="whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 ring-1 ring-inset ring-amber-600/20">{children}</span>;
}

function Segmented({ label, options, value, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-neutral-500">{label}</span>
      <div role="group" aria-label={label} className="inline-flex rounded-lg border border-neutral-200 p-0.5">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={value === o.value}
            onClick={() => onChange(o.value)}
            className={`rounded-md px-2.5 py-1 text-xs font-medium ${value === o.value ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-neutral-700">
      <input type="checkbox" className="size-4 accent-neutral-900" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}
