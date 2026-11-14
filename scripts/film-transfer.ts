/** Moves a small amount of testnet NEAR between Juno's own film accounts. usage: tsx scripts/film-transfer.ts <from> <to> <NEAR>  (keys read from .near-credentials/seed.json in code only; appends the hash to deployments/film-v8-transfers.jsonl) */
import { appendFileSync, readFileSync } from 'node:fs';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, type KeyPairString } from 'near-api-js';
const [from, to, amt] = process.argv.slice(2);
const seed = JSON.parse(readFileSync('.near-credentials/seed.json', 'utf8'));
const p = seed.players[from!]; const dest = seed.players[to!];
if (!p || !dest) throw Error('usage: <kai|mira|oto> <kai|mira|oto> <NEAR>');
const acct = new Account(p.id, new JsonRpcProvider({ url: 'https://near-testnet.drpc.org' }), new KeyPairSigner(KeyPair.fromString(p.secretKey as KeyPairString)));
const r = await acct.signAndSendTransaction({ receiverId: dest.id, actions: [actions.transfer(BigInt(Math.round(Number(amt) * 1e6)) * 10n ** 18n)] });
const hash = r.transaction.hash; console.log(hash);
appendFileSync('deployments/film-v8-transfers.jsonl', JSON.stringify({ at: new Date().toISOString(), from: p.id, to: dest.id, amountNEAR: Number(amt), hash }) + '\n');
