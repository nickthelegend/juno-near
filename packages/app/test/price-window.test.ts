import test from 'node:test';
import assert from 'node:assert/strict';
import { withinSpan } from '../lib/price-window';

test('quiet chart windows do not borrow older fills or show future/invalid timestamps', () => {
  const now = Date.parse('2026-11-11T12:00:00Z');
  const old = {t:'2026-11-09T12:00:00Z',price:1};
  const recent = {t:'2026-11-11T11:45:00Z',price:2};
  const ticks = [old, recent, {t:'2026-11-12T12:00:00Z',price:3}, {t:'invalid',price:4}];
  assert.deepEqual(withinSpan([old], '1D', now), []);
  assert.deepEqual(withinSpan(ticks, '1H', now), [recent]);
  assert.deepEqual(withinSpan([old, recent], 'ALL', now), [old, recent]);
});
