// The box that appears when hovering a bar. `rows` is a list of [label, value].
export default function ChartTooltip({ title, rows }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-neutral-900">{title}</p>
      <dl className="space-y-0.5">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-6">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="font-medium tabular-nums text-neutral-900">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
