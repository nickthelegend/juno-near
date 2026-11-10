/**
 * Prove the web app's browser-wallet call path on NEAR testnet, without a browser.
 *
 *   pnpm testnet:wallet-path            (JUNO_PLAYER=kai, JUNO_POST=sprout by default)
 *
 * A wallet's pop-up cannot be clicked from a script, so this runs the rest of
 * the path for real: the web app's own `packages/app/lib/browser-wallet.web.ts`
 * (NEAR Wallet Selector + its Meteor Wallet module, `stepActions`) and
 * `lib/tx-status.ts` (follow the hash to final, read any failure), with
 * `describeTxError` from `lib/chain.ts` for the message a person would see.
 *
 * The player's testnet key is put into Meteor Wallet's key store, the way a
 * sign-in leaves a key there, but in an in-memory localStorage. It is a
 * full-access key, so Meteor's module signs locally instead of opening its
 * pop-up; the call it signs and sends is the one the app hands the wallet. The
 * key is read from the gitignored `.near-credentials/seed.json` and is never
 * printed or written anywhere else.
 *
 * Three calls on a live post: buy 1 token (attached deposit from the live
 * `quote_buy`), sell it back (no deposit), and a buy that attaches 1 yocto,
 * which the contract refuses with ERR_PAYMENT. Each hash is followed to final;
 * the results go to `deployments/wallet-path-<date>.json`.
 */
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { KeyPair, type KeyPairString } from 'near-api-js';
import { balanceOf, market, quoteBuy } from '@juno/sdk';

// The browser globals Wallet Selector and Meteor's SDK read: an in-memory
// localStorage (never persisted), and `window` as the global object.
const memory = new Map<string, string>();
const storage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => void memory.set(key, String(value)),
  removeItem: (key: string) => void memory.delete(key),
  clear: () => memory.clear(),
  key: (index: number) => [...memory.keys()][index] ?? null,
  get length() {
    return memory.size;
  },
};
Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true, writable: true });
Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true, writable: true });
// Meteor's SDK logs freely (its sign-in even logs the new key pair), so its console output is dropped here
// and this script reports through `say`.
const say = (line: string) => process.stdout.write(`${line}\n`);
console.log = () => undefined;
console.warn = () => undefined;
console.info = () => undefined;

const factory = process.env.EXPO_PUBLIC_JUNO_FACTORY || process.env.JUNO_FACTORY_ACCOUNT || 'juno-awkorp.testnet';
process.env.EXPO_PUBLIC_JUNO_FACTORY = factory;
const playerName = process.env.JUNO_PLAYER || 'kai';
const post = `${process.env.JUNO_POST || 'sprout'}.${factory}`;
const credentials = process.env.JUNO_PLAYER_FILE || join(process.cwd(), '.near-credentials', 'seed.json');

const { BROWSER_WALLET, restoreWallet, sendWithWallet } = await import('../packages/app/lib/browser-wallet.web.ts');
const { confirmTx } = await import('../packages/app/lib/tx-status.ts');
const { describeTxError, explorer } = await import('../packages/app/lib/chain.ts');
type TxStep = import('../packages/app/lib/api.ts').TxStep;

if (!existsSync(credentials)) {
  process.stderr.write(`Setup required: a funded Juno player key file (${credentials}). Run pnpm testnet:seed, or set JUNO_PLAYER_FILE.\n`);
  process.exit(1);
}
const seed = JSON.parse(await readFile(credentials, 'utf8')) as { players?: Record<string, { id: string; secretKey: string }> };
const player = seed.players?.[playerName];
if (!player) {
  process.stderr.write(`Setup required: no player "${playerName}" in ${credentials}.\n`);
  process.exit(1);
}
const keyPair = KeyPair.fromString(player.secretKey as KeyPairString);

// What a Meteor sign-in leaves behind (see @meteorwallet/sdk requestSignIn), plus Wallet Selector's own record.
storage.setItem(
  'default_meteor_wallet_auth_key',
  JSON.stringify({ accountId: player.id, allKeys: [], signedInContract: { contract_id: factory, public_key: keyPair.getPublicKey().toString() } }),
);
storage.setItem(`_meteor_wallet${player.id}:testnet`, keyPair.toString());
storage.setItem('near-wallet-selector:selectedWalletId', JSON.stringify(BROWSER_WALLET.id));
storage.setItem('near-wallet-selector:contract', JSON.stringify({ contractId: factory, methodNames: [] }));

// What the app does on load for a returning visitor.
const restored = await restoreWallet();
if (restored !== player.id) throw new Error(`Wallet Selector restored ${restored ?? 'nothing'}, expected ${player.id}`);
say(`signed in through ${BROWSER_WALLET.name} (Wallet Selector) as ${restored}`);

const TGAS = 10n ** 12n;
const live = await market(post);
if (live.phase !== 'curve') throw new Error(`${post} is in phase ${live.phase}; pick a post whose curve is open (JUNO_POST).`);
const before = BigInt(await balanceOf(post, player.id));

type Row = { step: string; method: string; receiver: string; signer: string; depositYocto: string; hash: string; explorer: string; result: string };
const rows: Row[] = [];

async function run(name: string, step: TxStep, expectFailure = false) {
  const hash = await sendWithWallet(step);
  const failure = await confirmTx(hash, player!.id);
  const shown = failure ? describeTxError(failure).message : 'success';
  say(`${name}: ${step.methodName} on ${step.receiverId} -> ${hash} (${shown})`);
  rows.push({ step: name, method: step.methodName, receiver: step.receiverId, signer: player!.id, depositYocto: step.deposit, hash, explorer: explorer('tx', hash), result: shown });
  if (expectFailure !== !!failure) throw new Error(`${name}: expected ${expectFailure ? 'a contract refusal' : 'success'}, got ${shown}`);
}

// The same TxStep shapes the app builds in lib/api.ts (`buildSwap`): one function call on the post account.
const buy: TxStep = {
  label: 'Buy',
  receiverId: post,
  methodName: 'buy',
  args: { quantity: '1' },
  deposit: (await quoteBuy(post, 1n)).toString(),
  gas: (100n * TGAS).toString(),
};
await run('wallet_buy', buy);
await run('wallet_sell', { label: 'Sell', receiverId: post, methodName: 'sell', args: { quantity: '1' }, deposit: '0', gas: (80n * TGAS).toString() });
await run('wallet_buy_underpaid', { ...buy, deposit: '1' }, true);

const after = BigInt(await balanceOf(post, player.id));
say(`${post} balance for ${player.id}: ${before} before, ${after} after (bought 1, sold 1)`);

const date = new Date().toISOString().slice(0, 10);
const outPath = join(process.cwd(), 'deployments', `wallet-path-${date}.json`);
const previous = existsSync(outPath) ? (JSON.parse(await readFile(outPath, 'utf8')) as { runs: unknown[] }) : { runs: [] };
previous.runs.push({
  at: new Date().toISOString(),
  network: 'testnet',
  wallet: `${BROWSER_WALLET.name} via @near-wallet-selector 10.1.4 (local full-access key, no pop-up)`,
  code: ['packages/app/lib/browser-wallet.web.ts', 'packages/app/lib/wallet-actions.ts', 'packages/app/lib/tx-status.ts', 'packages/app/lib/chain.ts'],
  post,
  balanceBefore: before.toString(),
  balanceAfter: after.toString(),
  transactions: rows,
});
await writeFile(outPath, `${JSON.stringify(previous, null, 2)}\n`);
say(`evidence: ${outPath.replace(`${process.cwd()}/`, '')}`);
process.exit(0);
