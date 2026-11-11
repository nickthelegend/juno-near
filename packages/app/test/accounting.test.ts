import test from 'node:test';
import assert from 'node:assert/strict';
import { positionAccounting, type Fill } from '../lib/accounting';
const fill = (kind: Fill['kind'], quantity: number, near: number, ms = 1): Fill => ({kind, quantity: String(quantity), total: (BigInt(near) * 10n ** 24n).toString(), ms});

test('an unsold buy has no realised loss; open P&L excludes its cost', () => {
  const p = positionAccounting([fill('buy', 10, 2)], 10, 0.3);
  assert.equal(p.realised, 0);
  assert.equal(p.unrealised, 1);
  assert.equal(p.unrealisedPct, 0.5);
});
test('partial sales release only the average cost of the units sold', () => {
  const p = positionAccounting([fill('auction', 10, 2), fill('sell', 5, 2, 2)], 5, 0.4);
  assert.equal(p.realised, 1);
  assert.equal(p.unrealised, 1);
  assert.equal(p.averageCost, 0.2);
});
test('a later buy cannot change profit already realised on an earlier exit', () => {
  const p = positionAccounting([fill('buy', 10, 2), fill('sell', 10, 3, 2), fill('buy', 10, 10, 3)], 10, 1);
  assert.equal(p.realised, 1);
  assert.equal(p.averageCost, 1);
  assert.equal(p.unrealised, 0);
});
test('redemptions count as exits and a fully exited position has zero open P&L', () => {
  const p = positionAccounting([fill('buy', 10, 2), fill('redeem', 10, 1, 2)], 0, 1);
  assert.equal(p.realised, -1);
  assert.equal(p.unrealised, 0);
  assert.deepEqual(p.exits, [-1]);
});
test('transfers, oversold records and capped logs cannot claim a known cost', () => {
  for (const p of [positionAccounting([fill('buy', 10, 2)], 11, 1), positionAccounting([fill('sell', 1, 1)], 0, 1), positionAccounting([fill('buy', 10, 2)], 10, 1, true)]) {
    assert.equal(p.realised, null);
    assert.equal(p.unrealised, null);
    assert.equal(p.averageCost, null);
  }
});

test('portfolio history follows observed prices and balances across markets without interpolated samples', async () => {
  const { portfolioHistory } = await import('../lib/accounting');
  const history = portfolioHistory([
    {market:'a', account:'me', ms:1000, kind:'buy', quantity:10, price:0.2},
    {market:'a', account:'other', ms:2000, kind:'buy', quantity:1, price:0.3},
    {market:'b', account:'me', ms:3000, kind:'auction', quantity:5, price:1},
    {market:'a', account:'me', ms:4000, kind:'redeem', quantity:5, price:null},
  ], 'me');
  assert.deepEqual(history.map(p => p.value), [2,3,8,6.5]);
  assert.deepEqual(history.map(p => Date.parse(p.t)), [1000,2000,3000,4000]);
});
