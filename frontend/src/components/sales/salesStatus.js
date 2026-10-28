// Display info for each order status. Colors are always shown together with the text label.
export const STATUS_META = {
  quotation: {
    label: 'Quotation',
    color: '#f59e0b', // amber-500
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/20',
  },
  quotation_sent: {
    label: 'Quotation Sent',
    color: '#0ea5e9', // sky-500
    badge: 'bg-sky-50 text-sky-800 ring-sky-600/20',
  },
  confirmed: {
    label: 'Sales Order',
    color: '#10b981', // emerald-500
    badge: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
  },
  cancelled: {
    label: 'Cancelled',
    color: '#f43f5e', // rose-500
    badge: 'bg-rose-50 text-rose-800 ring-rose-600/20',
  },
};

export function statusMeta(status) {
  return (
    STATUS_META[status] ?? {
      label: status ?? 'Unknown',
      color: '#94a3b8',
      badge: 'bg-neutral-100 text-neutral-700 ring-neutral-500/20',
    }
  );
}

// Odoo's delivery status of a confirmed order, in plain words (always text + color, never color alone).
export const DELIVERY_META = {
  pending: { label: 'Not delivered', color: '#a3a3a3' },
  started: { label: 'Started', color: '#0ea5e9' },
  partial: { label: 'Partly delivered', color: '#f59e0b' },
  full: { label: 'Fully delivered', color: '#10b981' },
};
