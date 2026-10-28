import { useEffect, useState } from 'react';
import OpenOrdersPanel from './OpenOrdersPanel';
import OpenOrdersByCategoryPanel from './OpenOrdersByCategoryPanel';
import { useDisplay } from '../../context/displayContext';
import { usePersistentState } from '../../hooks/usePersistentState';

const DEFAULT_FILTERS = { search: '', customer: '', category: '', age: 'all', lateOnly: false };
const DEFAULT_SORT = { sortBy: 'orderDate', sortOrder: 'desc' }; // newest orders first
const AGES = ['all', '0-30', '31-90', '91-365', 'over365']; // the backend's age buckets (services/openOrders.js)
const SORT_FIELDS = ['reference', 'customer', 'orderDate', 'commitmentDate', 'orderCbm', 'remainingCbm', 'daysOpen'];

// Saved filters/sort are checked field by field; anything unknown falls back to its default.
const text = (value, max) => (typeof value === 'string' && value.length <= max ? value : '');
function sanitizeFilters(saved) {
  if (!saved || typeof saved !== 'object') return undefined;
  return {
    search: text(saved.search, 100),
    customer: typeof saved.customer === 'string' && /^\d+$/.test(saved.customer) ? saved.customer : '',
    category: text(saved.category, 300),
    age: AGES.includes(saved.age) ? saved.age : 'all',
    lateOnly: saved.lateOnly === true,
  };
}
function sanitizeSort(saved) {
  if (!SORT_FIELDS.includes(saved?.sortBy) || !['asc', 'desc'].includes(saved?.sortOrder)) return undefined;
  return { sortBy: saved.sortBy, sortOrder: saved.sortOrder };
}

// "Open Sales Ordered" table (full width, so every column is visible) with the
// "Open SO by Product Category" board UNDER it; both share one set of filters.
// The filters live here (not in the panels' data), so the 30 s auto-refresh keeps filters, sort and page.
// Monitor mode = the app-wide "Display mode" (side menu): ON hides filters and paging, and filters + sort are
// remembered after a reload (usePersistentState). The page number is not remembered.
export default function OpenOrdersSection() {
  const [filters, setFilters] = usePersistentState('openOrders.filters', DEFAULT_FILTERS, sanitizeFilters);
  const [searchInput, setSearchInput] = useState(filters.search);
  const [sort, setSort] = usePersistentState('openOrders.sort', DEFAULT_SORT, sanitizeSort);
  const [page, setPage] = useState(1);
  const { displayMode: monitorMode } = useDisplay();

  // Search waits 300 ms after the last key press, so typing does not send a request per letter.
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((f) => (f.search === searchInput.trim() ? f : { ...f, search: searchInput.trim() }));
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput, setFilters]);

  const changeFilter = (key, value) => {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(1);
  };
  return (
    <div className="grid grid-cols-1 gap-4">
      <OpenOrdersPanel
        filters={filters}
        searchInput={searchInput}
        onSearchInput={setSearchInput}
        onFilter={changeFilter}
        sort={sort}
        onSort={(sortBy) => {
          setSort((s) => ({ sortBy, sortOrder: s.sortBy === sortBy && s.sortOrder === 'desc' ? 'asc' : 'desc' }));
          setPage(1);
        }}
        page={page}
        onPage={setPage}
        monitorMode={monitorMode}
        onSortPreset={(preset) => {
          setSort(preset);
          setPage(1);
        }}
      />
      <OpenOrdersByCategoryPanel
        filters={filters}
        selected={filters.category}
        onSelect={(category) => changeFilter('category', filters.category === category ? '' : category)}
        monitorMode={monitorMode}
      />
    </div>
  );
}
