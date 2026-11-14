/**
 * Other players in the filmed lifecycle: mira and oto bid, reveal and vote on testnet from their own seeded accounts.
 * usage: tsx scripts/film-players.ts <commit|reveal|vote|call> <post-account> <player> [amount maxPriceNEAR | yes|no | method jsonArgs]
 * Keys are read from .near-credentials/seed.json in code only. Salts persist in deployments/film-v3-player-salts.json
 * so a reveal matches its commit. Every hash is appended to deployments/film-v3-players.jsonl.
 */
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, type KeyPairString } from 'near-api-js';
import { base64, commitment, YOCTO } from '@juno/sdk';
const [cmd, post, who, a, b] = process.argv.slice(2);
const seed = JSON.parse(readFileSync('.near-credentials/seed.json', 'utf8'));
const player = seed.players[who];
if (!player || !post?.endsWith('.juno-awkorp.testnet')) throw Error('usage: <commit|reveal|vote> <post> <mira|oto|kai> ...');
const provider = new JsonRpcProvider({ url: process.env.FILM_RPC || 'https://near-testnet.drpc.org' });
const acct = new Account(player.id, provider, new KeyPairSigner(KeyPair.fromString(player.secretKey as KeyPairString)));
const saltsFile = 'deployments/film-v3-player-salts.json';
const salts = existsSync(saltsFile) ? JSON.parse(readFileSync(saltsFile, 'utf8')) : {};
const TGAS = 10n ** 12n;
let method = '', args: Record<string, unknown> = {}, deposit = 0n;
if (cmd === 'commit') {
  const units = BigInt(a!); const price = BigInt(Math.round(Number(b) * 1e8)) * (YOCTO / 100_000_000n);
  const salt = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  salts[`${post}:${player.id}`] = { amount: units.toString(), maxPrice: price.toString(), salt };
  writeFileSync(saltsFile, JSON.stringify(salts, null, 2) + '\n');
  method = 'commit'; args = { commitment: base64(commitment(player.id, units, price, salt)) }; deposit = YOCTO;
} else if (cmd === 'reveal') {
  const s = salts[`${post}:${player.id}`]; if (!s) throw Error('no saved salt');
  method = 'reveal'; args = { amount: s.amount, max_price: s.maxPrice, salt: s.salt };
} else if (cmd === 'vote') {
  method = 'vote_proof'; args = { accepted: a !== 'no' };
} else if (cmd === 'buy') {
  // Another player piling in on the curve: pays exactly the contract's own quote.
  const q = await provider.callFunction({ contractId: post, method: 'quote_buy', args: { quantity: a } }) as string;
  method = 'buy'; args = { quantity: a }; deposit = BigInt(q);
} else if (cmd === 'call') {
  // Zero-deposit post calls used to recycle test funds between takes: sell, redeem, claim_refund, claim_dare.
  if (!['sell', 'redeem', 'claim_refund', 'claim_dare', 'withdraw_earnings', 'submit_proof', 'vote_proof', 'finalize_dare'].includes(a!)) throw Error('call allows sell, redeem, claim_refund, claim_dare, withdraw_earnings');
  method = a!; args = b ? JSON.parse(b) : {};
} else throw Error('unknown command');
const r = await acct.signAndSendTransaction({ receiverId: post, actions: [actions.functionCall(method, args, (['buy', 'redeem', 'withdraw_earnings', 'claim_refund', 'claim_dare'].includes(method) ? 30n : method === 'commit' ? 20n : 120n) * TGAS, deposit)] }) as { transaction: { hash: string }; status: Record<string, unknown> };
const failed = 'Failure' in (r.status ?? {});
const line = { at: new Date().toISOString(), player: player.id, post, method, hash: r.transaction.hash, ok: !failed };
appendFileSync('deployments/film-v3-players.jsonl', JSON.stringify(line) + '\n');
console.log(JSON.stringify(line));
