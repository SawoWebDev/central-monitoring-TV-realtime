// ONE place that maps Odoo product categories to the client's Excel product groups
// (Excel "WEEK 43 2026 SHIPMENT SCHEDULE": Controls, Heaters, Wooden Accessories, Doors, Sauna Rooms,
// Panels/Timbers, Spare Parts, Sauna Stones).
//
// Rule: a category belongs to a group when its full path EQUALS one of the group's prefixes or starts with
// "<prefix> / ". The longest matching prefix wins. Anything that does not match is shown as "Unmapped".
// Only EXACT name matches are listed (checked against the real Odoo categories on 2026-10-19).
// Do not add a prefix without the client's confirmation.
export const CATEGORY_GROUPS = [
  { group: 'Controls', prefixes: ['All / Finished Goods / Controls'] },
  { group: 'Heaters', prefixes: ['All / Finished Goods / Heaters'] },
  { group: 'Sauna Rooms', prefixes: ['All / Finished Goods / Sauna Rooms'] },
  { group: 'Panels/Timbers', prefixes: ['All / Finished Goods / Panels & Timbers'] },
  { group: 'Spare Parts', prefixes: ['All / Finished Goods / Spare Parts'] },

  // NOT MAPPED YET - waiting for the client (do not guess):
  // - Doors: candidates "All / Finished Goods / Accessories / Doors & Handles / Glass Doors" and
  //   ".../Wooden Doors" (that category also holds Glass Window, Parts and Wooden Handles).
  // - Wooden Accessories: candidate "All / Finished Goods / Accessories", but it also contains
  //   Controls, Heaters, Infrared and glass doors, so it is not an exact match.
  // - Sauna Stones: no Odoo category with that name was found.
  { group: 'Doors', prefixes: [] },
  { group: 'Wooden Accessories', prefixes: [] },
  { group: 'Sauna Stones', prefixes: [] },
];

export const UNMAPPED = 'Unmapped';

export function categoryGroup(categoryPath, groups = CATEGORY_GROUPS) {
  if (!categoryPath) return UNMAPPED;
  let best = null;
  for (const { group, prefixes } of groups) {
    for (const prefix of prefixes) {
      const matches = categoryPath === prefix || categoryPath.startsWith(`${prefix} / `);
      if (matches && (!best || prefix.length > best.prefix.length)) best = { group, prefix };
    }
  }
  return best ? best.group : UNMAPPED;
}

// --- "CBM Shipped" monthly chart (client request 2026-10-21) --------------------------------------
// Groups from the client's "Composition.png" (marked "to confirm" there): Sauna Rooms (finished rooms),
// Heaters (heaters, steam generators, controls), Accessories (wooden accessories, signs, pails, sandtimers,
// thermo-hygrometers...). "Other" keeps everything else (spare parts, panels & timbers, marketing material,
// finished goods without a sub-category) so the monthly total always adds up.
// Same prefix rule as CATEGORY_GROUPS above. Only Finished Goods are counted in this chart (developer's choice).
export const FINISHED_GOODS = 'All / Finished Goods';
export const isFinishedGoods = (categoryPath) =>
  Boolean(categoryPath) && (categoryPath === FINISHED_GOODS || categoryPath.startsWith(`${FINISHED_GOODS} / `));

export const SHIPPED_GROUPS = [
  { group: 'Accessories', prefixes: ['All / Finished Goods / Accessories'] },
  {
    group: 'Heaters',
    prefixes: ['All / Finished Goods / Heaters', 'All / Finished Goods / Steam', 'All / Finished Goods / Controls'],
  },
  { group: 'Sauna Rooms', prefixes: ['All / Finished Goods / Sauna Rooms'] },
];
export const SHIPPED_OTHER = 'Other';

export function shippedGroup(categoryPath) {
  const group = categoryGroup(categoryPath, SHIPPED_GROUPS);
  return group === UNMAPPED ? SHIPPED_OTHER : group;
}

// --- "Product Category" shown on the Consolidation Order page (2026-10-28) --------------------------------------
// Odoo's own category path of the product without the "All /" root and without "Finished Goods /", e.g.
// "All / Finished Goods / Accessories / Pails / Wooden" -> "Accessories / Pails / Wooden". The first part is the same
// family name the CBM Shipped chart uses (Accessories, Heaters, Sauna Rooms); CBM Shipped itself still adds Steam and
// Controls to its Heaters group (shippedGroup above), but this page shows where the product really sits in Odoo.
// A product without a category is shown as "No category" and is never put into another category.
export const NO_CATEGORY = 'No category';

// Display full path without the "All /" root and without "Finished Goods /".

// export function productCategoryLabel(categoryPath) {
//   if (!categoryPath) return NO_CATEGORY;
//   return categoryPath.replace(/^All \/ /, '').replace(/^Finished Goods \/ /, '') || categoryPath;
// }

export function productCategoryLabel(categoryPath) {
  if (!categoryPath) return NO_CATEGORY;
  const group = shippedGroup(categoryPath);
  if (group !== SHIPPED_OTHER) return group;
  return categoryPath.replace(/^All \/ /, '').replace(/^Finished Goods \/ /, '') || categoryPath;
}