import { Fragment, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Download, Filter, Loader2, Search, X } from 'lucide-react';
import Panel from '../Panel';
import AsyncContent from '../AsyncContent';
import { useApi } from '../../hooks/useApi';
import api, { errorMessage } from '../../services/api';
import { DELIVERY_META } from '../sales/salesStatus';
import { STAGE_META } from './stageMeta';
import { filterParams, formatM3, formatQty } from './openOrdersShared';
import { formatDate, formatNumber } from '../../utils/format';

const PAGE_SIZE = 20;
const MONITOR_PAGE_SIZE = 10;

// Quick-sort buttons. The first click uses sortOrder; clicking the active button again flips the direction
// (like the column titles, which can still sort by any column). Orders without a value are always listed last.
const SORT_PRESETS = [
  { label: 'Order date', sortBy: 'orderDate', sortOrder: 'desc', hint: { desc: 'Newest orders first', asc: 'Oldest orders first' } },
  { label: 'Delivery date', sortBy: 'commitmentDate', sortOrder: 'desc', hint: { desc: 'Latest delivery date first', asc: 'Earliest delivery date first' } },
  { label: 'Days open', sortBy: 'daysOpen', sortOrder: 'desc', hint: { desc: 'Orders open the longest first', asc: 'Most recently opened orders first' } },
];

