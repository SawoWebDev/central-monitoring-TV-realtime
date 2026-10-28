// A card with a title, a one-sentence explanation and an optional color legend.
// Every dashboard block sits in one of these.
// legend: [{ label, color }] shown as small colored squares on the same line as the explanation
// (kept compact so the whole dashboard fits on one monitor screen).
export default function Panel({ title, subtitle, legend, actions, children, className = '' }) {
  return (
    <section
      className={`min-w-0 rounded-xl border border-neutral-200 bg-white p-5 shadow-sm shadow-neutral-900/[0.03] ${className}`}
    >
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-neutral-900 2xl:text-xl">{title}</h2>
          {(subtitle || legend?.length > 0) && (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm leading-snug">
              {subtitle && <p className="text-neutral-500">{subtitle}</p>}
              {legend?.length > 0 && (
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-neutral-700">
                  {legend.map((item) => (
                    <li key={item.label} className="flex items-center gap-1.5">
                      <span className="size-3 rounded-sm" style={{ backgroundColor: item.color }} aria-hidden />
                      {item.label}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
