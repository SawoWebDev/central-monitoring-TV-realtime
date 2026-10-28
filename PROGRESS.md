# Central Monitoring: progress

Last updated: 2026-10-16

## Done before this checklist
- [x] Odoo connection verified (Odoo 17.0, XML-RPC, read-only allow-list in `backend/src/services/odooClient.js`)
- [x] Read-only probe scripts in `backend/scripts/`
- [x] Frontend test page (Vite + React + Tailwind) calling `/api/health` through the Vite proxy

## Checklist (ORDER OF WORK)
- [x] **A. Verify Phase 4.1 (sync + `/api/sync/status`)**: confirmed 2026-10-16
  (1,293 orders, 13,993 lines, PHP, SAWO INC.; `timezone` added; next sync waits N s after the previous one)
- B–F were built together ("all at once", developer's choice). Built and checked by Claude; **waiting for developer test**:
  - [ ] B. 4.2 orders endpoints: `GET /api/sales-orders`, `GET /api/sales-orders/:id`
  - [ ] C. 4.3 analytics endpoints (`/api/dashboard/summary`, `sales-trend`, `order-status`, `top-products`,
        `top-customers`, `salespersons`, `comparison`, `filters`) + 21 node:test unit tests (`npm test` passes)
  - [ ] D. 4.4 validation (400 on bad input) + errorHandler middleware + consistent JSON responses
  - [ ] E. Frontend foundation: layout (header, sidebar), routing, `services/api.js`, `useApi` hook, light/dark
  - [ ] F. Dashboard page: 6 KPIs, sales trend (Daily/Weekly/Monthly), orders by status, top products,
        top customers, recent orders (fixed to "This Month" until step H)
  - 2026-10-16 full check by Claude: 21/21 tests pass, lint and build pass, every endpoint returns real data
    (incl. via the Vite proxy), bad input gives 400, unknown routes and POST/DELETE give 404.
    Still needs the developer's check in the browser.
- [ ] G. Sales Orders page + detail (currently a "Not built yet" page)
- [ ] H. Global filters
- [ ] I. Auto-refresh + status + stale warning (today: manual Refresh button only)
- [ ] J. End-to-end check against real data

## UI restyle from client reference (2026-10-16), waiting for developer check
- Neutral grey palette (was slate), serif page titles, plain-language summary sentence on the Dashboard
- KPI cards: label, large light number, explanation line; Cancelled shown in red when above 0
- Chart cards: question-style titles, one-sentence explanation, color legend
  (2026-10-19: question titles replaced with plain labels at the developer's request: "Sales trend",
  "Orders by status", "Lead time: open sales orders by stage")
- Frontend only; no backend, API or data changes
- Follow-up: SAWO logo (`frontend/src/assets/sawo-logo.png`), collapsible sidebar, brand red highlights
- 2026-10-16 MONITOR MODE (developer's request): the screen is shown on a wall monitor, so
  - sidebar and menu REMOVED (no navigation); one fixed light theme in the logo colors (white, black, SAWO red #ED1C24)
  - black header band with logo, live clock, connection status, last sync, Refresh; red line under it
  - dashboard fits one 1920x1080 screen (checked with a headless Edge screenshot); values printed on charts
    (no hovering needed); today's bar in red; top 4 products / customers / latest orders
  - Sales Orders / Analytics / Settings pages still exist by URL only (/sales-orders, /analytics, /settings).
    Decide whether steps G (Sales Orders page) and the Analytics page are still wanted.
  - For a monitor, step I (automatic 30 s refresh) matters most: today it only refreshes with the Refresh button.
- 2026-10-16 REDESIGN after the developer's reference (web analytics dashboard style), waiting for developer check:
  - header: logo + title on white, black band with rounded corner (status, last sync, Refresh, clock), red line
  - 6 gradient KPI tiles; dark footer strip with the "how to read" notes (replaces the title/summary block)
  - sales chart rotates by itself every 5 s: Today -> Daily -> Weekly (tabs to jump, Pause button, red progress
    bar). "Today" = today's summary numbers. Monthly left out (only one bar while the period is This Month).
  - top products / top customers as heat-map tables; latest orders table made compact (5 rows each)
  - "today" and "this month" now update after midnight (`hooks/useToday.js`)
  - checked with headless Edge screenshots at 1920x1080: fits one screen; rotation Today -> Daily -> Weekly works
  - browser tab icon: SAWO red "S" tile cut from the logo (`frontend/public/favicon.png`; Vite's favicon.svg removed)
  - 6 KPI tiles REMOVED from the dashboard at the developer's request (KpiCard.jsx deleted; charts made taller).
    Note: the project guide lists "6 KPI cards" on the Dashboard page; the developer chose to drop them.
  - "Today" totals view REMOVED from the sales chart too (developer's request); the chart now rotates
    Daily -> Weekly every 5 s. Today is still the red bar in the Daily view.
  - 2026-10-19 header badge wording: a failed sync now shows "Odoo update delayed" / "Production update delayed"
    (amber, clock icon, hover explanation) instead of "... sync error" (developer's request: no word "error").

## NEW CLIENT FOCUS (2026-10-16): operations status report, investigation only
Client wants: Lead Time (ongoing), CMB Shipping (quantity shipped per plant), SO volume per shipment +
MO status, MO status and overall manufacturing progress. Plant = warehouse (developer's answer).
- Allow-list extended (read-only models only): mrp.production, mrp.workorder, mrp.workcenter, stock.picking,
  stock.picking.type, stock.move, stock.warehouse, stock.location. Methods unchanged.
- Probe: `backend/scripts/odooOperationsProbe.js` (read-only). Findings:
  - Plants: PL1, PL2, PL3, PL4, WH4 (all SAWO INC.). Deliveries exist only for PL1 (3,713), PL3 (1,096), PL2 (476).
  - Volumes: 30,298 MOs, 258,850 work orders, 134,231 transfers, 806,250 stock moves: too big to copy every
    30 s; needs server-side grouping (read_group) and/or only open/recent records.
  - MO states: draft 867, confirmed 5,328, progress 252, to_close 32, done 22,551, cancel 1,268.
  - SO links: stock.picking.sale_id, sale.order.mrp_production_ids, sale.order.delivery_status
    (confirmed SOs: full 384, partial 345, started 196, pending 75).
- "CMB" = **CBM** (cubic meters). Probe `backend/scripts/odooCbmProbe.js` (read-only):
  - product.product `volume` is in m³. Last 90 days: 889 of 1,254 shipped products have a volume (2,724 of 3,249
    delivery lines), but most shipped PIECES have no volume (e.g. Plant 1: 404,534 of 471,568).
  - Rough CBM shipped, last 90 days (products with volume only): Plant 1 1,272.40, Plant 3 148.91, Plant 2 131.57.
  - sale.order `total_cbm` (computed, not stored) has values per order; Studio fields `x_studio_total_cbm` and
    `x_studio_total_cbm_1` are empty on all 1,007 confirmed orders.
- Client answers: CBM shown for Today / This week / This month side by side, with a "products without volume"
  note; lead time shown as stages; sales dashboard stays, below the new sections. Layout approved ("ok").
- [ ] **Ops step 1: operations sync + `GET /api/operations/status`**: built, waiting for developer test.
  Separate sync every 120 s (`OPERATIONS_SYNC_INTERVAL_SECONDS`), only open records + records completed since
  the start of the week/month. First run: 71 s; 6,478 open MOs, 894 open deliveries, 623 open SOs.
  The SO -> MO link (`mrp_production_ids`) is slow in Odoo, so it is read 100 orders per request.
- [ ] **Ops step 2: calculations** (`services/operationsAnalytics.js`) + endpoints `/api/operations/cbm-shipped`,
  `/lead-time`, `/manufacturing`, `/shipments`; 29 unit tests pass. Built, waiting for developer test.
- [ ] **Ops step 3: frontend** "Production & shipping" section (CBM, lead-time stages, MOs per plant, open shipments)
  above the "Sales" section. Built and checked by Claude in a screenshot; waiting for developer test.
- [ ] **Auto-refresh (was step I)**: the browser reloads from the backend every 30 s (`VITE_REFRESH_INTERVAL_SECONDS`),
  skipped while requests are still running. Built, waiting for developer test.
- Data-quality findings to share with the client: 886 of 896 open deliveries are past their scheduled date (some
  from 2025); some "open" sales orders are > 2 years old (S00040: 905 days); 4,161 open MOs are past their
  deadline. These look like records never closed in Odoo; medians ("typical") are shown instead of averages.

## Dashboards removed at the client's request (2026-10-19)
- Removed: Sales Trend, Top Products, Top Customers, Latest Orders (frontend panels, endpoints
  `/api/dashboard/sales-trend`, `/top-products`, `/top-customers`, their functions and tests).
- Kept (shared with other dashboards): Orders by Status, `HeatTable`, `ChartTooltip`, `chartColors`, `bucketKey`,
  `lineAmountBase`, `groupOrders`, `parseLimit`, `/api/sales-orders` (+ `/:id`), the order-line sync.
- Orders by Status now sits under "Manufacturing Orders Per Plant". 25 unit tests pass.
- Not yet updated: `CLAUDE.md` (API contract still lists the removed endpoints) and `docs/documentation.md`.

## Stability check (2026-10-19), waiting for developer test
- Header badge bug fixed (`frontend/src/components/Header.jsx`): after the backend stopped, the badge kept saying
  "Connected to Odoo" (useApi keeps the last good answer). Now: "Backend unreachable" (red) whenever a status
  request fails; new "Data may be outdated" (red) when the last sync is older than the stale limit (checked in the
  browser, so it works while the backend is down). Verified in headless Edge by blocking /api.
- Rate limit raised 120 -> 600 requests/min (`backend/src/server.js`): all browsers behind the Vite proxy share one
  address; a few monitors during a backend restart (5 s retries) went over 120.
- Checked OK: 29/29 tests, lint, build; sync loops never overlap and keep the last good data; no stale imports.

## Sales order status panels, counts only, no money (2026-10-19)
- Client: "Orders by Status" is the main sales section; show status information, no money.
- Added below "Orders by Status": A status count cards (+ cancellation rate), H delivery status of confirmed
  orders, E quotation aging (+ expired), I late orders (past commitment_date, not fully delivered).
- Endpoints: `/api/dashboard/status-counts`, `/delivery-status` (period), `/late-orders`, `/quotation-aging`
  (all open orders). Sales sync now also reads `commitment_date`, `validity_date`, `delivery_status`
  (verified with fields_get; same number of Odoo requests). 29 unit tests pass.
- Not possible / not built: C funnel (Odoo keeps no status history), F per company (only 1 company),
  money panels (G and the value views of B/D). Optional later: C2 "quotation outcome".

## Open Shipments -> Open Sales Ordered (2026-10-19)
- [x] Step A: "Open Shipments" removed (ShipmentsPanel.jsx, `/api/operations/shipments`, `openShipments()`, the reads of
  open deliveries + their stock moves, its unit test). Production sync no longer reads open deliveries.
- [x] Steps B + C built 2026-10-19 (waiting for developer approval to commit): `services/openOrders.js`,
  `/api/operations/open-orders`, `/open-orders.csv`, `/open-orders/by-category`; OpenOrdersSection / OpenOrdersPanel /
  OpenOrdersByCategoryPanel. 45 unit tests pass. Live: 618 open orders, 482 late, 132 without delivery date.
  Sync: ~95-102 s first after restart, ~73 s afterwards (+~9 s for ~9,000 order lines).
- [ ] (original plan) Step B: "Open Sales Ordered" table (open = state sale AND delivery_status not full, 7 with no delivery status
  excluded). NO MONEY anywhere. Order CBM (total_cbm) + Remaining CBM ((qty - delivered) x volume). Days open =
  today - date_order. Late = commitment_date < now and not fully delivered; no date = "No delivery date".
- [ ] Step C: "Open SO by Product Category" (Category | Open SOs | Remaining quantity | Remaining CBM), full path or
  3rd level; clicking a row filters the order table. Monitor mode toggle hides the controls.

## Manufacturing CBM by plant x product category (2026-10-19), built, waiting for developer approval
- New panel "Manufacturing CBM by Plant & Product Category" (MoCbmPanel.jsx) + `/api/operations/mo-cbm`,
  `/api/operations/mo-cbm/missing-volume.csv`; calculation in `services/manufacturingCbm.js`; mapping in
  `config/categoryGroups.js` (Controls, Heaters, Sauna Rooms, Panels/Timbers, Spare Parts mapped exactly; Doors,
  Wooden Accessories, Sauna Stones NOT mapped, waiting for the client).
- Finished goods only by default; toggles: include semi-finished, linked to open SOs only, full path / 3rd level;
  produced period Today / Week / Month. Late MOs card. Missing-volume list + CSV. Unit-mismatch MOs skipped and counted.
- MO products (categ_id, volume, uom_id) read 200 per request, retried once, cached between syncs.
  Sync time: 140 s first sync after restart, 64 s afterwards. 37 unit tests pass.
- Live numbers (19 Oct): finished goods 3,477 open MOs, 1,833.4 m³ planned, 36.6 m³ in production, 67.0 m³ produced
  this month, 2,382 late, 242 MOs / 193 products without volume. With semi-finished: 6,445 open MOs, 4,760.0 m³.

## Layout, Delivery Date, Manufacturing Order State (2026-10-21), built, waiting for developer test
- "Manufacturing CBM by Plant & Product Category" now sits directly below "Manufacturing Orders Per Plant"
  (OperationsSection.jsx; panel unchanged).
- Open Sales Ordered: column "Commitment date" -> "Delivery date" (also CSV header). The value already came from
  sale.order `commitment_date`, which Odoo 17 labels "Delivery Date" (fields_get). Verified S09259 = 10/21/2026 10:00.
- Order lines (click >): new "Manufacturing Order State" column after Ordered. MOs per line = same product AND
  (linked by Odoo `mrp_production_ids` OR MO Source/origin mentions the SO reference, "S09259"/"SO9259", not "PO#9259").
  One badge per state (count if several, MO refs on hover); Done green, Confirmed teal; "No MO" if none.
- Live check: S09259 shows 4 Confirmed MOs (matches Odoo), incl. PL1/MO/38080 found only via Source.
  621 open orders, 9,036 lines, 7,777 with an MO, 864 with several. ~3,150 MOs are linked only by Source.
- Cost: one extra Odoo search (250 orders per request), ~16 s more per operations sync. 47 unit tests pass.
- Read-only probe added: backend/scripts/odooDeliveryMoProbe.js.

## Per-order Excel export + Late Orders columns (2026-10-21), built, waiting for developer test
- Reference: docs/SO 9259.xlsx (one order, 4 sheets). Decisions (developer): per-order "Download Excel" button in the
  expanded order (CSV button unchanged); money INCLUDED in the Excel only (Pricelist, Payment Terms, Total Amount
  in the order's own currency; changed from "no money" on 2026-10-21; the dashboard table still has no money); Log Messages
  sheet was first skipped, then ADDED 2026-10-21 at the developer's request: `mail.message` added to the allow-list in
  odooClient.js (read methods only; only the one order's messages are read; Attachments = a count, ir.attachment not allowed)
- `GET /api/operations/open-orders/:id/export.xlsx` reads that one order from Odoo (read-only: sale.order, res.partner,
  sale.order.line, product.product) and builds the file in `services/orderExport.js` + `utils/xlsxWriter.js`
  (own small .xlsx writer, no library: npm could not reach the registry here). Only open orders in the snapshot.
- Checked in real Excel: all cells/fonts/fill/widths/heights equal the reference (0 differences on all 4 sheets, widths too).
  Order Date is Odoo's UTC string, like the reference. Total CBM = Odoo order total rounded to 4 decimals (0.0716).
- Late Orders: columns Customer | Delivery Date (commitment_date, the old "Promised") | Expected Date (Odoo
  `expected_date`, read with the existing 100-order batch in the operations sync, +0.3 s) | Days late | Delivery.
  Late logic unchanged. 54 unit tests pass.

## CBM Shipped monthly chart (2026-10-21), built, waiting for developer test
- Client: rename "CBM Shipped Per Plant" -> "CBM Shipped", monthly bar chart below the cards, no plants, composed of
  Accessories / Heaters / Sauna Rooms (Composition.png adds an "Other" bucket so totals add up).
- The 3 cards (Today / This week / This month) are unchanged. The plant table is replaced by `CbmShippedChart.jsx`
  (stacked bars, last 12 months, totals on top, legend, tooltip, month to date for the current month).
- `GET /api/operations/cbm-shipped/monthly` (`cbmShippedMonthly` in operationsAnalytics.js). Same shipped lines as the
  cards (done outgoing stock.move, quantity x product volume, month of the move date in APP_TIMEZONE), but
  FINISHED GOODS only (developer's choice): ~6,418 m3 of Semi-Finished / Raw / uncategorised outgoing moves since
  Nov 2025 (inter-warehouse transit, e.g. 2,870 m3 in Dec 2025, 1,044 m3 "All" in Mar 2026) are left out and shown in a note.
  Chart's current month = the card (230.99 m3).
- Groups (config/categoryGroups.js, SHIPPED_GROUPS, from Composition.png, "to confirm" by the client): Accessories =
  FG / Accessories; Heaters = FG / Heaters + Steam + Controls; Sauna Rooms = FG / Sauna Rooms; Other = the rest of FG
  (Spare Parts, Panels & Timbers, Marketing Material, Infrared, FG root).
- Sync now keeps 12 months of shipped lines (9,412 moves) and reads their category + volume through the existing
  product cache (`shippedProducts`); the first sync after a restart is a bit longer (~170 s seen).
- Verified: 12 months x 4 groups equal an independent recalculation (0 mismatches); 56 unit tests pass; screenshot checked.

## Customer scope switch (2026-10-21), built, OFF by default, waiting for the client's answer
- Finding: the API account sees ONE company (SAWO INC., Lapu-Lapu); 814 of ~1,300 orders (697 of 1,013 confirmed) have a
  SISTER COMPANY as customer (Bella Vivo 412, Sauna World 365, SAWO Nordic 17, F.E.M. 10, Sawo Sauna Europe 3,
  SAWO INC. itself 7). The client says the dashboard "is not correct / only SAWO needed": meaning not confirmed yet.
- New setting `CUSTOMER_SCOPE` in backend/.env (see .env.example): `all` (default, nothing changes) or `own_company`
  (only orders whose customer is SAWO INC. incl. its contacts). Applied where data is read: sales sync (sale.order) and
  operations sync (open sales orders, done deliveries, shipped lines via picking_id.sale_id.partner_id). Manufacturing
  orders are NOT filtered (they have no customer). Dashboard shows an amber notice when it is on.
- Test with it ON (port 4100): 10 orders (9 open), 14 shipped lines, CBM ~0.5 m3 in 12 months, no late orders:
  the dashboard becomes almost empty. Next: ask the client (questions sent) and, if he means "outside customers only",
  add a third scope for that. 58 unit tests pass.

## Multi-monitor / wallboard enhancement (2026-10-22), in progress
- [ ] Step 1: sticky header (`Header.jsx`: sticky top-0 z-40). Built, waiting for developer test.
  Header also made responsive (2 rows below 1280 px, 1 row above) and "Last sync" line restyled on 2026-10-21.
- [ ] Step 2: wake-up recovery, Display mode only, frontend only (`context/RefreshProvider.jsx`; DisplayProvider now
  wraps RefreshProvider in `main.jsx`). Reloads from our backend when the page is shown again / window gets focus /
  PC wakes (5 s heartbeat, gap > 20 s) / network comes back; only if data is older than 30 s (network: 5 s) and
  nothing is loading; the 30 s timer restarts after a wake-up reload and skips a tick right after any reload.
  Tested in headless Edge (DevTools protocol, scratchpad script): network back -> 1 reload; focus/visibility with
  fresh data -> 0; 35 s frozen timers ("sleep") -> 1 reload, no duplicates; Display mode OFF -> 0 extra reloads.
  Not tested: a real monitor/PC sleep. Lint + build pass; waiting for developer test.
  Note: `/api/operations/status` is requested twice per refresh (Header + OperationsSection), pre-existing.
- [ ] Step 3: settings remembered in Display mode only, frontend only. New `hooks/usePersistentState.js` (useState that
  reads/saves localStorage `cm.v1.*` only while Display mode is ON; every saved value is sanitized, bad values ->
  default). Remembered: Open Sales Ordered filters + sort (`OpenOrdersSection.jsx`), category level
  (`OpenOrdersByCategoryPanel.jsx`), MO CBM period / semi-finished / linked-only / level (`MoCbmPanel.jsx`), side menu
  open (`DisplayProvider.jsx`). Not remembered: page number, open/expanded order rows, current page (a wall monitor's
  kiosk shortcut opens the Dashboard). Tested in headless Edge (scratchpad script): ON -> all settings restored after
  reload; corrupted values -> defaults, 0 HTTP 400; OFF -> defaults, side menu closed, filters visible.
  Lint + build pass; waiting for developer test.
  Note for step 4: in Display mode the filter controls are hidden, so a remembered filter (e.g. "Late only") is
  invisible on the wall monitor; consider showing a small "Filtered by ..." line.
- [ ] Step 4: Display mode polish (developer chose: "Filtered by" line + hide download buttons; NOT chosen: hiding the
  MO CBM switches, larger text, hiding the footer). In Display mode: amber "Filtered by: ..." line on Open Sales
  Ordered when any filter is active (`ActiveFilters` in OpenOrdersPanel.jsx); per-order Excel button and MO CBM
  missing-volume CSV hidden (Open Orders CSV was already hidden with the filter bar). Tested in headless Edge:
  ON -> "Filtered by: Age: 31–90 days · Late only", 0 CSV links, 0 Excel buttons; OFF -> no line, 2 CSV links,
  Excel button shown. Lint + build pass; waiting for developer test.
- [ ] Step 5: screen-size check (headless Edge, scratchpad script) at 1024x768, 1280x720 (1920 @150%), 1366x768,
  1440x900, 1536x864 (1920 @125% / zoom 125%), 1920x1080, 2560x1440, 3440x1440, 3840x2160; normal + Display mode;
  side menu closed + open (36 combinations). Found and fixed (`Header.jsx`, `index.css`): (1) the period under the
  title was cut off below 1920 px -> "Production, shipping & sales" only shown from 1800 px, line may wrap to 2 lines;
  (2) on screens wider than 2000 px the header content sat at the screen edges while the dashboard is capped at
  1920 px -> header content capped at 2000 px and centred, `.header-bg` gradient keeps the black band running to the
  right edge. Result: no sideways page scroll, nothing sticking out, header 1 row (82-92 px) from 1280 px up, 2 rows
  (148 px) at 1024 px; with the menu closed the clock's right edge = the panels' right edge at every size. With the
  menu open the header does not shift with the content (by design). Lint + build pass; waiting for developer test.
- Fullscreen button: NOT wanted (developer, 2026-10-22). Wall PCs use a kiosk shortcut instead.
- `docs/Wall_Monitor_PC_Setup.pdf` (2026-10-22): setup guide for the display PCs. Finding (tested, headless, throwaway
  profiles): `msedge --kiosk` runs InPrivate and FORGETS Display mode on close; `chrome --kiosk` and
  `msedge --app=URL --start-fullscreen` remember it. DECISION (developer): display PCs use CHROME kiosk; guide v2 is
  Chrome-only (Edge option removed, short "why not Edge" note kept). Two monitors on one PC: second Chrome shortcut
  with its own --user-data-dir and --window-position (not tested on real monitors; one PC per monitor recommended).
- [ ] Step 1b (developer's request, 2026-10-22): hideable side menu (`Sidebar.jsx`, `context/displayContext.js`,
  `context/DisplayProvider.jsx`). Hidden by default; opened with the button at the left of the header. Links:
  Dashboard, Settings (Sales Orders / Analytics placeholders left out). "Display mode" checkbox replaces the
  "Monitor mode" tick box of Open Sales Ordered (same effect: filters + paging hidden, auto-scroll). From 1024 px
  the menu sits beside the page under the sticky header (`--header-h` measured in Header.jsx); below that it
  slides over the page. Lint + build pass; waiting for developer test.
- Decisions (developer, 2026-10-22): Display mode is the ON/OFF switch for the wall-monitor features; OFF = the normal
  system. Wake-up recovery, remembered settings and the wall-monitor view apply ONLY in Display mode. Sticky header
  and screen-size fixes apply always. Display mode starts OFF on a browser's first visit; the checkbox itself is
  always remembered (localStorage `cm.displayMode.v1`, per browser).

## Full code audit (2026-10-22, by Claude), waiting for developer test
- Read-only toward Odoo CONFIRMED: only `odooClient.js` talks to Odoo; every call (app + probe scripts) goes through
  `execute()` with the method allow-list (search/read/search_read/search_count/read_group/fields_get/
  check_access_rights) and the model allow-list. No create/write/unlink anywhere. Backend routes are GET only;
  the frontend only calls `/api` (GET). `.env` is git-ignored and was never committed.
- 58/58 tests pass, lint and build pass.
- Fixed: Open Sales Ordered could get stuck on an empty page (no paging buttons) when an auto-refresh made the
  list shorter -> now jumps to the last existing page (`OpenOrdersPanel.jsx`).
- Fixed: `backend/.env.example` had SYNC_INTERVAL_SECONDS / OPERATIONS_SYNC_INTERVAL_SECONDS / APP_TIMEZONE twice;
  cleaned up, and ODOO_TIMEOUT_MS documented as 60000 (see the sync-failure note below).

## Docker deployment (2026-10-22), started at the developer's request
Docker Desktop + WSL installed on the dev PC and tested (`docker run hello-world` OK).
Plan: backend container (Node) + frontend container (Nginx serving the built React app, proxying /api to the backend).
- Firewall blocked registry.npmjs.org (HTTPS cut after connect); IT whitelisted it. npm downloads are still slow (~5 min).
- [x] Step 1: backend container (`backend/Dockerfile`, `backend/.dockerignore`, `docker-compose.yml`). Tested by Claude
  on port 4001: real sync OK (1,302 orders, 14,131 lines in 27 s), /api/health + /api/sync/status OK.
- [ ] Step 2: frontend container (`frontend/Dockerfile` two-stage build -> Nginx 1.28, `frontend/nginx.conf`,
  `frontend/.dockerignore`), backend port no longer published, `TRUST_PROXY=true` (new setting in `config/app.js`,
  used in `server.js`) set by docker-compose only. Dashboard at http://<PC IP>/ (port 80). Built and smoke-tested by
  Claude (page, React routes, assets, /api through Nginx, real sync); developer browser test from another PC pending.
- Step 3 (auto-start after reboot) SKIPPED by the developer: the server PC is never turned off.
- Complete guide (how it was built, every file, server deployment, updates, troubleshooting): `docs/Docker_Guide.pdf`.
- Docker files are NOT committed yet (ask the developer before committing).

## Shipped CBM: finished goods only (2026-10-22), built, waiting for developer test
- Client's manager (Judith): "only finished goods (heaters, sauna rooms, accessories)" and "correct is Shipped CBM".
- Panel renamed "CBM Shipped" -> "Shipped CBM". The Today / This week / This month cards now count FINISHED GOODS only
  (same rule as the monthly chart; `cbmShipped` in operationsAnalytics.js uses the product category from the sync).
  Other finished goods (spare parts, panels & timbers, marketing, infrared) stay in as "Other" (developer's choice).
- Live check 22 Oct: today 41.6 m3, week 136.9 m3, month 272.5 m3 = the chart's October bar. 58 unit tests pass.
- Not changed: plant-to-plant transfers of finished goods still count (the manager did not mention them).

## Documentation version 3 (2026-10-22)
- docs/documentation.md rewritten for the current system; title "Central Monitoring for SAWO INC.: User Documentation".
  Covers: SAWO INC. only + sister companies as customers + CUSTOMER_SCOPE, Docker/network access, side menu and
  Display mode, CBM Shipped (finished goods, monthly chart), MO state + Excel export, Late Orders dates, known limits
  (late validation in Odoo, see "September 2026 Shipped CBM Check.pdf").
- docs/Central_Monitoring_Documentation.pdf regenerated from it (16 pages, Edge print-to-PDF); 17 screenshots retaken
  from the running app (docs/screenshots), 5 outdated ones removed.

## Open Sales Ordered: Destination column (2026-10-22), built, waiting for developer test
- New column "Destination" right after SO# = country of the order's Delivery Address (sale.order partner_shipping_id ->
  res.partner country_id). Matched the client's Excel "CUST. CODE-DESTINATION" in 20 of 20 checked orders; the customer's
  country does not (312 of 626 open orders ship to another country). Country only; "—" when empty (34 of 626).
  NOT in the CSV (developer's choice). One extra read of the delivery addresses in the operations sync. 59 tests pass.

## Consolidation Order page + review fixes 1 and 2 (2026-10-26/27), built and verified, waiting for developer test
- Review fix #1: the open-orders list is built once per Odoo sync (cached on the snapshot arrays), only days open / age / late
  are worked out per request; one search pattern per order. Open-orders answers in about 3 ms. Fix #2: a known product is
  re-read from Odoo only when its cached copy is older than 20 minutes. 63 -> 78 tests with the new page.
- New page `/consolidation` (side menu below Settings). Own folders: frontend `frontend/src/pages/consolidationOrder/`, backend
  `backend/src/pages/consolidationOrder/` (READMEs inside). Decisions (developer, recommendations): quantity = remaining
  (ordered - delivered); default scope = Delivery Date today..+30 days (switches for overdue / no date); finished goods only;
  destination = Odoo country. Workbook: docs/1_ as of 10-20  Consolidated Order of WWP1.xlsx (sheets "Consolidation FG" = pivot,
  "Sheet4" = flat data); it is a planner's selection, quantities equal Odoo in ~60% of product rows.
- 2026-10-27: the date filter is now strict: dropdown "Delivery date" (Date range / Overdue / No delivery date / Any date) replaces the
  two "include overdue / no date" checkboxes, which added orders OUTSIDE the chosen range (reported by the developer). Files of the page
  renamed to the `consolidationOrder` style (folders `pages/consolidationOrder/`).
- 2026-10-27: checkbox "Include lines with nothing left to ship" (`includeDelivered`): fully delivered lines of the OPEN orders (developer's
  choice; completely closed orders and quotations are not in the production data). 80 tests pass.
- Endpoints `/api/consolidation/lines | matrix | export.xlsx`; filters SO#, destination, delivery from/to (+overdue, no date),
  product ref, product name, qty min/max. The product cache now also keeps default_code and name (same Odoo read).
  `xlsxWriter.js` extended (fills, borders, number formats, formulas, hidden column, tab colour, auto-filter), no new package.
- Verified against live Odoo: 552 lines / 24,845 pieces for 27 Oct-26 Nov equal an independent calculation (0 differences,
  0 duplicates, 544 matrix cells right, combined filters equal); Excel opened in Excel: formatting equals the sample, SUM
  formulas recalculate to the stored totals; browser test: sidebar navigation, filters, empty state, too-wide message, 390 px.

## Code review fixes 3, 5, 6 (2026-10-27), built and verified, waiting for developer test
- #3 `Header.jsx`: while a sync is still "connecting", the 5-second retry no longer reloads while requests are running. Browser test
  during a backend start-up with one slow request: old header 135 API requests / 8 cancelled; new header 45 requests / 0 cancelled.
- #5 new `backend/src/utils/csv.js` (`csvCell`): text starting with = + - @ (tab, CR) gets a leading ' in both CSV files
  (open orders, missing volume). 3 new tests (83 in total).
- #6 `useApi` keeps `receivedAt`; `Header.jsx` `isStale()` = the server's `dataAgeSeconds` + time passed in THIS browser, so a wrong
  PC clock no longer matters. Browser test: PC clock 10 min fast: old header "Data may be outdated" (false alarm), new header
  "Connected to Odoo"; server reporting 500 s old data: new header "Data may be outdated".
- NOT done: #7 (volume stored twice, cosmetic) and #4 (Stage uses only Odoo's own MO link while the lines also use the MO Source text):
  measured on 27 Oct: 23 of 635 open orders (about 4%) would change stage; "Ready to ship" 188 -> 175, "In production" 38 -> 46,
  "Waiting for production" 53 -> 58. Needs the client's OK because the Lead Time numbers change.

## Consolidation Order: items made for the order (manufacturing-order source) (2026-10-27), built and verified, DECISION OPEN
- New checkbox `includeMo` (off by default): finished-goods items that have a non-cancelled MO mentioning an open order (or linked by
  Odoo) but whose product is not on that order's lines; one row per MO, one order per MO. Source column + Excel Details columns.
  The sync now searches the MO Source for ALL products (100 orders per request): syncs are about 20-30 s longer (158 s, 181 s first
  after a restart). 87 tests pass. Verified: 16 items = 16 independent on 57 orders (0 differences, none counted twice), browser,
  Excel opened in Excel.
- FINDING: only 1 of the workbook's 115 missing rows is covered, because 20 of the 21 that have an MO are Semi-Finished in Odoo.
  Allowing all Semi-Finished would add ~1,100 rows on 57 sampled orders (noise). Options: keep as is (125 finished-goods items on
  68 orders), add a planner-approved semi-finished family (e.g. product codes 9SR...), or revert (restores the sync time).

## Settings: Odoo Data Sync panel (2026-10-27), built and checked
- New panel at the top of Settings (frontend/src/components/settings/OdooSyncPanel.jsx, rules in frontend/src/utils/syncHealth.js): for SALES and PRODUCTION the last copy time, wait, full cycle, data age, last copy, and an overall Odoo status (Smooth / Stable / Starting / Delayed / Outdated / Unreachable). No backend change. Live: SALES copy 23 s, PRODUCTION 3 min 1 s (full cycle 5 min 1 s).

## Open questions / notes
- Sync failures: several syncs failed after ~16 s (looks like `ODOO_TIMEOUT_MS=15000` being exceeded by one
  Odoo request). Check the backend log line; consider `ODOO_TIMEOUT_MS=60000` in `backend/.env`.
- Sync interval: `.env` uses 30 s (wait after each sync); a full sync takes ~25–40 s.
- The Odoo API account is not truly read-only inside Odoo; a real read-only user must replace it before deployment.
- Analytics page is a placeholder (not in steps A–J); decide when to build it.
## Open Sales Ordered: scroll box + search by destination (2026-10-22), built, waiting for developer test
- Table is a scroll box about 10 rows high (`max-h-[520px]`, column titles sticky); rows per page unchanged
  (20 normal, 10 in Display mode). Measured in headless Edge at 1920x1080: 10 rows fully visible in both modes,
  titles stay on top while scrolling.
- Search now also matches the Destination (backend `filterOpenOrders` in services/openOrders.js; same for the CSV).
  Placeholder "Search SO#, customer or destination". Live check: "malaysia" -> 11 of 627 orders, case ignored.
  New unit test; 60 tests pass. Docker: needs `docker compose up -d --build` (backend + frontend changed).

## Consolidation Order: multiple SO# + Product Category (2026-10-27), built and verified, waiting for developer test
- SO# filter takes several numbers (chips: Enter / comma / semicolon / new line / paste; duplicates in any spelling ignored;
  OR among SO#, AND with the other filters). "SO 9259", "SO9259", "S09259" = exactly that order; other text = contains-match.
- "Product Category" (Odoo `product.product.categ_id`) right of Description (Consolidation) and right of Product Name
  (Order Lines), and in both Excel sheets. Shared rule with CBM Shipped in `config/categoryGroups.js` (`productCategoryLabel`).
- Checked against live Odoo: 1,798 products, 0 wrong categories; 5 SO# combos with Destination / date / product filters
  matched an independent Odoo calculation. 97 backend tests pass; lint + build OK. Docker: needs `docker compose up -d --build`.

## Consolidation Order filters: layout (2026-10-27), built, waiting for developer test
- `ConsolidationOrderFilters.jsx`: the two checkboxes and the Clear / Apply buttons now sit in the free space next to
  "Order Quantity: max" (level with its box) instead of a separate row. Checked in headless Edge at 1920, 1280, 800 px.
