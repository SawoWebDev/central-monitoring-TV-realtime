import AsyncContent from '../../components/AsyncContent';
import { formatDay } from '../../utils/format';
import { formatQty } from './consolidationOrderShared';

// The sheet "Consolidation FG" of the client's workbook, in the browser: products down the side, one column per sales
// order (Delivery Date / SO# / Destination on top, "TBA" when the order has no Delivery Date), remaining quantities in the
// cells, and a Grand Total column and row. The two first columns and the header rows stay in place while scrolling.
export default function ConsolidationOrderMatrix({ request, onShowDefault }) {
  return (
    <AsyncContent request={request} height={260} isEmpty={(d) => !d.tooWide && d.rows.length === 0} emptyText="No order lines match these filters.">
      {(m) => {
        if (m.tooWide) {
          return (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="font-semibold">
                {formatQty(request.meta.orders)} sales orders match: too many to show side by side (the table shows up to {request.meta.maxOrders}).
              </p>
              <p className="mt-1">
                Narrow the delivery date range, choose a destination, or search an SO#. The <strong>Order lines</strong> tab shows everything, and
                <strong> Export Excel</strong> includes all of it.
              </p>
              <button
                type="button"
                onClick={onShowDefault}
                className="mt-3 rounded-md bg-neutral-900 px-3 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700"
              >
                Show the next 30 days
              </button>
            </div>
          );
        }
        return (
          <div className="max-h-[75vh] overflow-auto rounded-lg border border-neutral-200">
            <table className="border-separate border-spacing-0 text-left text-sm">
              <thead className="text-xs">
                <tr>
                  <HeadCell sticky="left-0 w-28 min-w-28" rowSpan={3}>Product Code</HeadCell>
                  <HeadCell sticky="left-28 w-96 min-w-56 md:min-w-96 border-r-2 border-r-neutral-300" rowSpan={3}>Description</HeadCell>
                  <HeadCell className="min-w-44 text-left" rowSpan={3}>Product Category</HeadCell>
                  {m.columns.map((c) => (
                    <HeadCell key={c.orderId} className="min-w-28 text-center" top="top-0">
                      {c.deliveryDay ? formatDay(c.deliveryDay) : <span className="text-neutral-500">TBA</span>}
                    </HeadCell>
                  ))}
                  <HeadCell className="min-w-24 bg-lime-200 text-center" rowSpan={3}>Grand Total</HeadCell>
                </tr>
                <tr>
                  {m.columns.map((c) => (
                    <HeadCell key={c.orderId} className="text-center" top="top-8" title={`Sales order ${c.so}`}>
                      {c.so}
                    </HeadCell>
                  ))}
                </tr>
                <tr>
                  {m.columns.map((c) => (
                    <HeadCell key={c.orderId} className="max-w-36 text-center font-normal" top="top-16" title={c.destination ?? 'No country in the delivery address'}>
                      <span className="block truncate">{c.destination ?? 'No country'}</span>
                    </HeadCell>
                  ))}
                </tr>
              </thead>
              <tbody>
                {m.rows.map((p) => (
                  <tr key={p.key} className="group hover:bg-sky-100 [&>td:hover]:bg-sky-200 [&>td:hover]:ring-2 [&>td:hover]:ring-inset [&>td:hover]:ring-sky-500">
                    <td className="sticky left-0 z-10 w-28 min-w-28 border-b border-r border-neutral-300 bg-white group-hover:bg-sky-100 px-2 py-1.5 font-medium text-neutral-900">{p.code || '—'}</td>
                    <td className="sticky left-28 z-10 w-96 min-w-56 border-b border-r-2 border-neutral-300 border-r-neutral-400 bg-white group-hover:bg-sky-100 px-2 py-1.5 text-neutral-700 md:min-w-96" title={p.name}>
                      {p.name}
                    </td>
                    <td className="whitespace-nowrap border-b border-r border-neutral-300 px-2 py-1.5 text-neutral-700" title={p.categoryPath ?? 'This product has no category in Odoo'}>
                      {p.category}
                    </td>
                    {p.cells.map((q, i) => (
                      <td key={m.columns[i].orderId} title={q === null ? undefined : `${m.columns[i].so} · ${p.code || p.name}: ${formatQty(q)}`} className="border-b border-r border-neutral-300 px-2 py-1.5 text-center tabular-nums text-neutral-900">
                        {q === null ? '' : formatQty(q)}
                      </td>
                    ))}
                    <td className="border-b border-neutral-300 bg-lime-100 px-2 py-1.5 text-center font-semibold tabular-nums">{formatQty(p.total)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="sticky bottom-0 left-0 z-20 border-t-2 border-neutral-300 bg-lime-100 px-2 py-2" colSpan={3}>
                    Grand Total
                  </td>
                  {m.columns.map((c) => (
                    <td key={c.orderId} className="sticky bottom-0 z-10 border-t-2 border-neutral-300 bg-lime-100 px-2 py-2 text-center tabular-nums">
                      {formatQty(c.total)}
                    </td>
                  ))}
                  <td className="sticky bottom-0 z-10 border-t-2 border-neutral-300 bg-lime-200 px-2 py-2 text-center tabular-nums">{formatQty(m.grandTotal)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      }}
    </AsyncContent>
  );
}

// A header cell that stays at the top (and, with `sticky`, also at the left) while the table scrolls.
function HeadCell({ children, sticky = '', top = 'top-0', className = '', ...props }) {
  return (
    <th
      scope="col"
      className={`sticky ${top} ${sticky ? `${sticky} z-30` : 'z-20'} h-8 whitespace-nowrap border-b border-r border-neutral-300 bg-neutral-100 px-2 py-0 font-semibold text-neutral-700 ${className}`}
      {...props}
    >
      {children}
    </th>
  );
}
