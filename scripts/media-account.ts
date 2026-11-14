/**
 * Creates media.<factory>: a locked account (no access keys) whose only contract method is a no-op `fs_store`.
 * The app stores a photo on NEAR by calling `fs_store` there with the image bytes as the call's arguments;
 * NEARFS indexes those bytes and serves them by CID at ipfs.web4.testnet.page, so the post's media URL points
 * at data that lives in a NEAR transaction. The call succeeds (instead of failing on an account with no code),
 * so the explorer shows a normal, successful transaction.
 * usage: tsx scripts/media-account.ts   (root key read from .near-credentials/seed.json in code only)
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, type KeyPairString } from 'near-api-js';
// (module (type (func)) (func $fs_store (type 0)) (export "fs_store" (func $fs_store)))
export const NOOP_WASM = Uint8Array.from([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
  0x03, 0x02, 0x01, 0x00,
  0x07, 0x0c, 0x01, 0x08, ...Buffer.from('fs_store'), 0x00, 0x00,
  0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b,
]);
const seed = JSON.parse(readFileSync('.near-credentials/seed.json', 'utf8'));
const root = new Account(seed.root.id, new JsonRpcProvider({ url: 'https://test.rpc.fastnear.com' }), new KeyPairSigner(KeyPair.fromString(seed.root.secretKey as KeyPairString)));
const id = `media.${seed.root.id}`;
const r = await root.signAndSendTransaction({ receiverId: id, actions: [actions.createAccount(), actions.transfer(2n * 10n ** 22n), actions.deployContract(NOOP_WASM)] }) as { transaction: { hash: string }; status: Record<string, unknown> };
const line = { at: new Date().toISOString(), account: id, hash: r.transaction.hash, ok: !('Failure' in (r.status ?? {})), note: 'locked media account: no-op fs_store for NEARFS photo storage' };
appendFileSync('deployments/film-v9-2026-11-14.jsonl', JSON.stringify(line) + '\n');
console.log(JSON.stringify(line));
