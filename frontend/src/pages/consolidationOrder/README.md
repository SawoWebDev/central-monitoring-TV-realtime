# Consolidation Order page (frontend)

Everything of the **Consolidation Order** screen (`/consolidation`, sidebar item below Settings) lives in this folder.
The matching server code is in `backend/src/pages/consolidationOrder/` (see its README).

The page shows the **open sales orders' lines still to make and ship** (finished goods), the way the client's planning
workbook *"Consolidated Order of WWP1"* shows them. It is **read-only**: the browser only talks to our own backend
(`/api/consolidation/...`), never to Odoo.

## Files

| File | What it does |
|---|---|
| `ConsolidationOrderPage.jsx` | The page. Holds the filters, the active tab, sorting and paging. Calls the backend with `useApi`. Also has the summary line and the **Export Excel** button. |
| `ConsolidationOrderFilters.jsx` | The filter form (SO# **one or more**, Destination, Delivery date mode + from/to, Product Ref., Product Name, quantity min/max, 1 checkbox) with **Apply Filters** and **Clear Filters**. |
| `ConsolidationOrderSoInput.jsx` | The SO# box with removable chips: Enter, comma, semicolon, new line or paste adds SO numbers; duplicates ignored; Backspace removes the last chip. Any of the SO numbers matches (OR), AND with the other filters. |
| `ConsolidationOrderMatrix.jsx` | Tab **Consolidation**: products × sales orders (like the sheet "Consolidation FG"). |
| `ConsolidationOrderList.jsx` | Tab **Order lines**: one row per order line, sortable, paged (like the sheet "Sheet4"). |
| `consolidationOrderShared.js` | Small helpers: the empty/default filters, turning filters into query parameters, checking them, number format. |

Shared things used from outside this folder (change them with care, other pages use them):
`components/Panel.jsx`, `components/AsyncContent.jsx`, `hooks/useApi.js`, `services/api.js`, `utils/format.js`.

## How it works (in 5 lines)

1. `ConsolidationOrderPage` keeps two copies of the filters: `draft` (what is typed) and `applied` (what was searched).
2. **Apply Filters** copies `draft` to `applied`; changing `applied` makes `useApi` ask the backend again.
3. `GET /api/consolidation/lines` feeds the **Order lines** tab, the summary line and the destination dropdown.
4. `GET /api/consolidation/matrix` feeds the **Consolidation** tab (only requested while that tab is open).
5. `GET /api/consolidation/export.xlsx` is the Excel file, built by the backend with the same filters.

The data refreshes by itself every 30 seconds (the app's normal refresh); the filters are kept.

## Fully delivered lines

The checkbox **Include lines with nothing left to ship** (`includeDelivered`) also lists the lines of the open orders that
have nothing left to ship (fully delivered, or an ordered quantity of 0 in Odoo; Order Quantity 0, shown greyed). They appear on the **Order lines** tab and in the Excel "Details" sheet. The
**Consolidation** matrix never shows them: it only holds quantities still to ship.

## The Delivery date filter

A dropdown with four modes (`deliveryMode`): **Date range** (the default: only the `from`..`to` dates, nothing outside them),
**Overdue** (before today), **No delivery date (TBA)** and **Any date**. The two date boxes only work in "Date range" mode and are
greyed out otherwise (`filterParams()` then does not send them).

## Items made for the order

The checkbox **Include items made for the order (manufacturing orders)** (`includeMo`) adds items that have a manufacturing order
for the sales order but are not on the order itself. The **Order lines** tab has a **Source** column ("Order line", or a badge
"MO <reference> · <state>"), and the Excel "Details" sheet has the columns Source, MO and MO state. Details and limits: see the
backend README.

## Start values

The page opens with **Delivery date from today to 30 days ahead** (`defaultFilters` in `consolidationOrderShared.js`),
about the size of the Excel's plan. **Clear Filters** removes every filter (all open orders). The matrix is limited to
60 orders side by side; if more match, it asks to narrow the filters (the order lines and the Excel have no limit).

## Common changes

- **Add a filter:** (1) add the field to `EMPTY_FILTERS` and to the list in `filterParams()` in `consolidationOrderShared.js`,
  (2) add an input in `ConsolidationOrderFilters.jsx`, (3) read and apply it in the backend (`parseFilters` in the controller
  and `filterRows` in `consolidationOrder.js`), (4) add a test in `backend/test/consolidationOrder.test.js`.
- **Add a column to the Order lines tab:** add it to `COLUMNS` and to the row in `ConsolidationOrderList.jsx`; the value must
  exist in the backend row (see `build()` in `backend/src/pages/consolidationOrder/consolidationOrder.js`).
- **Change colours or widths:** only Tailwind classes in the three view files.

## Rules

- Never call Odoo from here, and never add buttons that change data. Odoo is read-only.
- This page has its own table components and does not use Open Sales Ordered's, so a change here never affects that page (and the other way round).
- Test after a change: in `frontend` run `npx eslint src` and `npm run build`; in `backend` run `node --test`.