// "Open Sales Ordered": one row per open sales order (confirmed, not fully delivered). NO money.
export default function OpenOrdersPanel({
  className = '',
  filters,
  searchInput,
  onSearchInput,
  onFilter,
  sort,
  onSort,
  onSortPreset,
  page,
  onPage,
  monitorMode,
}) {
  const [expanded, setExpanded] = useState(() => new Set());
  const params = {
    ...filterParams(filters),
    sortBy: sort.sortBy,
    sortOrder: sort.sortOrder,
    page: monitorMode ? 1 : page,
    limit: monitorMode ? MONITOR_PAGE_SIZE : PAGE_SIZE,
  };
  const orders = useApi('/operations/open-orders', params);
  const csvUrl = `/api/operations/open-orders.csv?${new URLSearchParams({ ...filterParams(filters), sortBy: sort.sortBy, sortOrder: sort.sortOrder })}`;
  const meta = orders.meta;

  // An auto-refresh can make the list shorter (orders delivered). If this page no longer exists, go to the
  // last one; otherwise the panel shows "No open sales orders" and the paging buttons are gone.
  useEffect(() => {
    if (!monitorMode && meta && page > meta.totalPages) onPage(meta.totalPages);
  }, [monitorMode, meta, page, onPage]);

  const toggle = (id) =>
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Panel
      className={className}
      title="Open Sales Ordered"
      subtitle="Confirmed orders not fully delivered. Late = promised delivery date passed. Click an SO# to see its lines."
      actions={
        <div className="flex flex-wrap items-center gap-4">
          {/* Quick sort (also works in monitor mode): newest orders first, or longest open first. */}
          <div className="flex items-center gap-2 text-xs font-medium text-neutral-600">
            Sort
            <div role="group" aria-label="Sort orders" className="inline-flex rounded-lg border border-neutral-200 p-0.5">
              {SORT_PRESETS.map((preset) => {
                const active = sort.sortBy === preset.sortBy;
                const nextOrder = active ? (sort.sortOrder === 'desc' ? 'asc' : 'desc') : preset.sortOrder;
                // Always shown: the current direction on the active button, the first-click direction (light) on the others
                const Arrow = (active ? sort.sortOrder : preset.sortOrder) === 'asc' ? ArrowUp : ArrowDown;
                return (
                  <button
                    key={preset.sortBy}
                    type="button"
                    aria-pressed={active}
                    title={active ? `${preset.hint[sort.sortOrder]} (click for: ${preset.hint[nextOrder].toLowerCase()})` : preset.hint[preset.sortOrder]}
                    onClick={() => onSortPreset({ sortBy: preset.sortBy, sortOrder: nextOrder })}
                    className={`inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${active ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
                  >
                    {preset.label}
                    <Arrow className={`size-3 ${active ? '' : 'text-neutral-400'}`} aria-hidden />
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      }
    >
      {!monitorMode && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          <label className="relative">
            <span className="sr-only">Search by SO#, customer or destination</span>
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-neutral-400" aria-hidden />
            <input
              type="search"
              value={searchInput}
              onChange={(e) => onSearchInput(e.target.value)}
              placeholder="Search SO#, customer or destination"
              className="w-72 rounded-md border border-neutral-300 py-1.5 pl-8 pr-2 text-sm"
            />
          </label>
          <select
            aria-label="Customer"
            value={filters.customer}
            onChange={(e) => onFilter('customer', e.target.value)}
            className="max-w-56 rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="">All customers</option>
            {(meta?.customers ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.openOrders})
              </option>
            ))}
          </select>
          <select
            aria-label="Age"
            value={filters.age}
            onChange={(e) => onFilter('age', e.target.value)}
            className="rounded-md border border-neutral-300 px-2 py-1.5 text-sm"
          >
            <option value="all">All ages</option>
            {(meta?.ageBuckets ?? []).map((b) => (
              <option key={b.key} value={b.key}>
                {b.label}
              </option>
            ))}
          </select>
          <label className="inline-flex cursor-pointer items-center gap-2 px-1 text-neutral-700">
            <input type="checkbox" className="size-4 accent-neutral-900" checked={filters.lateOnly} onChange={(e) => onFilter('lateOnly', e.target.checked)} />
            Late only
          </label>
          {filters.category && (
            <button
              type="button"
              onClick={() => onFilter('category', '')}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-neutral-900 px-2.5 py-1 text-xs font-medium text-white"
              title="Remove the category filter"
            >
              <span className="truncate">Category: {filters.category.replace(/^All \/ /, '')}</span>
              <X className="size-3.5 shrink-0" aria-hidden />
            </button>
          )}
          <a
            href={csvUrl}
            className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-neutral-200 px-2.5 py-1.5 text-xs font-medium text-neutral-700 hover:bg-neutral-50"
          >
            <Download className="size-3.5" aria-hidden />
            CSV
          </a>
        </div>
      )}
      {monitorMode && <ActiveFilters filters={filters} meta={meta} />}

      <AsyncContent request={orders} height={260} isEmpty={(d) => d.length === 0} emptyText="No open sales orders match these filters.">
        {(rows) => (
          <>
            <p className="mb-2 text-sm text-neutral-600">
              <span className="font-semibold text-neutral-900">{formatNumber(meta.total)}</span> of {formatNumber(meta.counts.openOrders)} open orders ·{' '}
              <span className="font-semibold text-brand-dark">{formatNumber(meta.counts.late)} late</span> ·{' '}
              <span className="text-neutral-500">{formatNumber(meta.counts.noDeliveryDate)} without delivery date</span>
            </p>
            {/* About 10 rows high; the rest of the page (and opened order lines) scroll inside, column titles stay on top */}
            <div className="-mx-5 max-h-[520px] overflow-auto">
              <table className="w-full min-w-[1100px] text-left text-sm">
                <thead className="sticky top-0 z-10">
                  <tr className="border-y border-neutral-200 bg-neutral-50 text-xs font-semibold text-neutral-600">
                    <SortHeader label="SO#" field="reference" sort={sort} onSort={onSort} className="pl-5" />
                    <th scope="col" className="px-3 py-2">Destination</th>
                    <SortHeader label="Customer" field="customer" sort={sort} onSort={onSort} />
                    <SortHeader label="Order date" field="orderDate" sort={sort} onSort={onSort} />
                    <SortHeader label="Delivery date" field="commitmentDate" sort={sort} onSort={onSort} />
                    <th scope="col" className="px-3 py-2">Delivery</th>
                    <th scope="col" className="px-3 py-2">Stage</th>
                    <SortHeader label="Order CBM" field="orderCbm" sort={sort} onSort={onSort} align="right" />
                    <SortHeader label="Remaining CBM" field="remainingCbm" sort={sort} onSort={onSort} align="right" />
                    <SortHeader label="Days open" field="daysOpen" sort={sort} onSort={onSort} align="right" />
                    <th scope="col" className="px-3 py-2 pr-5">Late</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {rows.map((o) => {
                    const open = expanded.has(o.id);
                    return (
                      <Fragment key={o.id}>
                        <tr className={o.late ? 'bg-rose-50/70' : undefined}>
                          <td className={`whitespace-nowrap px-3 py-2 pl-5 ${o.late ? 'border-l-4 border-brand' : 'border-l-4 border-transparent'}`}>
                            <button
                              type="button"
                              onClick={() => toggle(o.id)}
                              aria-expanded={open}
                              className="inline-flex items-center gap-1 font-semibold text-neutral-900 hover:underline"
                            >
                              {open ? <ChevronDown className="size-4" aria-hidden /> : <ChevronRight className="size-4" aria-hidden />}
                              {o.reference}
                            </button>
                          </td>
                          <td className="max-w-[180px] truncate px-3 py-2 text-neutral-700" title={o.destination ?? undefined}>
                            {o.destination ?? <span className="text-neutral-400">—</span>}
                          </td>
                          <td className="max-w-[220px] truncate px-3 py-2 text-neutral-700" title={o.customerName}>{o.customerName}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-neutral-700">{formatDate(o.orderDate)}</td>
                          <td className="whitespace-nowrap px-3 py-2">
                            {o.commitmentDate ? (
                              <span className={o.late ? 'font-semibold text-brand-dark' : 'text-neutral-700'}>{formatDate(o.commitmentDate)}</span>
                            ) : (
                              <span className="text-neutral-400">No delivery date</span>
                            )}
                          </td>
                          <td className="px-3 py-2"><Pill meta={DELIVERY_META[o.deliveryStatus]} fallback={o.deliveryStatus} /></td>
                          <td className="px-3 py-2"><Pill meta={STAGE_META[o.stage]} fallback={o.stage} /></td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-700">{formatM3(o.orderCbm)}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-900">
                            {formatM3(o.remainingCbm)}
                            {o.linesWithoutVolume > 0 && (
                              <span className="block text-xs text-amber-700" title="Some remaining lines have no volume in Odoo, so this is a minimum">
                                + {o.linesWithoutVolume} line{o.linesWithoutVolume === 1 ? '' : 's'} no volume
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-neutral-900">{o.daysOpen == null ? '—' : formatNumber(o.daysOpen)}</td>
                          <td className="whitespace-nowrap px-3 py-2 pr-5">
                            {o.late ? (
                              <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-white">Late</span>
                            ) : o.noDeliveryDate ? (
                              <span className="text-xs text-neutral-400">No delivery date</span>
                            ) : (
                              <span className="text-xs text-neutral-500">On time</span>
                            )}
                          </td>
                        </tr>
                        {open && (
                          <tr className="bg-neutral-50/70">
                            <td colSpan={11} className="px-5 py-2 pl-12">
                              {!monitorMode && <ExcelButton order={o} />}
                              <OrderLines lines={o.lines} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!monitorMode && meta.totalPages > 1 && (
              <div className="mt-3 flex items-center justify-end gap-2 text-sm text-neutral-600">
                <button type="button" disabled={page <= 1} onClick={() => onPage(page - 1)} className="rounded-md border border-neutral-200 px-2.5 py-1 disabled:opacity-40">
                  Previous
                </button>
                <span className="tabular-nums">
                  Page {formatNumber(meta.page)} of {formatNumber(meta.totalPages)}
                </span>
                <button type="button" disabled={page >= meta.totalPages} onClick={() => onPage(page + 1)} className="rounded-md border border-neutral-200 px-2.5 py-1 disabled:opacity-40">
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </AsyncContent>
    </Panel>
  );
}

// Display mode hides the filter controls, so the active filters (also remembered after a reload) are spelled
// out here; otherwise a wall monitor could show e.g. only late orders without saying so.
function ActiveFilters({ filters, meta }) {
  const parts = [];
  if (filters.search) parts.push(`Search "${filters.search}"`);
  if (filters.customer) {
    const customer = meta?.customers?.find((c) => String(c.id) === filters.customer);
    parts.push(`Customer: ${customer?.name ?? `#${filters.customer}`}`);
  }
  if (filters.category) parts.push(`Category: ${filters.category.replace(/^All \/ /, '')}`);
  if (filters.age !== 'all') parts.push(`Age: ${meta?.ageBuckets?.find((b) => b.key === filters.age)?.label ?? filters.age}`);
  if (filters.lateOnly) parts.push('Late only');
  if (parts.length === 0) return null;

  return (
    <p className="mb-3 flex items-start gap-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
      <Filter className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>
        <span className="font-semibold">Filtered by:</span> {parts.join(' · ')}
        <span className="text-amber-800"> (untick Display mode in the menu to change)</span>
      </span>
    </p>
  );
}

// "SO 9259.xlsx" for S09259 (same name the backend gives the file).
const excelFileName = (reference) => {
  const m = /^S0*(\d+)$/.exec(reference);
  return `${m ? `SO ${m[1]}` : reference.replace(/[^\w .-]/g, '_')}.xlsx`;
};

// Downloads this one order as an Excel file. The backend reads it from Odoo (read-only) and builds the file.
function ExcelButton({ order }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await api.get(`/operations/open-orders/${order.id}/export.xlsx`, { responseType: 'blob', timeout: 60_000 });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = excelFileName(order.reference);
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      // an error body arrives as a Blob: read the backend's short message from it
      let message = errorMessage(err);
      try {
        message = JSON.parse(await err.response.data.text()).message || message;
      } catch {
        // keep the generic message
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    // The order lines table is wider than small screens and scrolls sideways. This bar is pinned to the left edge
    // of the visible area (sticky) and limited to the screen width, so the button never scrolls out of sight.
    <div className="sticky left-0 mb-2 flex w-[calc(100vw-4rem)] max-w-full flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        title={busy ? 'Preparing Excel…' : 'Download this order as Excel'}
        aria-label={busy ? 'Preparing Excel…' : 'Download Excel'}
        className="inline-flex size-8 items-center justify-center rounded-md border border-neutral-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin text-neutral-700" aria-hidden /> : <Download className="size-4" aria-hidden />}
      </button>
      {error && <span role="alert" className="text-xs text-rose-700">Could not create the Excel file: {error}</span>}
    </div>
  );
}

function OrderLines({ lines }) {
  if (lines.length === 0) return <p className="py-1 text-xs text-neutral-500">No product lines.</p>;
  return (
    <table className="w-full text-left text-xs">
      <thead>
        <tr className="text-neutral-500">
          <th scope="col" className="py-1 pr-3 font-semibold">Product</th>
          <th scope="col" className="py-1 pr-3 font-semibold">Category</th>
          <th scope="col" className="py-1 pr-3 text-right font-semibold">Ordered</th>
          <th scope="col" className="py-1 pr-3 text-center font-semibold">Manufacturing Order State</th>
          <th scope="col" className="py-1 pr-3 text-right font-semibold">Delivered</th>
          <th scope="col" className="py-1 pr-3 text-right font-semibold">Remaining</th>
          <th scope="col" className="py-1 pr-3 text-right font-semibold">CBM (ordered)</th>
          <th scope="col" className="py-1 text-right font-semibold">Remaining CBM</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l) => (
          <tr key={l.id} className={l.remainingQty > 0 ? 'text-neutral-800' : 'text-neutral-400'}>
            <td className="max-w-[320px] truncate py-1 pr-3" title={l.productName}>{l.productName}</td>
            <td className="max-w-[240px] truncate py-1 pr-3" title={l.category}>{l.category.replace(/^All \/ /, '')}</td>
            <td className="py-1 pr-3 text-right tabular-nums">{formatQty(l.orderedQty)}</td>
            <td className="py-1 pr-3"><MoStates mos={l.mos ?? []} /></td>
            <td className="py-1 pr-3 text-right tabular-nums">{formatQty(l.deliveredQty)}</td>
            <td className="py-1 pr-3 text-right font-medium tabular-nums">{formatQty(l.remainingQty)}</td>
            <td className="py-1 pr-3 text-right tabular-nums">{formatM3(l.cbm)}</td>
            <td className="py-1 text-right tabular-nums">
              {l.noVolume && l.remainingQty > 0 ? <span className="text-amber-700">no volume</span> : formatM3(l.remainingCbm)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// Odoo mrp.production states. Done / Confirmed use Odoo's green and teal, a shade darker so white text stays readable.
const MO_STATE_META = {
  draft: { label: 'Draft', className: 'bg-neutral-200 text-neutral-700' },
  confirmed: { label: 'Confirmed', className: 'bg-[#117a8b] text-white' },
  progress: { label: 'In Progress', className: 'bg-amber-100 text-amber-800' },
  to_close: { label: 'To Close', className: 'bg-amber-100 text-amber-800' },
  done: { label: 'Done', className: 'bg-[#198754] text-white' },
  cancel: { label: 'Cancelled', className: 'bg-neutral-100 text-neutral-500' },
};

// One badge per state, with a count when a line has several MOs in that state; MO references on hover.
function MoStates({ mos }) {
  if (mos.length === 0) return <span className="block text-center text-neutral-400">No MO</span>;
  const groups = new Map();
  for (const mo of mos) groups.set(mo.state, [...(groups.get(mo.state) ?? []), mo.reference]);
  return (
    <span className="flex flex-wrap justify-center gap-1">
      {[...groups].map(([state, refs]) => {
        const meta = MO_STATE_META[state];
        return (
          <span
            key={state}
            title={refs.join(', ')}
            className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${meta?.className ?? 'bg-neutral-200 text-neutral-700'}`}
          >
            {meta?.label ?? state}
            {refs.length > 1 && ` ×${refs.length}`}
          </span>
        );
      })}
    </span>
  );
}

// Sortable column title. The sorted column shows ↓ / ↑; every other sortable column shows the same ↓ in light grey,
// so it is clear that it can be clicked too (first click: descending, second click: ascending).
function SortHeader({ label, field, sort, onSort, align = 'left', className = '' }) {
  const active = sort.sortBy === field;
  const Arrow = active && sort.sortOrder === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th scope="col" className={`px-3 py-2 ${align === 'right' ? 'text-right' : ''} ${className}`} aria-sort={active ? (sort.sortOrder === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={() => onSort(field)}
        title={`Sort by ${label.toLowerCase()}`}
        className={`group inline-flex items-center gap-1 ${active ? 'text-neutral-900' : 'hover:text-neutral-900'}`}
      >
        {label}
        <Arrow className={`size-3 ${active ? '' : 'text-neutral-400 group-hover:text-neutral-700'}`} aria-hidden />
      </button>
    </th>
  );
}

function Pill({ meta, fallback }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-neutral-700">
      <span className="size-2.5 rounded-sm" style={{ backgroundColor: meta?.color ?? '#a3a3a3' }} aria-hidden />
      {meta?.label ?? fallback}
    </span>
  );
}
