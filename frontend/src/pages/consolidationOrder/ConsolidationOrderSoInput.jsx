import { X } from 'lucide-react';
import { SO_SEPARATORS, parseSoList } from './consolidationOrderShared';

// The SO# filter box: one or MORE sales order numbers, shown as removable chips.
//   - Enter, a comma or a semicolon turns what is typed into a chip ("SO 9259", "S09259" or just "9259");
//   - pasting a list (comma separated or one per line, e.g. from Excel) makes one chip per entry;
//   - duplicates are ignored, spaces around an entry are removed, Backspace in the empty box removes the last chip.
// values = the chips, text = what is typed but not yet a chip (the parent keeps both, so "Apply Filters" can include it).
export default function ConsolidationOrderSoInput({ values, text, onValues, onText, labelId }) {
  const addTyped = (raw) => {
    onValues(parseSoList([...values, ...parseSoList(raw)]));
    onText('');
  };

  return (
    <div
      className="flex min-h-[34px] flex-wrap items-center gap-1 rounded-md border border-neutral-300 bg-white px-1.5 py-1 focus-within:ring-2 focus-within:ring-neutral-400"
      onClick={(e) => e.currentTarget.querySelector('input')?.focus()}
    >
      {values.map((v) => (
        <span key={v} className="inline-flex items-center gap-1 rounded bg-neutral-900 py-0.5 pl-2 pr-1 text-xs font-medium text-white">
          {v}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onValues(values.filter((x) => x !== v));
            }}
            aria-label={`Remove ${v}`}
            title={`Remove ${v}`}
            className="rounded p-0.5 hover:bg-neutral-600"
          >
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ))}
      <input
        type="text"
        aria-labelledby={labelId}
        value={text}
        placeholder={values.length === 0 ? 'e.g. SO 9259, SO 9260' : 'add another…'}
        autoComplete="off"
        className="min-w-[7rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        onChange={(e) => {
          const typed = e.target.value;
          if (SO_SEPARATORS.test(typed)) {
            // a comma or semicolon was typed: everything before the last separator becomes chips
            const parts = typed.split(SO_SEPARATORS);
            const rest = parts.pop();
            onValues(parseSoList([...values, ...parts]));
            onText(rest.trimStart());
          } else {
            onText(typed);
          }
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && text.trim()) {
            e.preventDefault(); // Enter makes a chip (with an empty box it applies the filters, like in any form)
            addTyped(text);
          } else if (e.key === 'Backspace' && text === '' && values.length > 0) {
            onValues(values.slice(0, -1));
          }
        }}
        onPaste={(e) => {
          const pasted = e.clipboardData.getData('text');
          if (SO_SEPARATORS.test(pasted)) {
            e.preventDefault(); // a list: one chip per entry (a single-line box would lose the new lines)
            addTyped(`${text}${pasted}`);
          }
        }}
        onBlur={() => {
          if (text.trim()) addTyped(text);
        }}
      />
    </div>
  );
}
