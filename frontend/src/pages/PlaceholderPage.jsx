import { Construction } from 'lucide-react';

// A page that is not built yet. It shows no data at all, only what is planned.
export default function PlaceholderPage({ title, description }) {
  return (
    <div className="mx-auto max-w-[1400px]">
      <h2 className="font-serif text-3xl text-neutral-900">{title}</h2>
      <div className="mt-6 flex flex-col items-center gap-2 rounded-xl border border-dashed border-neutral-300 bg-white px-6 py-16 text-center">
        <Construction className="size-6 text-neutral-400" aria-hidden />
        <p className="text-sm font-medium text-neutral-700">Not built yet</p>
        <p className="max-w-md text-sm text-neutral-500">{description}</p>
      </div>
    </div>
  );
}
