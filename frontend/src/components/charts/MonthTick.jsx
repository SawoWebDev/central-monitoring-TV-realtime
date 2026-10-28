import { chartColors } from '../../utils/chartColors';

// X-axis tick for monthly charts: bold, darker text so the month labels read clearly on a wall
// monitor. The current (partial) month is picked out in SAWO red so it's obvious which bar is
// still filling up. `partials` is a same-length array of booleans, one per tick (by data index).
export default function MonthTick({ x, y, payload, index, partials }) {
  const isCurrent = partials?.[index];
  return (
    <text
      x={x}
      y={y}
      dy={14}
      textAnchor="middle"
      fontSize={13}
      fontWeight={700}
      fill={isCurrent ? chartColors.current : '#171717'}
    >
      {payload.value}
    </text>
  );
}
