# Central Monitoring: project guide

## GOAL
Build and DISPLAY a working, real-data, near-real-time Sales Order monitoring dashboard in the browser
(http://localhost:5173 in development) for our company's Odoo ERP. Read-only. Odoo is the source of truth.
Docker/Nginx is OUT OF SCOPE until the dashboard works and I explicitly ask for it.

Definition of done for "dashboard displayed": with backend (port 4000) and frontend (port 5173) running,
the browser shows real KPIs, charts, and an order table from Odoo, filters update everything consistently,
data refreshes every 30 s, and failures show a warning while keeping the last good data.

## ABOUT THE DEVELOPER
Beginner. Explain what you do and why in plain language. Work in small steps, tell me which files you
changed, give PowerShell commands for Windows and explain each command and where to run it. After each
step, tell me exactly how to test it and WAIT for my confirmation before the next step.
Keep PROGRESS.md in the project root (completed steps, current step, remaining tasks; no secrets).

## HARD RULES
1. STRICTLY READ-ONLY toward Odoo. Never create/write/unlink or any data-changing call. The allow-list in
   backend/src/services/odooClient.js must not be weakened or bypassed. Never test write permission by writing.
2. NEVER read, print, copy, or ask me to paste backend/.env (it holds an API key). Use .env.example for docs.
   Never hardcode or log secrets. Never expose Odoo URLs, credentials, or raw error details to the browser.
3. The frontend talks ONLY to our backend, never to Odoo.
4. Do not invent fields, endpoints, or data. No fake data presented as real. Mock data only in clearly labeled tests.
5. Do not move to the next step until the current one is tested and I confirm. Fix errors before adding features.
6. No unnecessary libraries or over-engineering. Never run git push; ask before committing.
7. No WebSockets: this is polling-based NEAR-real-time. Never describe it as instant.

## VERIFIED ODOO FACTS (already tested; do not re-investigate)
- Odoo 17.0 Enterprise (NOT Odoo 7). XML-RPC at /xmlrpc/2/common and /xmlrpc/2/object via the "xmlrpc" npm
  package, login + API key. Host https://erp.sawo.com, database "sawo". JSON-2 does not apply.
- The API account sees ONE company: SAWO INC., base currency PHP. 1,292 orders (205 draft, 5 sent,
  1,006 sale, 76 cancel, 0 done).
- Statuses: draft = Quotation, sent = Quotation Sent, sale = Sales Order (confirmed), cancel = Cancelled.
- Fields: sale.order: name, date_order, partner_id, user_id, team_id, amount_untaxed, amount_tax, amount_total,
  currency_id, currency_rate, company_id, state, order_line. sale.order.line: order_id, product_id, name,
  product_uom_qty, price_unit, price_subtotal, price_total, display_type.
- Orders are in MULTIPLE currencies (PHP, USD, EUR). amount in PHP = amount_total / currency_rate
  (PHP orders have rate 1). Never add raw amounts across currencies.
- Some orders have no salesperson: show "Unassigned". Odoo datetimes are UTC; all business dates, filters and
  chart buckets use APP_TIMEZONE (Asia/Manila).
- The API account we were given is NOT truly read-only inside Odoo (development use only; the probe uses
  ALLOW_WRITABLE_ACCOUNT=true). A real read-only Odoo user must replace it before deployment.

## ARCHITECTURE
Odoo -> backend sync service (reads Odoo every SYNC_INTERVAL_SECONDS=30, in-memory snapshot, no overlapping
syncs, keeps last good data on failure) -> Express endpoints that calculate from the snapshot -> React frontend
that polls the backend every 30 s (configurable via VITE_REFRESH_INTERVAL_SECONDS).
Dev setup: Vite (5173) proxies /api to the backend (4000). Frontend uses relative URLs like /api/...

## EXISTING CODE (verify in the repo; trust the repo over this list)
Backend (backend/src): config/odoo.js, config/app.js, services/odooClient.js (allow-listed read-only client),
services/odooService.js (fetch + normalize orders and lines, amountTotalBase in PHP), services/syncService.js,
controllers/syncController.js, routes/syncRoutes.js (GET /api/sync/status), utils/odooHelpers.js, server.js
(helmet, restricted CORS GET-only, rate limit, /api/health). Scripts in backend/scripts/ are read-only probes.
Frontend: minimal Vite + React + Tailwind v4 test page calling /api/health. The real dashboard is not built.
Phase 4.1 was written but may not be confirmed tested: verify it first.

## NORMALIZED ORDER SHAPE (from syncService snapshot)
id, reference, orderDate (ISO UTC), customerId, customerName, salespersonId, salespersonName ("Unassigned"),
teamName, status (quotation | quotation_sent | confirmed | cancelled), odooState, currency, currencyRate,
amountUntaxed, amountTax, amountTotal (order currency), amountTotalBase (PHP).
Line: id, orderId, productId, productName, quantity, unitPrice, subtotal (ORDER currency), total.
Line amount in PHP = subtotal / that order's currencyRate (or subtotal if the order currency is the base).

## API CONTRACT
All GET-only. Consistent response: { success, data, message, lastSyncedAt, meta? } and
{ success:false, message } on errors (no stack traces, no internals).
Shared query params: startDate, endDate (YYYY-MM-DD in APP_TIMEZONE, inclusive), status (comma list of
quotation|quotation_sent|confirmed|cancelled), salesperson (id or "unassigned"), customer (id), search
(reference or customer), page (default 1), limit (default 20, max 100), sortBy (orderDate|amount, default
orderDate), sortOrder (asc|desc, default desc). Validate and reject bad input with 400.
Endpoints:
- GET /api/health
- GET /api/sync/status (also expose timezone)
- GET /api/dashboard/summary -> the 6 KPIs
- GET /api/dashboard/sales-trend?granularity=day|week|month -> zero-filled buckets (PHP amount, order count)
- GET /api/dashboard/order-status -> counts and PHP totals per status
- GET /api/dashboard/top-products -> product, quantity, PHP amount (confirmed orders only)
- GET /api/dashboard/top-customers -> customer, orders, PHP amount
- GET /api/dashboard/salespersons -> salesperson, orders, PHP amount
- GET /api/dashboard/comparison -> selected period vs the previous equal-length period (our addition)
- GET /api/dashboard/filters -> lists of salespersons and customers for the filter dropdowns (our addition)
- GET /api/sales-orders (paginated list, meta has total/page/limit) and GET /api/sales-orders/:id (detail
  with lines, read-only)

## KPI DEFINITIONS (document in code comments and README)
- Total Sales Orders = count of unique orders matching the filters (any status unless filtered).
- Confirmed Sales Orders = count with status confirmed. Quotations = quotation + quotation_sent.
  Cancelled = cancelled.
- Total Sales Amount = SUM of amountTotalBase over CONFIRMED orders matching the filters (PHP).
- Average Order Value = Total Sales Amount / number of confirmed orders (0 if none).
- Quotations and cancelled orders are never included in sales amounts. Never double-count orders when joining
  lines; top products use lines of confirmed orders only.
- Every amount shown on the dashboard says it is converted to PHP using each order's stored rate
  (an estimate for monitoring, not accounting figures). The order table shows the original currency amount.

## DASHBOARD DESIGN (to display)
Enterprise BI look: clean, consistent spacing, restrained colors (slate/indigo base; status colors:
quotation amber, quotation sent sky, confirmed emerald, cancelled rose), accessible contrast and labels,
responsive, light/dark mode if practical, minimal animation.
Layout: left sidebar (Dashboard, Sales Orders, Analytics, Settings), top header with "Central Monitoring"
title, today's date, connection status (ok / error / connecting), last successful sync time, manual Refresh
button with a loading indicator.
- Dashboard page: 6 KPI cards; sales trend chart with Daily/Weekly/Monthly toggle; order status chart; top
  products; top customers; recent sales orders.
- Analytics page: salesperson performance and the period comparison, plus the charts above at larger size.
- Sales Orders page: searchable, filterable table (Order Reference, Order Date, Customer, Salesperson, Total
  Amount, Status), sort by date/amount, pagination, loading/empty/error states, click a row for a READ-ONLY
  detail view. No edit or delete buttons anywhere.
- Settings page: read-only info (company, base currency, refresh interval, connection status). No secrets.
- Global filters (shared state, update KPIs, charts and tables together): Today, Yesterday, This Week
  (Mon-Sun), This Month (default on load), This Year, Custom Range; plus Status, Salesperson, Customer.
  Show clearly what each total includes.
- Auto refresh: custom hook, interval from env, AbortController, never overlapping requests, keep the last
  good data if a refresh fails, show a clear "data may be outdated" banner when stale, show last sync time.
Stack: React + Vite + JavaScript + Tailwind + Recharts + Lucide + Axios + React Router. Reusable components,
no giant App.jsx. Suggested folders: components/, pages/, layouts/, services/api.js, hooks/, utils/format.js.

## TESTING
- Backend: node:test unit tests for the analytics calculations using small SAMPLE data (clearly labeled).
  Include mixed currencies, a missing salesperson, cancelled and quotation orders, and a timezone boundary case.
- Cross-check the real dashboard against Odoo counts (1,006 confirmed, 205 quotation, 5 sent, 76 cancelled).
- Manual checks: filters change all widgets consistently; refresh works; stop the backend or break Odoo access
  and confirm the dashboard keeps showing the last data with a warning.

## ORDER OF WORK
A. Verify Phase 4.1 (sync + /api/sync/status).   B. 4.2 orders endpoints.   C. 4.3 analytics + tests.
D. 4.4 validation + errorHandler middleware.   E. Frontend foundation (layout, routing, api service, theme).
F. Dashboard page.   G. Sales Orders page + detail.   H. Global filters.   I. Auto-refresh + status + stale warning.
J. End-to-end check against real data.   STOP there. Docker, Nginx, deployment docs only when I ask.

## graphify

The knowledge graph lives OUTSIDE this repo, one folder up: C:\Jeremiah\Plant 1 Main\Projects\Tony K\central-monitoring\graphify-out
- Never run graphify build/update with this repo as the target and never create a graphify-out/ folder inside this repo
  (it is also in .gitignore). If a question needs the graph, read it from the path above; otherwise read the source files.
- There are no graphify hooks in .claude/settings.json (removed on purpose).

