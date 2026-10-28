// Unit tests for the optional customer scope. ALL DATA IN THIS FILE IS MADE-UP TEST DATA.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { customerScopeDomain, parseCustomerScope } from '../src/utils/customerScope.js';

test('parseCustomerScope: default is all, only known values are accepted', () => {
  assert.equal(parseCustomerScope(undefined), 'all');
  assert.equal(parseCustomerScope(''), 'all');
  assert.equal(parseCustomerScope(' Own_Company '), 'own_company');
  assert.throws(() => parseCustomerScope('sawo'), /CUSTOMER_SCOPE must be one of/);
});

test('customerScopeDomain: no filter for all, child_of the company partner for own_company', () => {
  assert.deepEqual(customerScopeDomain('all', 7), []);
  assert.deepEqual(customerScopeDomain('own_company', 7), [['partner_id', 'child_of', 7]]);
  assert.deepEqual(customerScopeDomain('own_company', 7, 'sale_id.partner_id'), [['sale_id.partner_id', 'child_of', 7]]);
  assert.throws(() => customerScopeDomain('own_company', null), /company partner was not found/);
});
