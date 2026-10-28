// A section heading on the dashboard, e.g. "SALES", with a small SAWO red bar in front.
export default function SectionTitle({ children }) {
  return (
    <h2 className="flex items-center gap-3 pt-2 text-sm font-bold uppercase tracking-widest text-neutral-700">
      <span className="h-4 w-1 rounded-full bg-brand" aria-hidden />
      {children}
    </h2>
  );
}
