import { AlertTriangle, Inbox, Loader2 } from 'lucide-react';

// Shows the right state for data loaded with useApi():
// loading (first load) -> spinner; failed with no data -> error; empty -> empty message;
// otherwise the content. If a refresh fails but older data exists, the older data stays
// visible with a small warning above it.
export default function AsyncContent({ request, isEmpty, emptyText = 'No data for this period.', height = 240, children }) {
  const { data, error, loading } = request;

  if (data == null) {
    if (error) {
      return (
        <Centered height={height}>
          <AlertTriangle className="size-5 text-rose-500" aria-hidden />
          <p className="text-sm font-medium text-neutral-700">Could not load this data</p>
          <p className="text-xs text-neutral-500">{error}</p>
        </Centered>
      );
    }
    return (
      <Centered height={height}>
        <Loader2 className="size-5 animate-spin text-neutral-400" aria-hidden />
        <p className="text-xs text-neutral-500">Loading…</p>
      </Centered>
    );
  }

  return (
    <div aria-busy={loading} className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {error && (
        <p className="mb-3 flex items-center gap-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
          Could not refresh ({error}). Showing the last loaded data.
        </p>
      )}
      {isEmpty?.(data) ? (
        <Centered height={height}>
          <Inbox className="size-5 text-neutral-400" aria-hidden />
          <p className="text-sm text-neutral-500">{emptyText}</p>
        </Centered>
      ) : (
        children(data)
      )}
    </div>
  );
}

function Centered({ height, children }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 text-center" style={{ minHeight: height }}>
      {children}
    </div>
  );
}
