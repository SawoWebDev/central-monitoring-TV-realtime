import 'dotenv/config';

// Reads the Odoo connection settings from the .env file.
// Nothing here is ever sent to the frontend.
export function getOdooConfig() {
  const { ODOO_URL, ODOO_DB, ODOO_USERNAME, ODOO_API_KEY, ODOO_TIMEOUT_MS } = process.env;

  const config = {
    url: (ODOO_URL || '').replace(/\/+$/, ''), // remove trailing slash
    db: ODOO_DB || '',
    username: ODOO_USERNAME || '',
    apiKey: ODOO_API_KEY || '',
    timeoutMs: Number(ODOO_TIMEOUT_MS) || 15000,
  };

  const missing = [];
  if (!config.url) missing.push('ODOO_URL');
  if (!config.db) missing.push('ODOO_DB');
  if (!config.username) missing.push('ODOO_USERNAME');
  if (!config.apiKey) missing.push('ODOO_API_KEY');

  return { config, missing };
}