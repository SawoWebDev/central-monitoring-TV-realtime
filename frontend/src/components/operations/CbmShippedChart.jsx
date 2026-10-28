import { Bar, CartesianGrid, ComposedChart, LabelList, Line, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import MonthTick from '../charts/MonthTick';
import { AlertTriangle } from 'lucide-react';
import AsyncContent from '../AsyncContent';
import ChartTooltip from '../charts/ChartTooltip';
import { chartColors } from '../../utils/chartColors';
import { formatCbm, formatNumber } from '../../utils/format';

// Stacked bars, bottom to top. Each group is named in the legend and the tooltip, so color is never the only cue.
const GROUPS = [
  { key: 'accessories', label: 'Accessories', color: '#f59e0b' },
  { key: 'heaters', label: 'Heaters', color: '#ed1c24' },
  { key: 'saunaRooms', label: 'Sauna Rooms', color: '#262626' },
  { key: 'other', label: 'Other', color: '#a3a3a3' },
];

const monthFormat = (options) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', ...options });
const shortMonth = monthFormat({ month: 'short', year: '2-digit' });
const longMonth = monthFormat({ month: 'long', year: 'numeric' });
const monthDate = (key) => new Date(`${key}-01T00:00:00Z`);

// Total on top of each bar: whole m³ from 100 up, one decimal below that, nothing for an empty month.
// Cell in the table under the chart: one decimal, a dash for 0.
const cell = (value) => (value > 0 ? new Intl.NumberFormat('en-PH', { maximumFractionDigits: 1 }).format(value) : '–');

// Width of the row-name column of the table. The chart's left margin + y-axis add up to the same width, so every
// month column of the table sits straight under its bar.
const NAME_COL = 120;
const Y_AXIS = 48;

const totalLabel = (value) => (value > 0 ? new Intl.NumberFormat('en-PH', { maximumFractionDigits: value >= 100 ? 0 : 1 }).format(value) : '');

// "Shipped CBM" by month for the last 12 months (finished goods), split into product groups. No plants.
export default function CbmShippedChart({ request }) {
  return (
    <AsyncContent request={request} height={300}>
      {(data) => {
        const rows = data.months.map((m) => ({ ...m, label: shortMonth.format(monthDate(m.month)) }));
        // Group months into 3-month bands (in display order, not calendar quarters) so alternating
        // background shading gives the eye a resting point every few bars on a wide monitor.
        const quarterBands = [];
        for (let i = 0; i < rows.length; i += 3) quarterBands.push(rows.slice(i, i + 3));
        return (
          <>
            <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-700" aria-label="Legend">
              {GROUPS.map((g) => (
                <li key={g.key} className="flex items-center gap-1.5">
                  <span className="size-3 rounded-sm" style={{ backgroundColor: g.color }} aria-hidden />
                  {g.label}
                </li>
              ))}
            </ul>

            <div role="img" aria-label="Stacked bar chart of cubic meters shipped per month, by product group">
              <ResponsiveContainer width="100%" height={340}>
                <ComposedChart data={rows} margin={{ top: 18, right: 8, bottom: 0, left: NAME_COL - Y_AXIS }} barCategoryGap="10%">
                  {quarterBands.map((band, i) =>
                    i % 2 === 1 ? (
                      <ReferenceArea
                        key={band[0].month}
                        x1={band[0].label}
                        x2={band[band.length - 1].label}
                        fill={chartColors.quarterBand}
                        fillOpacity={1}
                        stroke="none"
                        ifOverflow="visible"
                      />
                    ) : null
                  )}
                  <CartesianGrid vertical={false} stroke={chartColors.grid} />
                  <XAxis
                    dataKey="label"
                    tick={<MonthTick partials={rows.map((r) => r.partial)} />}
                    tickLine={false}
                    axisLine={{ stroke: chartColors.grid }}
                    interval={0}
                  />
                  <YAxis
                    width={Y_AXIS}
                    tick={{ fill: chartColors.axis, fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => formatNumber(v)}
                    label={{ value: 'm³', position: 'insideTopLeft', offset: 0, fill: chartColors.axis, fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: chartColors.cursor }}
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const m = payload[0].payload;
                      return (
                        <ChartTooltip
                          title={`${longMonth.format(monthDate(m.month))}${m.partial ? ' (month to date)' : ''}`}
                          rows={[...GROUPS.map((g) => [g.label, formatCbm(m[g.key])]), ['Total CBM shipped', formatCbm(m.total)]]}
                        />
                      );
                    }}
                  />
                  {GROUPS.map((g) => (
                    <Bar key={g.key} dataKey={g.key} name={g.label} stackId="cbm" fill={g.color} stroke="#ffffff" strokeWidth={1} maxBarSize={120} isAnimationActive={false} />
                  ))}
                  {/* invisible line: only carries the total label above each bar */}
                  <Line dataKey="total" stroke="none" dot={false} activeDot={false} isAnimationActive={false} legendType="none">
                    <LabelList dataKey="total" position="top" formatter={totalLabel} fill={chartColors.axisStrong} fontSize={12} fontWeight={600} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* the same numbers as the bars, always visible: one column per month, under its bar */}
            <div className="overflow-x-auto" style={{ paddingRight: 8 }}>
              <table className="w-full table-fixed text-xs tabular-nums">
                <caption className="sr-only">CBM shipped per month (m³)</caption>
                <colgroup>
                  <col style={{ width: NAME_COL }} />
                </colgroup>
                <thead className="sr-only">
                  <tr>
                    <th scope="col">Product group</th>
                    {data.months.map((m) => (
                      <th key={m.month} scope="col">{longMonth.format(monthDate(m.month))}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {GROUPS.map((g) => (
                    <tr key={g.key}>
                      <th scope="row" className="py-1 pr-2 text-left font-medium text-neutral-700">
                        <span className="flex items-center gap-1.5">
                          <span className="size-3 shrink-0 rounded-sm" style={{ backgroundColor: g.color }} aria-hidden />
                          {g.label}
                        </span>
                      </th>
                      {data.months.map((m) => (
                        <td key={m.month} className="py-1 text-center text-neutral-800">{cell(m[g.key])}</td>
                      ))}
                    </tr>
                  ))}
                  <tr className="border-t-2 border-neutral-300 font-semibold text-neutral-950">
                    <th scope="row" className="py-1 pr-2 text-left">Total (m³)</th>
                    {data.months.map((m) => (
                      <td key={m.month} className="py-1 text-center">{cell(m.total)}</td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="mt-2 text-xs text-neutral-500">
              Finished goods only. The latest month is month to date. Left out: {formatCbm(data.excluded.cbm)} of semi-finished,
              raw-material and uncategorised transfers in these 12 months.
            </p>
            {data.missingVolume.products > 0 && (
              <p className="mt-2 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                <span>
                  {formatNumber(data.missingVolume.products)} shipped finished-goods products have no volume in Odoo (
                  {formatNumber(data.missingVolume.quantity)} pieces), so the bars are lower than the real volume.
                </span>
              </p>
            )}
          </>
        );
      }}
    </AsyncContent>
  );
}
