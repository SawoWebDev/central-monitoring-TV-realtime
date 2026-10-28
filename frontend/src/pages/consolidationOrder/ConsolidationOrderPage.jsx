import { useState } from 'react';
import { Download, FileSpreadsheet, Info, Loader2 } from 'lucide-react';
import Panel from '../../components/Panel';
import api, { errorMessage } from '../../services/api';
import { useApi } from '../../hooks/useApi';
import { todayInAppTimezone, formatNumber } from '../../utils/format';
import ConsolidationOrderFilters from './ConsolidationOrderFilters';
import ConsolidationOrderList from './ConsolidationOrderList';
import ConsolidationOrderMatrix from './ConsolidationOrderMatrix';
import { EMPTY_FILTERS, defaultFilters, filterParams, formatQty } from './consolidationOrderShared';

const PAGE_SIZE = 50;
const TABS = [
  { key: 'matrix', label: 'Consolidation', hint: 'Products × sales orders, like the sheet "Consolidation FG"' },
  { key: 'lines', label: 'Order Lines', hint: 'One row per order line, like the sheet "Sheet4"' },
];

// Consolidation Order: the open sales orders' lines to be made and shipped, as the client's planning workbook
// "Consolidated Order of WWP1" shows them. Read-only: everything comes from our server's copy of Odoo.
export default function ConsolidationOrderPage() {
  const [initial] = useState(() => defaultFilters(todayInAppTimezone())); // from today to 30 days ahead
  const [draft, setDraft] = useState(initial); // what is typed in the filter boxes
  const [applied, setApplied] = useState(initial); // what the tables use (after "Apply Filters")
  const [tab, setTab] = useState('matrix');
  const [sort, setSort] = useState({ sortBy: 'deliveryDate', sortOrder: 'asc' });
  const [page, setPage] = useState(1);

  const params = filterParams(applied);
  // The order lines request always runs: it also gives the summary and the destination choices for every tab.
  const lines = useApi('/consolidation/lines', { ...params, ...sort, page: tab === 'lines' ? page : 1, limit: tab === 'lines' ? PAGE_SIZE : 1 });
  const meta = lines.meta;

  const apply = (filters) => {
    setApplied(filters);
    setPage(1);
  };
  const showDefault = () => {
    const defaults = defaultFilters(todayInAppTimezone());
    setDraft(defaults);
    apply(defaults);
  };

  return (
    <div className="mx-auto max-w-[1920px] space-y-4">
      <h2 className="font-serif text-3xl text-neutral-900">Consolidation Order</h2>
      <Panel
        title="Order Lines to Make and Ship"
        subtitle="Finished goods of the open sales orders. Order Quantity = still to deliver (ordered − delivered). Destination = country of the delivery address; Delivery Date = the order's Delivery Date in Odoo."
        actions={<ExportButton params={params} />}
      >
        <ConsolidationOrderFilters
          draft={draft}
          onDraft={setDraft}
          destinations={meta?.destinations ?? []}
          busy={lines.loading}
          onApply={(filters) => apply(filters ?? draft)}
          onClear={() => {
            setDraft(EMPTY_FILTERS);
            apply(EMPTY_FILTERS);
          }}
        />

        {meta && <Summary meta={meta} />}

        <div role="tablist" aria-label="View" className="mb-3 inline-flex rounded-lg border border-neutral-200 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={tab === t.key}
              title={t.hint}
              onClick={() => setTab(t.key)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t.key ? 'bg-neutral-900 text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'matrix' ? (
          <MatrixTab params={params} onShowDefault={showDefault} />
        ) : (
          <ConsolidationOrderList
            request={lines}
            sort={sort}
            onSort={(sortBy) => {
              setSort((s) => ({ sortBy, sortOrder: s.sortBy === sortBy && s.sortOrder === 'asc' ? 'desc' : 'asc' }));
              setPage(1);
            }}
            page={page}
            onPage={setPage}
          />
        )}
      </Panel>
    </div>
  );
}

// Its own component so the matrix is only requested while this tab is open.
function MatrixTab({ params, onShowDefault }) {
  const matrix = useApi('/consolidation/matrix', params);
  return <ConsolidationOrderMatrix request={matrix} onShowDefault={onShowDefault} />;
}

function Summary({ meta }) {
  const s = meta.summary;
  const left = meta.scope.excluded;
  return (
    <div className="mb-3 space-y-1 text-sm text-neutral-600">
      <p>
        <span className="font-semibold text-neutral-900">{formatNumber(s.orders)}</span> sales orders ·{' '}
        <span className="font-semibold text-neutral-900">{formatNumber(s.lines)}</span> order lines ·{' '}
        <span className="font-semibold text-neutral-900">{formatNumber(s.products)}</span> products ·{' '}
        <span className="font-semibold text-neutral-900">{formatQty(s.totalQty)}</span> pieces still to deliver
        <span className="text-neutral-500"> (of {formatNumber(meta.scope.orders)} open orders / {formatNumber(meta.scope.lines)} lines in total)</span>
      </p>
      <p className="flex items-start gap-1.5 text-xs text-neutral-500">
        <Info className="mt-px size-3.5 shrink-0" aria-hidden />
        <span>
          {meta.filters.includeDelivered
            ? 'Lines with nothing left to ship (fully delivered, or quantity 0) are included, with Order Quantity 0: see them on the Order lines tab and in the Excel Details sheet; the Consolidation matrix only has quantities still to ship. '
            : `Left out: ${formatNumber(left.fullyDelivered)} lines with nothing left to ship (tick "Include lines with nothing left to ship" to see them) and `}
          {meta.filters.includeDelivered ? 'Left out: ' : ''}
          {formatNumber(left.notFinishedGoods)} lines that are not finished goods (fees, parts).
          {meta.filters.includeMo
            ? ' Items made for an order but not on it (manufacturing orders) are included: see the Source column and the Excel Details sheet.'
            : meta.scope.moLines > 0 && ` ${formatNumber(meta.scope.moLines)} more items are made for these orders but are not on them (tick "Include items made for the order" to see them).`}
          {' '}
          The planners' own additions that have no manufacturing order in Odoo cannot appear here.
        </span>
      </p>
    </div>
  );
}

// Downloads the filtered data as an Excel file (built by our server; nothing is written to Odoo).
function ExportButton({ params }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const download = async () => {
    setBusy(true);
    setError(null);
    try {
      const blob = await api.get('/consolidation/export.xlsx', { params, responseType: 'blob', timeout: 120_000 });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Consolidation_Order_${todayInAppTimezone()}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      let message = errorMessage(err);
      try {
        message = JSON.parse(await err.response.data.text()).message || message; // an error body arrives as a Blob
      } catch {
        // keep the generic message
      }
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        onClick={download}
        disabled={busy}
        className="inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
      >
        {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <><Download className="size-4" aria-hidden /><FileSpreadsheet className="size-4" aria-hidden /></>}
        {busy ? 'Preparing Excel…' : 'Export Excel'}
      </button>
      {error && (
        <span role="alert" className="text-xs text-rose-700">
          Could not create the Excel file: {error}
        </span>
      )}
    </div>
  );
}
