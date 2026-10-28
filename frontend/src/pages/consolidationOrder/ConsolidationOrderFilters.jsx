import { useState } from 'react';
import { Search, X } from 'lucide-react';
import ConsolidationOrderSoInput from './ConsolidationOrderSoInput';
import { filterProblem, parseSoList, usesDates } from './consolidationOrderShared';

const input = 'w-full rounded-md border border-neutral-300 bg-white px-2 py-1.5 text-sm disabled:cursor-not-allowed disabled:bg-neutral-100 disabled:text-neutral-400';

// How the Delivery Date is used. "range" never shows anything outside the two dates.
const DELIVERY_MODES = [
  { value: 'range', label: 'Date Range' },
  { value: 'rangeOrNoDate', label: 'Date Range + No Delivery Date (TBA)' },
  { value: 'overdue', label: 'Overdue (before today)' },
  { value: 'noDate', label: 'Only No Delivery Date (TBA)' },
  { value: 'all', label: 'Any Date' },
];

function Field({ label, children }) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-xs font-medium text-neutral-600">
      {label}
      {children}
    </label>
  );
}

// The filter form. The boxes (the page's `draft`) change freely; nothing is searched until "Apply Filters" (or Enter)
// is pressed. All filters work together. `destinations` = [{ value, label, orders }] for the dropdown.
export default function ConsolidationOrderFilters({ draft, onDraft, destinations, busy, onApply, onClear }) {
  const [soText, setSoText] = useState(''); // an SO# typed but not yet turned into a chip
  const problem = filterProblem(draft);
  const set = (key) => (e) => onDraft({ ...draft, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });

  return (
    <form
      className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 p-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (problem) return;
        // an SO# that is typed but not yet a chip counts too
        const merged = { ...draft, so: parseSoList([...draft.so, ...parseSoList(soText)]) };
        setSoText('');
        onDraft(merged);
        onApply(merged);
      }}
      aria-label="Consolidation Order filters"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4 2xl:grid-cols-9">
        <div className="flex min-w-0 flex-col gap-1 text-xs font-medium text-neutral-600 sm:col-span-2">
          <span id="co-so-label">SO# (one or more)</span>
          <ConsolidationOrderSoInput labelId="co-so-label" values={draft.so} text={soText} onValues={(so) => onDraft({ ...draft, so })} onText={setSoText} />
        </div>
        <Field label="Destination">
          <select value={draft.destination} onChange={set('destination')} className={input}>
            <option value="">All Destinations</option>
            {destinations.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label} ({d.orders})
              </option>
            ))}
          </select>
        </Field>
        <Field label="Delivery date">
          <select value={draft.deliveryMode} onChange={set('deliveryMode')} className={input}>
            {DELIVERY_MODES.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Delivery date: from">
          <input type="date" value={draft.deliveryFrom} onChange={set('deliveryFrom')} disabled={!usesDates(draft.deliveryMode)} className={input} />
        </Field>
        <Field label="Delivery date: to">
          <input type="date" value={draft.deliveryTo} onChange={set('deliveryTo')} disabled={!usesDates(draft.deliveryMode)} className={input} />
        </Field>
        <Field label="Product Ref. / Item Code">
          <input type="search" value={draft.productRef} onChange={set('productRef')} placeholder="e.g. 340-D" className={input} />
        </Field>
        <Field label="Product Name">
          <input type="search" value={draft.productName} onChange={set('productName')} placeholder="e.g. Pail" className={input} />
        </Field>
        <Field label="Order Quantity: min">
          <input type="number" min="0" step="any" inputMode="decimal" value={draft.qtyMin} onChange={set('qtyMin')} className={input} />
        </Field>
        <Field label="Order Quantity: max">
          <input type="number" min="0" step="any" inputMode="decimal" value={draft.qtyMax} onChange={set('qtyMax')} className={input} />
        </Field>
        {/* The two options and the buttons fill the rest of the row next to "Order Quantity: max", level with its box
            (self-end, same height). Spans: the fields leave 2 free columns at sm and lg, 8 at 2xl (SO# takes 2 of the 9). */}
        <div className="flex min-h-[34px] flex-wrap items-center gap-x-5 gap-y-2 self-end text-sm text-neutral-700 sm:col-span-2 2xl:col-span-8">
          <label
            className="inline-flex cursor-pointer items-center gap-2"
            title="Also list the lines of the open orders that have nothing left to ship (fully delivered, or an ordered quantity of 0). They show on the Order lines tab and in the Excel Details sheet."
          >
            <input type="checkbox" className="size-4 accent-neutral-900" checked={draft.includeDelivered} onChange={set('includeDelivered')} />
            Include lines with nothing left to ship
          </label>
          <label
            className="inline-flex cursor-pointer items-center gap-2"
            title="Also list items that have a manufacturing order for the sales order but are not on the order itself (for example accessories the planners add to a container). They are marked in the Source column."
          >
            <input type="checkbox" className="size-4 accent-neutral-900" checked={draft.includeMo} onChange={set('includeMo')} />
            Include items made for the order (manufacturing orders)
          </label>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setSoText('');
                onClear();
              }}
              className="inline-flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-1.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100"
            >
              <X className="size-4" aria-hidden />
              Clear Filters
            </button>
            <button
              type="submit"
              disabled={Boolean(problem) || busy}
              className="inline-flex items-center gap-1.5 rounded-md bg-neutral-900 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-50"
            >
              <Search className="size-4" aria-hidden />
              Apply Filters
            </button>
          </div>
        </div>
      </div>
      {problem && (
        <p role="alert" className="mt-2 text-xs font-medium text-rose-700">
          {problem}
        </p>
      )}
    </form>
  );
}
