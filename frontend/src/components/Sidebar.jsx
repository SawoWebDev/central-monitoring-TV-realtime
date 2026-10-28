import { useEffect } from 'react';
import { NavLink } from 'react-router-dom';
import { Layers, LayoutDashboard, Monitor, Settings, X } from 'lucide-react';
import { useDisplay } from '../context/displayContext';

const LINKS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/settings', label: 'Settings', icon: Settings },
  { to: '/consolidation', label: 'Consolidation Order', icon: Layers },
];

// Side menu, hidden by default (opened with the button at the left of the header).
// From 1024 px up it sits beside the page and pushes it narrower, just under the sticky header;
// on smaller screens it slides over the page with a dark backdrop.
export default function Sidebar() {
  const { sidebarOpen, setSidebarOpen, displayMode, setDisplayMode } = useDisplay();
  const close = () => setSidebarOpen(false);

  // Escape closes the menu.
  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e) => e.key === 'Escape' && setSidebarOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sidebarOpen, setSidebarOpen]);

  if (!sidebarOpen) return null;

  // On small screens the menu covers the page, so following a link closes it.
  const closeIfOverlay = () => {
    if (window.matchMedia('(max-width: 1023px)').matches) close();
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-neutral-950/40 lg:hidden" onClick={close} aria-hidden />
      <aside
        id="app-sidebar"
        aria-label="Menu and display settings"
        className="fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col overflow-y-auto border-r border-neutral-200 bg-white lg:sticky lg:top-(--header-h) lg:z-30 lg:h-[calc(100dvh-var(--header-h))] lg:self-start"
      >
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500">Menu</p>
          <button
            type="button"
            onClick={close}
            aria-label="Hide menu"
            title="Hide menu"
            className="rounded-md p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <nav className="px-3">
          <ul className="space-y-1">
            {LINKS.map(({ to, label, icon: Icon, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  onClick={closeIfOverlay}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                      isActive ? 'bg-neutral-950 text-white' : 'text-neutral-700 hover:bg-neutral-100'
                    }`
                  }
                >
                  <Icon className="size-4 shrink-0" aria-hidden />
                  {label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mx-3 mt-5 border-t border-neutral-200 pt-4">
          <p className="px-1 text-xs font-semibold uppercase tracking-wider text-neutral-500">Display</p>
          <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-lg px-1 py-2 hover:bg-neutral-50">
            <input
              type="checkbox"
              className="mt-0.5 size-4 shrink-0 accent-neutral-900"
              checked={displayMode}
              onChange={(e) => setDisplayMode(e.target.checked)}
            />
            <span>
              <span className="flex items-center gap-1.5 text-sm font-medium text-neutral-900">
                <Monitor className="size-3.5" aria-hidden />
                Display mode
              </span>
              <span className="mt-0.5 block text-xs leading-snug text-neutral-500">
                For wall monitors: hides filters and paging, tables scroll by themselves. Untick to search and filter.
              </span>
            </span>
          </label>
        </div>
      </aside>
    </>
  );
}
