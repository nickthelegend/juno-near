/**
 * Tops up the testnet QA players for the filmed lifecycle (create, sealed bids, dare, graduation).
 * Sources are the dropped Engyē testnet accounts already used as Juno's funder (JUNO_FUNDER_FILE lineage).
 * Keys are read in code only and never printed. Writes deployments/film-v3-funding-2026-11-13.json.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, type KeyPairString } from 'near-api-js';
const RPC = process.env.FILM_RPC || 'https://near-testnet.drpc.org';
const provider = new JsonRpcProvider({ url: RPC });
const dir = join(process.cwd(), '../engye/.near-credentials');
const keys = new Map<string, string>();
function walk(o: unknown) {
  if (Array.isArray(o)) o.forEach(walk);
  else if (o && typeof o === 'object') {
    const r = o as Record<string, unknown>;
    if (typeof r.id === 'string' && typeof r.key === 'string') keys.set(r.id, r.key);
    Object.values(r).forEach(walk);
  }
}
for (const f of readdirSync(dir).filter((n) => n.endsWith('.json'))) walk(JSON.parse(readFileSync(join(dir, f), 'utf8')));
const N = (x: number) => BigInt(Math.round(x * 1e6)) * 10n ** 18n;
// Round 1 (Nov 13, 15:4x UTC) moved 8.9 NEAR from the non-contract accounts. Round 2 (FILM_FUND_ROUND=2) tops up
// kai from the dropped Engyē v3 account's free balance for the crisp re-record after an RPC-dropped bid.
const plan: [string, string, number][] = process.env.FILM_FUND_ROUND === '2'
  ? [['engye-v3-8c5cc3a8.testnet', 'kai.juno-awkorp.testnet', 4.5]]
  : [
  ['maker-28dadc38.engye-59539fdb42.testnet', 'kai.juno-awkorp.testnet', 3.25],
  ['engye-open-df599f7f.testnet', 'kai.juno-awkorp.testnet', 1.85],
  ['engye-5d3dc3dd57.testnet', 'kai.juno-awkorp.testnet', 0.95],
  ['engye-4f18d8544b.testnet', 'kai.juno-awkorp.testnet', 0.8],
  ['engye-90efb5817e.testnet', 'kai.juno-awkorp.testnet', 0.7],
  ['maker.engye-v3-8c5cc3a8.testnet', 'mira.juno-awkorp.testnet', 0.4],
];
const out: unknown[] = [];
for (const [from, to, amount] of plan) {
  const key = keys.get(from);
  if (!key) { console.log(`skip ${from}: no key file entry`); continue; }
  const acct = new Account(from, provider, new KeyPairSigner(KeyPair.fromString(key as KeyPairString)));
  try {
    const r = await acct.signAndSendTransaction({ receiverId: to, actions: [actions.transfer(N(amount))] });
    const hash = (r as { transaction: { hash: string } }).transaction.hash;
    console.log(`${from} -> ${to} ${amount} NEAR ${hash}`);
    out.push({ from, to, amountNEAR: amount, hash, explorer: `https://testnet.nearblocks.io/txns/${hash}` });
  } catch (e) { console.log(`FAILED ${from}: ${String((e as Error).message).replace(/ed25519:[1-9A-HJ-NP-Za-km-z]+/g, '[redacted]').slice(0, 200)}`); }
}
writeFileSync(process.env.FILM_FUND_ROUND === '2' ? 'deployments/film-v4-funding-2026-11-13.json' : 'deployments/film-v3-funding-2026-11-13.json', JSON.stringify({ network: 'testnet', purpose: 'Film v3 live lifecycle: create post, sealed bids, dare, graduation', at: new Date().toISOString(), transfers: out }, null, 2) + '\n');
