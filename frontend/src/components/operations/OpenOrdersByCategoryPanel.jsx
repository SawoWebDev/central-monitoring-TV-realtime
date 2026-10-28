import { AlertTriangle } from 'lucide-react';
import Panel from '../Panel';
import AsyncContent from '../AsyncContent';
import { useApi } from '../../hooks/useApi';
import { useAutoScroll } from '../../hooks/useAutoScroll';
import { oneOf, usePersistentState } from '../../hooks/usePersistentState';
import { filterParams, formatM3, formatQty } from './openOrdersShared';
import { formatNumber } from '../../utils/format';

// "Open SO by Product Category": remaining (not yet delivered) lines of the open orders, per product category.
// Uses the table's filters except the category; clicking a row filters the "Open Sales Ordered" table.
export default function OpenOrdersByCategoryPanel({ className = '', filters, selected, onSelect, monitorMode }) {
  const [level, setLevel] = usePersistentState('openOrders.categoryLevel', 'full', oneOf('full', 'level3')); // remembered in Display mode
  const scrollRef = useAutoScroll({ enabled: monitorMode }); // slow automatic scrolling on the monitor
  const categories = useApi('/operations/open-orders/by-category', { ...filterParams({ ...filters, category: '' }), level });

  return (
    <Panel
      className={className}
      title="Open SO by Product Category"
      subtitle="Lines still to deliver, per category. Click a row to filter the table."
      actions={
        <div role="group" aria-label="Category level" className="inline-flex rounded-lg border border-neutral-200 p-0.5">
          {[
            { value: 'full', label: 'Full path' },
            { value: 'level3', label: '3rd level' },
          ].map((o) => (
            <button
              key={o.value}
              type="button"
              aria-pressed={level === o.value}
              onClick={() => setLevel(o.value)}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${level === o.value ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
            >
              {o.label}
            </button>
          ))}
        </div>
      }
    >
      <AsyncContent request={categories} height={260} isEmpty={(d) => d.length === 0} emptyText="No remaining lines for these filters.">
        {(rows) => (
          <>
            <div ref={scrollRef} className={`-mx-5 overflow-auto ${monitorMode ? 'max-h-[420px]' : 'max-h-[640px]'}`}>
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0">
                  <tr className="border-y border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                    <th scope="col" className="px-3 py-2 pl-5">Category</th>
                    <th scope="col" className="px-3 py-2 text-right">Open SOs</th>
                    <th scope="col" className="px-3 py-2 text-right">
                      Remaining qty
                      <span className="block font-normal text-neutral-400">units (mixed UoM)</span>
                    </th>
                    <th scope="col" className="px-3 py-2 pr-5 text-right">Remaining CBM</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map((r) => {
                    const isSelected = selected === r.category;
                    return (
                      <tr
                        key={r.category}
                        onClick={() => onSelect(r.category)}
                        className={`cursor-pointer ${isSelected ? 'bg-neutral-900 text-white' : 'hover:bg-neutral-50'}`}
                      >
                        <td className="max-w-[260px] px-3 py-2 pl-5" title={r.category}>
                          <button type="button" className="text-left" aria-pressed={isSelected}>
                            {r.category.replace(/^All \/ /, '')}
                          </button>
                        </td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatNumber(r.openSos)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatQty(r.remainingQty)}</td>
                        <td className="whitespace-nowrap px-3 py-2 pr-5 text-right tabular-nums">
                          {formatM3(r.remainingCbm)}
                          {r.linesWithoutVolume > 0 && (
                            <span className={`block text-xs ${isSelected ? 'text-amber-200' : 'text-amber-700'}`}>
                              {formatNumber(r.linesWithoutVolume)} lines no volume
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.some((r) => r.linesWithoutVolume > 0) && (
              <p className="mt-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-900">
                <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
                Lines without a product volume add 0 m³, so remaining CBM is a minimum.
              </p>
            )}
          </>
        )}
      </AsyncContent>
    </Panel>
  );
}
