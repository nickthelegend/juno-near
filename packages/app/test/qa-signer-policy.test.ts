import test from 'node:test';
import assert from 'node:assert/strict';
import { QA_BUDGET, reserveQaBudget, testnetAccount, testnetRpc, validateQaTransaction } from '../lib/qa-signer-policy';
const factory = 'juno-awkorp.testnet', account = `kai.${factory}`;
const tx = () => ({receiverId:`sprout.${factory}`, actions:[{type:'FunctionCall',params:{methodName:'buy',args:{quantity:'2'},gas:'100000000000000',deposit:'1000000000000000000000'}}]});
test('QA signer rejects mainnet, implicit, malformed and deceptive RPC inputs', () => {
  for (const id of ['kai.near','a'.repeat(64),'INVALID.testnet','a..testnet']) assert.throws(()=>testnetAccount(id));
  testnetAccount(account);
  for (const rpc of ['https://rpc.mainnet.near.org','https://near-testnet.drpc.org.evil.example','http://near-testnet.drpc.org','https://near-testnet.drpc.org/?mainnet=1']) assert.throws(()=>testnetRpc(rpc));
  assert.equal(testnetRpc('https://near-testnet.drpc.org/'),'https://near-testnet.drpc.org');
});
test('QA signer only accepts a single permitted function call in its factory', () => {
  assert.equal(validateQaTransaction(tx(), account, factory).methodName,'buy');
  assert.throws(()=>validateQaTransaction({...tx(),signerId:'someone.testnet'},account,factory));
  assert.throws(()=>validateQaTransaction({...tx(),receiverId:'other.testnet'},account,factory));
  assert.throws(()=>validateQaTransaction({...tx(),actions:[{type:'Transfer'}]},account,factory));
  assert.throws(()=>validateQaTransaction({...tx(),actions:[]},account,factory));
  const expensive=tx();expensive.actions[0].params.deposit=(QA_BUDGET+1n).toString();assert.throws(()=>validateQaTransaction(expensive,account,factory));
});
test('one shared budget reserves deposits plus three times the maximum gas charge', () => {
  const price=100000000n, gas=100000000000000n, deposit=1000000000000000000000n;
  const first=reserveQaBudget(0n,deposit,gas,price);
  assert.equal(first,deposit+gas*price*3n);
  assert.throws(()=>reserveQaBudget(QA_BUDGET-first+1n,deposit,gas,price),/0.3/);
  assert.throws(()=>reserveQaBudget(0n,0n,gas,-1n));
});
test('QA signer stores a photo only as bytes to the media account, with no deposit', () => {
  const store = (receiverId: string, args: unknown, deposit = '0') => ({ receiverId, actions: [{ type: 'FunctionCall', params: { methodName: 'fs_store', args, gas: '5000000000000', deposit } }] });
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
  assert.equal(validateQaTransaction(store(`media.${factory}`, jpeg), account, factory).methodName, 'fs_store');
  assert.throws(() => validateQaTransaction(store(`sprout.${factory}`, jpeg), account, factory));
  assert.throws(() => validateQaTransaction(store(`media.${factory}`, jpeg, '1'), account, factory));
  assert.throws(() => validateQaTransaction(store(`media.${factory}`, { a: 1 }), account, factory));
  assert.throws(() => validateQaTransaction(store(`media.${factory}`, new Uint8Array(250_001)), account, factory));
  const bytesToBuy = tx(); (bytesToBuy.actions[0].params as { args: unknown }).args = jpeg; assert.throws(() => validateQaTransaction(bytesToBuy, account, factory));
});
