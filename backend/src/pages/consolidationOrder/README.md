# Consolidation Order page (backend)

Everything the **Consolidation Order** screen needs from the server lives in this folder.
The matching screen code is in `frontend/src/pages/consolidationOrder/` (see its README).

**Read-only.** Nothing here talks to Odoo. It only calculates from the *operations snapshot* that the normal
production sync already copied (`getOperationsSnapshot()`): the open sales orders, their order lines and the product
list. So the page adds **no extra Odoo requests**.

## Files

| File | What it does |
|---|---|
| `consolidationOrder.js` | The calculations (pure functions, easy to test): `consolidationData` (builds the rows once per Odoo sync), `filterRows`, `sortRows`, `buildMatrix`, `summarize`. |
| `consolidationOrderController.js` | The 3 endpoints: reads and checks the query parameters, calls the functions above, answers in the app's usual JSON shape. |
| `consolidationOrderRoutes.js` | Connects the endpoints to the addresses. Mounted in `backend/src/server.js` as `/api/consolidation`. |
| `consolidationOrderExport.js` | Builds the Excel file (sheets "Consolidation FG" and "Details") with our own writer `backend/src/utils/xlsxWriter.js` (no extra library). |

Tests: `backend/test/consolidationOrder.test.js` (made-up data only, never company data).
Run them: in the `backend` folder, `node --test`.

## Endpoints (all GET)

| Address | Answer |
|---|---|
| `/api/consolidation/lines` | The filtered order lines, sorted and paged (`sortBy`, `sortOrder`, `page`, `limit`), plus `meta` with the summary, the left-out counts and the destination choices. |
| `/api/consolidation/matrix` | Products × sales orders for the filtered lines (or `tooWide: true` when more than 60 orders match). |
| `/api/consolidation/export.xlsx` | The same filtered data as an Excel file. |

### Filters (query parameters, all optional, all combined with AND)

| Parameter | Meaning |
|---|---|
| `so` | Text inside the SO number (`9259` finds `S09259`), ignoring case |
| `destination` | A country name, or `none` for orders without a country |
| `deliveryFrom`, `deliveryTo` | `YYYY-MM-DD`, inclusive, in the business timezone (Manila) |
| `deliveryMode` | `range` (default): only the `deliveryFrom`..`deliveryTo` dates, nothing outside them. `rangeOrNoDate`: the same range plus the orders without a Delivery Date ("TBA"). `overdue`: Delivery Date before today. `noDate`: only orders without a Delivery Date. `all`: any date. |
| `productRef` | Text inside the product code (Internal Reference) |
| `productName` | Text inside the product name |
| `qtyMin`, `qtyMax` | Range of the line's quantity (the remaining quantity) |
| `includeMo` | `true`: also list items that have a manufacturing order (MO) for the order but are not on it (rows with `source: "mo"`, with `moReference` and `moState`). Hidden by default. See "Items made for an order" below. |
| `includeDelivered` | `true`: also list the lines of the open orders with nothing left to ship (fully delivered or ordered quantity 0, remaining 0). Hidden by default. They are not in the matrix (nothing left to ship), but they are in `/lines` and in the Excel "Details" sheet. |

Bad input (a wrong date, from after to, a negative number…) is answered with **400** and a short message.

## Where every value comes from (Odoo, read-only)

| On the page / in the Excel | Odoo | Notes |
|---|---|---|
| SO# (`so #`) | `sale.order.name` | The Excel writes the number only (9259 for S09259) |
| Destination | `sale.order.partner_shipping_id` → `res.partner.country_id` | Country of the **Delivery Address**. The Excel's own short names (HALU, SSE, LOCAL…) cannot be reproduced. "No country" when empty. |
| Delivery Date (Excel *Completion Date*) | `sale.order.commitment_date` | "TBA" when empty. Day = Manila time. |
| Product Ref. / Item Code | `product.product.default_code` | Empty for products without one |
| Product Name (Excel *Desciption*) | `product.product.name` | |
| **Product Category** | `product.product.categ_id` | Same rule as **CBM Shipped** (`productCategoryLabel()` in `config/categoryGroups.js`): Accessories, Heaters (Heaters + Steam + Controls) and Sauna Rooms; any other real Odoo category keeps its own name (e.g. "Packaging"); "No category" when empty. Hover shows the full Odoo path. Right of Description / Product Name, also in the Excel. |
| Ordered / Delivered | `sale.order.line.product_uom_qty` / `qty_delivered` | |
| **Order Quantity** | ordered − delivered | **Remaining** quantity, never below 0 |

## Rules the calculation follows

- **Which orders:** the *open* sales orders (confirmed, not fully delivered), the same as *Open Sales Ordered*.
- **Which lines:** finished goods only (category `All / Finished Goods …`). By default only lines with quantity still to
  deliver; fully delivered lines are kept as rows but hidden unless `includeDelivered=true`. Non-finished-goods lines are
  always left out. Both are counted in `meta.scope.excluded`. Orders that are completely closed (fully delivered) are not
  in the production data at all, so they cannot be shown.
- **No duplicates:** one row per Odoo order line. The matrix adds the quantities of the same product on the same order.
- **Matrix columns** are ordered like the Excel: orders without a delivery date (TBA) first, then by date, then SO number.
- **Excel formulas:** the Grand Total column and row are `SUM` formulas (with the result stored, so they show at once).

## Items made for an order but not on it (filter `includeMo`)

The planners add accessories to a container that are not on the Odoo order. Odoo knows part of them as manufacturing orders
(MOs) whose Source text mentions the order. With `includeMo`, each such MO becomes one row (quantity = the MO's quantity to
produce) when: it is not cancelled; its product is a **finished good**; the product is **not on any line of that order** (then
the MO is just the production of that line); and the order is open. An MO belongs to **one** order only: the order Odoo links
it to, otherwise the first open order its Source text mentions (so it is never counted twice).

The production sync (`operationsService.js`) searches the MO Source for ALL products for this (about 17,700 MOs, 100 orders
per request), which adds about 20 to 30 seconds to each production sync.

**Measured on 27 Oct 2026:** 125 such items on 68 orders. Of the 21 workbook rows that have an MO, 20 are *Semi-Finished* in
Odoo (9SR sauna-room parts, wood parts), so this finished-goods rule covers only 1 of the workbook's 115 rows that are not on
the Odoo order. Allowing Semi-Finished would add about 1,100 rows on 57 sampled orders (heater sub-assemblies), far too
noisy: a rule for which semi-finished families count would have to come from the planners.

## Known difference from the client's workbook

The workbook is a planner's selection: it also contains items that are **not on the Odoo order**, quantities chosen for
a container, and "NO SO YET" / local rows without an SO number. Those cannot appear here because Odoo does not have them.

## Rules for changes

- Never add anything that writes to Odoo. Do not add Odoo models or fields to `odooClient.js` for this page.
- Keep `consolidationOrder.js` free of Express and Odoo code (pure functions), so it stays testable.
- Add a test for every new filter or calculation.
