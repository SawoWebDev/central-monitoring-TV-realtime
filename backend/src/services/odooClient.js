import xmlrpc from 'xmlrpc';

// SAFETY LAYER 1: the only Odoo methods this app may ever call.
// create / write / unlink (and anything else) are blocked here, in code.
const ALLOWED_METHODS = new Set([
  'search',
  'read',
  'search_read',
  'search_count',
  'read_group',
  'fields_get',
  'check_access_rights', // asks Odoo "could this user do X?" - changes nothing
]);

// SAFETY LAYER 2: the only Odoo models this app may query.
const ALLOWED_MODELS = new Set([
  'sale.order',
  'sale.order.line',
  'res.partner',
  'product.product',
  'product.template',
  'res.users',
  'res.currency',
  'res.company',
  'crm.team',
  // Manufacturing and shipping (added 2026-10-16 for the client's status report; read-only like all others)
  'mrp.production',
  'mrp.workorder',
  'mrp.workcenter',
  'stock.picking',
  'stock.picking.type',
  'stock.move',
  'stock.warehouse',
  'stock.location',
  // Chatter messages of ONE sales order, for the per-order Excel "Log Messages" sheet (added 2026-10-21 at the
  // developer's request; read-only like all others)
  'mail.message',
]);

function makeClient(baseUrl, path) {
  const u = new URL(baseUrl);
  const secure = u.protocol === 'https:';
  const options = {
    host: u.hostname,
    port: u.port ? Number(u.port) : secure ? 443 : 80,
    path,
  };
  return secure ? xmlrpc.createSecureClient(options) : xmlrpc.createClient(options);
}

// Returns the last non-empty line of an Odoo error (that's where the message is).
function lastLine(text) {
  const lines = String(text || '').split('\n').map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] || 'Unknown error';
}

// Sends one XML-RPC call with a timeout.
// Errors are rewritten so they never contain the request parameters (which include the API key).
function rpc(client, method, params, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Odoo "${method}" timed out after ${timeoutMs} ms`)),
      timeoutMs
    );
    client.methodCall(method, params, (err, value) => {
      clearTimeout(timer);
      if (err) {
        const detail = err.faultString ? lastLine(err.faultString) : err.message;
        reject(new Error(`Odoo "${method}" failed: ${detail}`));
      } else {
        resolve(value);
      }
    });
  });
}

export class OdooClient {
  constructor(config) {
    this.config = config;
    this.uid = null;
    this.common = makeClient(config.url, '/xmlrpc/2/common');
    this.object = makeClient(config.url, '/xmlrpc/2/object');
  }

  // No login needed. Returns server version info.
  version() {
    return rpc(this.common, 'version', [], this.config.timeoutMs);
  }

  // Logs in and remembers the numeric user id.
  async authenticate() {
    const { db, username, apiKey, timeoutMs } = this.config;
    const uid = await rpc(this.common, 'authenticate', [db, username, apiKey, {}], timeoutMs);
    if (!uid) {
      throw new Error('Odoo authentication failed (check database, username and API key)');
    }
    this.uid = uid;
    return uid;
  }

  // The ONLY door to Odoo's data. Everything else goes through this.
  async execute(model, method, args = [], kwargs = {}) {
    if (!ALLOWED_METHODS.has(method)) {
      throw new Error(`BLOCKED: method "${method}" is not allowed (read-only integration)`);
    }
    if (!ALLOWED_MODELS.has(model)) {
      throw new Error(`BLOCKED: model "${model}" is not in the allowed list`);
    }
    if (!this.uid) await this.authenticate();
    const { db, apiKey, timeoutMs } = this.config;
    return rpc(
      this.object,
      'execute_kw',
      [db, this.uid, apiKey, model, method, args, kwargs],
      timeoutMs
    );
  }

  // --- Small helpers built on execute() ---

  searchRead(model, domain = [], { fields = [], limit, offset, order } = {}) {
    const kwargs = { fields };
    if (limit !== undefined) kwargs.limit = limit;
    if (offset !== undefined) kwargs.offset = offset;
    if (order) kwargs.order = order;
    return this.execute(model, 'search_read', [domain], kwargs);
  }

  searchCount(model, domain = []) {
    return this.execute(model, 'search_count', [domain]);
  }

  fieldsGet(model, attributes = ['string', 'type']) {
    return this.execute(model, 'fields_get', [], { attributes });
  }

  // Asks Odoo whether the logged-in user is allowed an operation. Does NOT perform it.
  canDo(model, operation) {
    return this.execute(model, 'check_access_rights', [operation], { raise_exception: false });
  }
}