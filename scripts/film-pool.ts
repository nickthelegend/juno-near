/** Moves mira's and oto's spare testnet NEAR (keeping 0.03 each for gas) to kai for the on-camera create. Keys read in code only. */
import { appendFileSync, readFileSync } from 'node:fs';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, type KeyPairString } from 'near-api-js';
const provider = new JsonRpcProvider({ url: process.env.FILM_RPC || 'https://near-testnet.drpc.org' });
const seed = JSON.parse(readFileSync('.near-credentials/seed.json', 'utf8'));
for (const who of ['mira', 'oto']) {
  const p = seed.players[who];
  const v = await provider.viewAccount({ accountId: p.id }) as unknown as { amount: string; storage_usage: number };
  const spare = BigInt(v.amount) - BigInt(v.storage_usage) * 10n ** 19n - 3n * 10n ** 22n;
  if (spare <= 0n) { console.log(who, 'nothing spare'); continue; }
  const a = new Account(p.id, provider, new KeyPairSigner(KeyPair.fromString(p.secretKey as KeyPairString)));
  const r = await a.signAndSendTransaction({ receiverId: 'kai.juno-awkorp.testnet', actions: [actions.transfer(spare)] }) as { transaction: { hash: string } };
  const line = { at: new Date().toISOString(), from: p.id, to: 'kai.juno-awkorp.testnet', yocto: spare.toString(), hash: r.transaction.hash };
  appendFileSync('deployments/film-v3-players.jsonl', JSON.stringify(line) + '\n'); console.log(JSON.stringify(line));
}
