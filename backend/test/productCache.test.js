// Unit tests for the product cache of the production sync. ALL DATA IN THIS FILE IS MADE-UP TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadMoProducts, PRODUCT_REFRESH_MIN_AGE_MS } from '../src/services/operationsService.js';

// A fake Odoo client that only counts which products are read (nothing is contacted).
function fakeOdoo() {
  const reads = [];
  return {
    reads,
    execute: async (model, method, args) => {
      assert.equal(model, 'product.product');
      assert.equal(method, 'read'); // read-only
      reads.push(...args[0]);
      return args[0].map((id) => ({ id, categ_id: [1, 'All / Finished Goods'], volume: 0.5, uom_id: [1, 'Unit'], default_code: `T-${id}`, name: `TEST ${id}` }));
    },
  };
}

test('product cache: new products are read once, known products are not read again within 20 minutes', async () => {
  const odoo = fakeOdoo();
  const ids = [910001, 910002, 910003];
  const first = await loadMoProducts(odoo, ids);
  assert.deepEqual(odoo.reads, ids);
  assert.deepEqual(first[910001], { category: 'All / Finished Goods', volume: 0.5, uomId: 1, code: 'T-910001', name: 'TEST 910001' });

  // the same list again, seconds later (like the next product list of the same sync): nothing is read
  await loadMoProducts(odoo, ids, Date.now() + 5_000);
  assert.deepEqual(odoo.reads, ids);

  // a new product is read straight away, the known ones are still not
  await loadMoProducts(odoo, [...ids, 910004], Date.now() + 60_000);
  assert.deepEqual(odoo.reads, [...ids, 910004]);
});

test('product cache: known products are refreshed once they are older than the minimum age', async () => {
  const odoo = fakeOdoo();
  const ids = [920001, 920002];
  await loadMoProducts(odoo, ids);
  odoo.reads.length = 0;
  const result = await loadMoProducts(odoo, ids, Date.now() + PRODUCT_REFRESH_MIN_AGE_MS + 1_000);
  assert.deepEqual(odoo.reads.sort(), ids); // read again
  assert.deepEqual(Object.keys(result).map(Number).sort(), ids);
});
