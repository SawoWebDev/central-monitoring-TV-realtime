// The four lead-time stages an open sales order goes through, left to right
// (used by "Lead Time: Open Sales Orders by Stage" and "Open Sales Ordered").
export const STAGE_META = {
  waiting_production: { label: 'Waiting for production', hint: 'MOs not started yet', color: '#f59e0b' },
  in_production: { label: 'In production', hint: 'MOs being made', color: '#0ea5e9' },
  ready_to_ship: { label: 'Ready to ship', hint: 'Production done, not shipped', color: '#10b981' },
  partly_shipped: { label: 'Partly shipped', hint: 'Some deliveries done', color: '#6366f1' },
};
