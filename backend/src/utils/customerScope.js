// Optional "customer scope" for the whole dashboard (client request 2026-10-21).
//   CUSTOMER_SCOPE=all           (default) every order of the company, whoever the customer is
//   CUSTOMER_SCOPE=own_company   only orders whose CUSTOMER is the company itself (SAWO INC., incl. its contacts);
//                                orders for sister companies (Bella Vivo, Sauna World...) and outside customers are left out
// The filter is applied where the data is READ from Odoo (both syncs), so every panel follows it.
export const CUSTOMER_SCOPES = ['all', 'own_company'];

export function parseCustomerScope(value) {
  const scope = String(value ?? 'all').trim().toLowerCase() || 'all';
  if (!CUSTOMER_SCOPES.includes(scope)) {
    throw new Error(`CUSTOMER_SCOPE must be one of: ${CUSTOMER_SCOPES.join(', ')} (got "${scope}")`);
  }
  return scope;
}

// Odoo domain terms for a field that points at the customer partner (or reaches it through a path such as
// "sale_id.partner_id"). "child_of" also matches contacts that belong to the company partner.
export function customerScopeDomain(scope, companyPartnerId, field = 'partner_id') {
  if (scope !== 'own_company') return [];
  if (!companyPartnerId) throw new Error('Cannot apply CUSTOMER_SCOPE: the company partner was not found');
  return [[field, 'child_of', companyPartnerId]];
}
