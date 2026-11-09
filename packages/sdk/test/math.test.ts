import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE, buyQuote, commitment, curveCost, floorPerToken } from '../src/index.ts';

test('split buys differ only by segment rounding', () => {
  for (let sold=0n;sold<500n;sold+=23n) {
    const whole=curveCost(sold,7n), split=curveCost(sold,3n)+curveCost(sold+3n,4n);
    assert.ok(split>=whole && split-whole<=2n);
  }
});
test('buy quote includes floor contribution and exact 1% fee', () => assert.equal(buyQuote(0n,100n), curveCost(0n,100n)+curveCost(0n,100n)/5n+curveCost(0n,100n)/100n));
test('floor quotient is integer and zero with no supply', () => { assert.equal(floorPerToken(100n,3n),33n); assert.equal(floorPerToken(0n,0n),0n); });
test('buy quote clamps gross price to the redeemable floor', () => {
  const quote = buyQuote(0n, 10n, 10n * 10n ** 24n, 200n);
  const gross = 10n * 10n ** 24n / 20n;
  assert.equal(quote, gross + gross / 5n + gross / 100n);
});
test('curve round trip cannot create value', () => {
  for (let sold=0n;sold<700n;sold+=37n) assert.ok(curveCost(sold,25n,false)<=curveCost(sold,25n,true));
  assert.equal(curveCost(0n,1n),101852896845351800139n);
  assert.equal(curveCost(100n,25n),18539463988387537570164n);
  assert.equal(curveCost(799n,1n),9991663140311081779785n);
});
test('commitment binds bidder, amount, price and salt', () => {
  const a = commitment('a.testnet',3n,BASE*2n,'secret');
  assert.notDeepEqual(a, commitment('b.testnet',3n,BASE*2n,'secret'));
  assert.notDeepEqual(a, commitment('a.testnet',4n,BASE*2n,'secret'));
});
