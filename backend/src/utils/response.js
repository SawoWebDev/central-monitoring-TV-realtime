// Every successful response has the same shape:
// { success: true, data, message, lastSyncedAt, meta? }
export function sendSuccess(res, { data, message, lastSyncedAt = null, meta }) {
  const body = { success: true, data, message, lastSyncedAt };
  if (meta) body.meta = meta;
  res.json(body);
}
