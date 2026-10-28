import { ArrowDown, ArrowUp } from 'lucide-react';
import AsyncContent from '../../components/AsyncContent';
import { formatDate } from '../../utils/format';
import { formatQty } from './consolidationOrderShared';

// The sheet "Sheet4" of the client's workbook, in the browser: one row per order line of the open sales orders
// (SO#, destination, product, delivery date, quantities). Sortable on every column, paged.
// The state of a manufacturing order, as Odoo names it
const MO_STATE = { draft: 'Draft', confirmed: 'Confirmed', progress: 'In progress', to_close: 'To close', done: 'Done' };

const COLUMNS = [
  { label: 'SO#', field: 'so' },
  { label: 'Destination', field: 'destination' },
  { label: 'Product Ref. / Item Code', field: 'productCode' },
  { label: 'Product Name', field: 'productName' },
  { label: 'Product Category' },
  { label: 'Delivery Date', field: 'deliveryDate' },
  { label: 'Ordered', align: 'right' },
  { label: 'CBM (ordered)', align: 'right' },
  { label: 'Delivered', align: 'right' },
  { label: 'Order Quantity (remaining)', field: 'quantity', align: 'right' },
  { label: 'Remaining CBM', align: 'right' },
  { label: 'Source' },
];

// m³ = quantity x the product's volume in Odoo; "—" when the product has no volume there (counted as 0)
const formatCbm = (r, value) => (r.noVolume ? '—' : value.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 }));

export default function ConsolidationOrderList({ request, sort, onSort, page, onPage }) {
  return (
    <AsyncContent request={request} height={260} isEmpty={(rows) => rows.length === 0} emptyText="No order lines match these filters.">
      {(rows) => {
        const meta = request.meta;
        return (
          <>
            <div className="max-h-[75vh] overflow-auto rounded-lg border border-neutral-200">
              <table className="w-full min-w-[1350px] border-separate border-spacing-0 text-left text-sm">
                <thead>
                  <tr className="text-xs text-neutral-600">
                    {COLUMNS.map((c) => (
                      <SortHeader key={c.label} column={c} sort={sort} onSort={onSort} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.lineId} className={`hover:bg-sky-100 [&>td:hover]:bg-sky-200 [&>td:hover]:ring-2 [&>td:hover]:ring-inset [&>td:hover]:ring-sky-500 ${r.remainingQty === 0 ? 'text-neutral-400' : ''}`} title={r.remainingQty === 0 ? 'Nothing left to ship (fully delivered, or ordered quantity 0)' : undefined}>
                      <td className="whitespace-nowrap border-b border-r border-neutral-300 px-3 py-1.5 font-medium text-neutral-900">{r.so}</td>
                      <td className="whitespace-nowrap border-b border-r border-neutral-300 px-3 py-1.5 text-neutral-700">
                        {r.destination ?? <span className="text-neutral-400">—</span>}
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-neutral-300 px-3 py-1.5 text-neutral-900">{r.productCode || <span className="text-neutral-400">—</span>}</td>
                      <td className="max-w-[420px] truncate border-b border-r border-neutral-300 px-3 py-1.5 text-neutral-700" title={r.productName}>
                        {r.productName}
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-neutral-300 px-3 py-1.5 text-neutral-700" title={r.categoryPath ?? 'This product has no category in Odoo'}>
                        {r.category}
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-neutral-300 px-3 py-1.5">
                        {r.deliveryDate ? formatDate(r.deliveryDate) : <span className="text-neutral-500">TBA</span>}
                      </td>
                      <td className="border-b border-r border-neutral-300 px-3 py-1.5 text-right tabular-nums text-neutral-600">{formatQty(r.orderedQty)}</td>
                      <td className="border-b border-r border-neutral-300 px-3 py-1.5 text-right tabular-nums text-neutral-600" title={r.noVolume ? 'This product has no volume in Odoo' : undefined}>
                        {formatCbm(r, r.cbmOrdered)}
                      </td>
                      <td className="border-b border-r border-neutral-300 px-3 py-1.5 text-right tabular-nums text-neutral-600">{formatQty(r.deliveredQty)}</td>
                      <td className="border-b border-r border-neutral-300 px-3 py-1.5 text-right font-semibold tabular-nums text-neutral-900">{formatQty(r.remainingQty)}</td>
                      <td className="border-b border-r border-neutral-300 px-3 py-1.5 text-right tabular-nums text-neutral-900" title={r.noVolume ? 'This product has no volume in Odoo' : undefined}>
                        {formatCbm(r, r.cbmRemaining)}
                      </td>
                      <td className="whitespace-nowrap border-b border-r border-neutral-300 px-3 py-1.5">
                        {r.source === 'mo' ? (
                          <span
                            className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900"
                            title={`Not on the sales order: made for it by manufacturing order ${r.moReference} (${MO_STATE[r.moState] ?? r.moState})`}
                          >
                            MO {r.moReference} · {MO_STATE[r.moState] ?? r.moState}
                          </span>
                        ) : (
                          <span className="text-xs text-neutral-500">Order line</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {meta.totalPages > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2 text-sm text-neutral-600">
                <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-md border border-neutral-200 px-2.5 py-1 disabled:opacity-40">
                  Previous
                </button>
                <span className="tabular-nums">
                  Page {meta.page} of {meta.totalPages}
                </span>
                <button type="button" disabled={page >= meta.totalPages} onClick={() => onPage(page + 1)} className="rounded-md border border-neutral-200 px-2.5 py-1 disabled:opacity-40">
                  Next
                </button>
              </div>
            )}
          </>
        );
      }}
    </AsyncContent>
  );
}

// Column title: the sorted column shows ↓ / ↑, the other sortable ones the same arrow in light grey (like Open Sales Ordered).
function SortHeader({ column: { label, field, align }, sort, onSort }) {
  const right = align === 'right' ? 'text-right' : '';
  const base = `sticky top-0 z-10 whitespace-nowrap border-b border-r border-neutral-300 bg-neutral-100 px-3 py-2 font-semibold ${right}`;
  if (!field) {
    return (
      <th scope="col" className={base}>
        {label}
      </th>
    );
  }
  const active = sort.sortBy === field;
  const Arrow = active && sort.sortOrder === 'desc' ? ArrowDown : active ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={base} aria-sort={active ? (sort.sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(field)} title={`Sort by ${label.toLowerCase()}`} className={`group inline-flex items-center gap-1 ${active ? 'text-neutral-900' : 'hover:text-neutral-900'}`}>
        {label}
        <Arrow className={`size-3 ${active ? '' : 'text-neutral-400 group-hover:text-neutral-700'}`} aria-hidden />
      </button>
    </th>
  );
}
