import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { view } from '../src/index.ts';

test('RPC preserves missing-account and contract error detail behind Server error', async () => {
  let error: object = { message: 'Server error', cause: { name: 'UNKNOWN_ACCOUNT' }, data: 'account missing.testnet does not exist while viewing' };
  const server = createServer((_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ jsonrpc: '2.0', error }));
  });
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    const endpoint = `http://127.0.0.1:${address.port}`;
    await assert.rejects(view('missing.testnet', 'market', {}, endpoint), /UNKNOWN_ACCOUNT.*does not exist/);
    error = { message: 'Server error', data: 'Smart contract panicked: ERR_CURVE_CLOSED' };
    await assert.rejects(view('post.testnet', 'buy', {}, endpoint), /ERR_CURVE_CLOSED/);
  } finally {
    await new Promise<void>((resolve, reject) => server.close(e => e ? reject(e) : resolve()));
  }
});
