import { Bar, BarChart, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import ChartTooltip from '../charts/ChartTooltip';
import { chartColors } from '../../utils/chartColors';
import { statusMeta } from './salesStatus';
import { formatNumber, formatPHP, formatPHPCompact } from '../../utils/format';

// One bar per status (number of orders). Each bar is named on the axis, so color is never the only cue.
// The label at the end of each bar shows the count and the PHP value, so nothing needs hovering on a monitor.
export default function OrderStatusChart({ data }) {
  const colors = chartColors;
  const rows = data.map((row) => ({
    ...row,
    ...statusMeta(row.status),
    barLabel: `${formatNumber(row.count)} · ${formatPHPCompact(row.amount)}`,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 120, bottom: 0, left: 0 }} barCategoryGap={12}>
        <XAxis type="number" hide allowDecimals={false} />
        <YAxis
          type="category"
          dataKey="label"
          width={110}
          tick={{ fill: colors.axisStrong, fontSize: 13 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          cursor={{ fill: colors.cursor }}
          content={({ active, payload }) => {
            if (!active || !payload?.length) return null;
            const r = payload[0].payload;
            return (
              <ChartTooltip
                title={r.label}
                rows={[
                  ['Orders', formatNumber(r.count)],
                  ['Total value (PHP)', formatPHP(r.amount)],
                ]}
              />
            );
          }}
        />
        <Bar dataKey="count" minPointSize={2} radius={[0, 4, 4, 0]} maxBarSize={28} isAnimationActive={false}>
          {rows.map((r) => (
            <Cell key={r.status} fill={r.color} />
          ))}
          <LabelList dataKey="barLabel" position="right" fill={colors.axisStrong} fontSize={13} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
