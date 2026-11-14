/** Probe: store a few bytes on NEARFS (testnet) from kai with an fs_store call, then print the CID and tx hash. Key read in code only. */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, type KeyPairString } from 'near-api-js';
const file = process.argv[2]; const bytes = readFileSync(file);
const b32 = (buf: Uint8Array) => { const A = 'abcdefghijklmnopqrstuvwxyz234567'; let bits = 0, v = 0, o = ''; for (const x of buf) { v = (v << 8) | x; bits += 8; while (bits >= 5) { o += A[(v >>> (bits - 5)) & 31]; bits -= 5; } } if (bits) o += A[(v << (5 - bits)) & 31]; return o; };
const cid = 'b' + b32(Buffer.concat([Buffer.from([0x01, 0x55, 0x12, 0x20]), createHash('sha256').update(bytes).digest()]));
const seed = JSON.parse(readFileSync('.near-credentials/seed.json', 'utf8')); const p = seed.players.kai;
const provider = new JsonRpcProvider({ url: 'https://test.rpc.fastnear.com' });
const acct = new Account(p.id, provider, new KeyPairSigner(KeyPair.fromString(p.secretKey as KeyPairString)));
try {
  const r = await acct.signAndSendTransaction({ receiverId: process.argv[3] || p.id, actions: [actions.functionCall('fs_store', bytes, 30n * 10n ** 12n, 0n)] }) as { transaction: { hash: string } };
  console.log(JSON.stringify({ cid, hash: r.transaction.hash }));
} catch (e) { console.log(JSON.stringify({ cid, error: String((e as Error).message).slice(0, 300) })); }
