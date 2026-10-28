// A compact table where number columns are shaded like a heat map: the bigger the value,
// the stronger the background tint (the number itself is always printed, so color is never the only cue).
// columns: [{ key, label, align, format, heat }] where heat is an "r, g, b" string or undefined.
// getValue(row, key) returns the raw value for a column.
export default function HeatTable({ columns, rows, getKey, getValue }) {
  const max = {};
  columns.forEach((col) => {
    if (col.heat) max[col.key] = Math.max(0, ...rows.map((row) => Number(getValue(row, col.key)) || 0));
  });

  return (
    <div className="-mx-5 overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-y border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
            {columns.map((col) => (
              <th key={col.key} scope="col" className={`whitespace-nowrap px-3 py-2 first:pl-5 last:pr-5 ${alignClass(col.align)}`}>
                {col.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-neutral-100">
          {rows.map((row) => (
            <tr key={getKey(row)}>
              {columns.map((col) => {
                const value = getValue(row, col.key);
                const shade = col.heat && max[col.key] > 0 ? 0.08 + 0.4 * ((Number(value) || 0) / max[col.key]) : 0;
                return (
                  <td
                    key={col.key}
                    className={`px-3 py-2 first:pl-5 last:pr-5 ${alignClass(col.align)} ${
                      col.heat ? 'whitespace-nowrap font-medium tabular-nums text-neutral-900' : 'max-w-[220px] truncate text-neutral-800'
                    }`}
                    style={col.heat ? { backgroundColor: `rgba(${col.heat}, ${shade.toFixed(3)})` } : undefined}
                    title={col.heat ? undefined : String(value ?? '')}
                  >
                    {col.format ? col.format(value, row) : value}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function alignClass(align) {
  return align === 'right' ? 'text-right' : 'text-left';
}
