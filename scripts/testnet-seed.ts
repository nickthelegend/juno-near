/**
 * Live NEAR testnet seed: a fresh Juno factory with real posts, auctions,
 * curve trades, a floor redemption, a graduation and a dare.
 *
 *   pnpm testnet:seed
 *
 * Funding comes from a funded testnet account file given by
 * JUNO_FUNDER_FILE (default: ../engye/.near-credentials/accounts-v2-parent.json).
 * It is read here only; no key is printed or written anywhere else. The first
 * entry of that file is another project's contract and is never touched.
 *
 * 1. `create_account` on the `testnet` registrar makes juno-<random>.testnet
 *    with 10 NEAR; more is transferred in only as far as the plan needs.
 * 2. Three player sub-accounts (mira, kai, oto) are created and funded.
 * 3. The factory is deployed, then posts are launched in waves: each runs its
 *    one-minute sealed-bid auction, a minute of reveals, settlement, refunds
 *    and curve trades. One post graduates, one holder redeems against the
 *    floor, one post carries a dare with a bond and a proof vote.
 *
 * Every step is idempotent (checked against chain state), keys live in the
 * gitignored .near-credentials/, and every transaction hash is appended to
 * deployments/testnet-<date>.json as it lands.
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, type Action, type KeyPairString } from 'near-api-js';
import { accountBalance, base64, commitment, market, TESTNET_RPC, view, YOCTO, type Market } from '@juno/sdk';
import { allowedDelegate } from '../packages/relayer/src/policy.ts';

if (existsSync('.env')) process.loadEnvFile('.env');
const rpc = process.env.NEAR_TESTNET_RPC_URL || TESTNET_RPC;
const provider = new JsonRpcProvider({ url: rpc });
const credDir = join(process.cwd(), '.near-credentials');
const statePath = join(credDir, 'seed.json');
const funderFile = process.env.JUNO_FUNDER_FILE || join(process.cwd(), '../engye/.near-credentials/accounts-v2-parent.json');
const wasmPath = join(process.cwd(), 'packages/contract/target/near/juno_market.wasm');
const TGAS = 10n ** 12n;
const N = (x: number) => BigInt(Math.round(x * 1000)) * (YOCTO / 1000n);
const fmt = (y: bigint) => (Number(y / 10n ** 21n) / 1000).toFixed(3);

type Signer = { id: string; secretKey: string };
type State = { root?: Signer; players: Record<string, Signer>; salts: Record<string, string>; done?: string[] };
type Tx = { step: string; signer: string; receiver: string; hash: string; explorer: string };

const date = new Date().toISOString().slice(0, 10);
const outPath = join(process.cwd(), 'deployments', `testnet-${date}.json`);
let evidence: { network: string; rpc: string; factory?: string; players?: string[]; posts: string[]; transactions: Tx[]; createdAt: string; status: string } = existsSync(outPath)
  ? JSON.parse(await readFile(outPath, 'utf8'))
  : { network: 'testnet', rpc, posts: [], transactions: [], createdAt: new Date().toISOString(), status: 'in_progress' };
if (!evidence.transactions) evidence = { network: 'testnet', rpc, posts: [], transactions: [], createdAt: new Date().toISOString(), status: 'in_progress' };

await mkdir(credDir, { recursive: true, mode: 0o700 });
const state: State = existsSync(statePath) ? JSON.parse(await readFile(statePath, 'utf8')) : { players: {}, salts: {} };
const saveState = () => writeFile(statePath, JSON.stringify(state), { mode: 0o600 });
const saveEvidence = async () => {
  await mkdir(join(process.cwd(), 'deployments'), { recursive: true });
  await writeFile(outPath, JSON.stringify(evidence, null, 2) + '\n');
};

function account(s: Signer) {
  return new Account(s.id, provider, new KeyPairSigner(KeyPair.fromString(s.secretKey as KeyPairString)));
}
async function exists(id: string): Promise<boolean> {
  try {
    await provider.query({ request_type: 'view_account', finality: 'final', account_id: id });
    return true;
  } catch (e) {
    if (/does not exist|UNKNOWN_ACCOUNT/i.test(String(e))) return false;
    throw e;
  }
}
async function send(s: Signer, receiver: string, step: string, list: Action[]): Promise<unknown> {
  const result = (await account(s).signAndSendTransaction({ receiverId: receiver, actions: list, waitUntil: 'FINAL', throwOnFailure: false })) as any;
  const hash = result.transaction.hash as string;
  const failure = result.status?.Failure ?? result.receipts_outcome?.map((r: any) => r.outcome.status?.Failure).find(Boolean);
  evidence.transactions.push({ step, signer: s.id, receiver, hash, explorer: `https://testnet.nearblocks.io/txns/${hash}` });
  await saveEvidence();
  if (failure) throw Error(`${step} failed on testnet (${hash}): ${JSON.stringify(failure).slice(0, 400)}`);
  console.log(`✓ ${step.padEnd(34)} ${hash}`);
  if (result.status?.SuccessValue) {
    const bytes = Buffer.from(result.status.SuccessValue, 'base64');
    if (bytes.length) return JSON.parse(bytes.toString('utf8'));
  }
  return undefined;
}
const fc = (method: string, args: object, deposit = 0n, gas = 100n * TGAS) => actions.functionCall(method, args, gas, deposit);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function waitFor(token: string, ok: (m: Market) => boolean, what: string): Promise<Market> {
  let last: Market | undefined;
  for (let i = 0; i < 60; i++) {
    try {
      last = await market(token, rpc);
      if (ok(last)) return last;
    } catch {
      /* not yet initialised */
    }
    await sleep(2000);
  }
  throw Error(`${token} did not reach ${what}; last phase ${last?.phase ?? 'unreadable'}`);
}

/* ---------------- funding ---------------- */

const funderRaw = JSON.parse(await readFile(funderFile, 'utf8')) as { accounts: Array<{ id: string; key: string }> };
// Entry 0 is another project's live contract: never spend from it.
const funders: Signer[] = funderRaw.accounts.slice(1).map((a) => ({ id: a.id, secretKey: a.key }));
const KEEP = N(1.0);

async function fundFrom(target: string, amount: bigint, step: string) {
  let left = amount;
  for (const f of funders) {
    if (left <= 0n) break;
    const spendable = (await accountBalance(f.id, rpc)) - KEEP;
    if (spendable <= N(0.2)) continue;
    const take = spendable < left ? spendable : left;
    await send(f, target, `${step}_from_${f.id.split('.')[0]}`, [actions.transfer(take)]);
    left -= take;
  }
  if (left > 0n) throw Error(`BLOCKED: funders are short by ${fmt(left)} NEAR for ${target}. Fund ${funders.map((f) => f.id).join(', ')} or set JUNO_FUNDER_FILE.`);
}

if (!state.root) {
  const id = `juno-${Math.random().toString(36).slice(2, 8)}.testnet`;
  const key = KeyPair.fromRandom('ed25519');
  state.root = { id, secretKey: key.toString() };
  await saveState();
}
const root = state.root!;
if (!(await exists(root.id))) {
  const creator = funders[0]!;
  await send(creator, 'testnet', 'registrar_create_account', [
    fc('create_account', { new_account_id: root.id, new_public_key: KeyPair.fromString(root.secretKey as KeyPairString).getPublicKey().toString() }, N(8), 100n * TGAS),
  ]);
  for (let i = 0; i < 20 && !(await exists(root.id)); i++) await sleep(1000);
  if (!(await exists(root.id))) throw Error(`registrar call landed but ${root.id} is not on chain`);
}
evidence.factory = root.id;

// What each player needs, in NEAR: posts at 3 each (+ dare bond), one live 1 NEAR escrow, trades, margin.
const PLAYERS: Record<string, number> = { mira: 7.1, kai: 8.2, oto: 4.6 };
const FACTORY_NEED = 5.4;
const factoryReady = await view<boolean>(root.id, 'code_ready', {}, rpc).catch(() => false);
let rootNeed = factoryReady ? 0n : N(FACTORY_NEED);
for (const [name, need] of Object.entries(PLAYERS)) {
  const id = `${name}.${root.id}`;
  if (!(await exists(id))) rootNeed += N(need);
}
const rootHas = await accountBalance(root.id, rpc);
if (rootNeed > 0n && rootHas < rootNeed) await fundFrom(root.id, rootNeed - rootHas, 'top_up_root');

for (const [name, need] of Object.entries(PLAYERS)) {
  const id = `${name}.${root.id}`;
  if (!state.players[name]) {
    state.players[name] = { id, secretKey: KeyPair.fromRandom('ed25519').toString() };
    await saveState();
  }
  if (!(await exists(id))) {
    const pk = KeyPair.fromString(state.players[name]!.secretKey as KeyPairString).getPublicKey();
    await send(root, id, `create_player_${name}`, [actions.createAccount(), actions.transfer(N(need)), actions.addFullAccessKey(pk)]);
  }
}
const P = state.players as Record<'mira' | 'kai' | 'oto', Signer>;
evidence.players = Object.values(P).map((p) => p.id);
await saveEvidence();

/* ---------------- factory ---------------- */

const wasm = await readFile(wasmPath);
const ready = await view<boolean>(root.id, 'code_ready', {}, rpc).catch(() => false);
if (!ready) {
  const code = (await provider.query({ request_type: 'view_account', finality: 'final', account_id: root.id })) as any;
  if (code.code_hash === '11111111111111111111111111111111') {
    await send(root, root.id, 'deploy_factory', [actions.deployContract(wasm), fc('init_factory', {}, 0n, 30n * TGAS)]);
  }
  await send(root, root.id, 'upload_token_code', [fc('upload_code', { code: wasm.toString('base64') }, 0n, 250n * TGAS)]);
}

/* ---------------- posts ---------------- */

type PostPlan = {
  slug: string;
  creator: 'mira' | 'kai' | 'oto';
  caption: string;
  art: string;
  dare?: string;
  bond?: number;
  bids: Array<{ who: 'mira' | 'kai' | 'oto'; amount: bigint; price: bigint; relayed?: boolean }>;
  after: (token: string) => Promise<void>;
};

const price = (nearEach: number) => BigInt(Math.round(nearEach * 1e6)) * (YOCTO / 1_000_000n);
async function buy(who: 'mira' | 'kai' | 'oto', token: string, quantity: bigint, step: string) {
  const quote = BigInt(await view<string>(token, 'quote_buy', { quantity: quantity.toString() }, rpc));
  await send(P[who], token, step, [fc('buy', { quantity: quantity.toString() }, quote, 120n * TGAS)]);
}

const WAVES: PostPlan[][] = [
  [
    {
      slug: 'sprout',
      creator: 'mira',
      caption: 'Posted a photo, it grew a coin. First Juno post on NEAR.',
      art: '/art/juno-feature-1.webp',
      bids: [
        { who: 'kai', amount: 50n, price: price(0.0005) },
        { who: 'oto', amount: 75n, price: price(0.0004) },
      ],
      after: async (t) => {
        await buy('oto', t, 25n, 'sprout_buy_25');
        await buy('mira', t, 10n, 'sprout_buy_10');
        await send(P.oto, t, 'sprout_sell_5', [fc('sell', { quantity: '5' }, 0n, 100n * TGAS)]);
      },
    },
    {
      slug: 'pile-in',
      creator: 'kai',
      caption: 'Everyone threw a coin at the same photo. It sold out.',
      art: '/art/juno-feature-2.webp',
      bids: [
        { who: 'mira', amount: 60n, price: price(0.0006) },
        { who: 'oto', amount: 40n, price: price(0.0005) },
      ],
      after: async (t) => {
        await buy('kai', t, 800n, 'pile_in_buy_800_graduate');
        await waitFor(t, (m) => m.graduated, 'graduation');
        await send(P.mira, t, 'pile_in_redeem_20_floor', [fc('redeem', { quantity: '20' }, 0n, 80n * TGAS)]);
      },
    },
  ],
  [
    {
      slug: 'cap-toss',
      creator: 'oto',
      caption: 'Dare: a graduation photo from the roof before Friday. 0.5 NEAR says I do it.',
      art: '/art/juno-feature-3.webp',
      dare: 'Post a graduation photo from the roof before Friday',
      bond: 0.5,
      bids: [
        { who: 'mira', amount: 40n, price: price(0.0005) },
        { who: 'kai', amount: 60n, price: price(0.0005) },
      ],
      after: async (t) => {
        await buy('kai', t, 40n, 'cap_toss_buy_40');
        await send(P.oto, t, 'cap_toss_submit_proof', [fc('submit_proof', { proof: '/art/juno-onboard-2.webp' }, 0n, 50n * TGAS)]);
        await send(P.kai, t, 'cap_toss_vote_yes', [fc('vote_proof', { accepted: true }, 0n, 50n * TGAS)]);
      },
    },
    {
      slug: 'balloons',
      creator: 'mira',
      caption: 'Every post floats up on its own curve.',
      art: '/art/juno-social-square.webp',
      bids: [
        { who: 'oto', amount: 50n, price: price(0.0004) },
      ],
      after: async (t) => {
        await buy('mira', t, 60n, 'balloons_buy_60');
        await buy('kai', t, 30n, 'balloons_buy_30');
      },
    },
  ],
];

async function runWave(wave: PostPlan[]) {
  const tokens: Array<{ plan: PostPlan; token: string; m: Market }> = [];
  for (const plan of wave) {
    const token = `${plan.slug}.${root.id}`;
    if (!(await exists(token))) {
      const bond = N(plan.bond ?? 0);
      await send(P[plan.creator], root.id, `create_post_${plan.slug}`, [
        fc('create_post', { slug: plan.slug, caption: plan.caption, media_url: plan.art, dare: plan.dare ?? '', dare_bond: bond.toString() }, N(3) + bond, 150n * TGAS),
      ]);
    }
    if (!evidence.posts.includes(token)) evidence.posts.push(token);
    tokens.push({ plan, token, m: await waitFor(token, () => true, 'initialised') });
  }
  for (const { plan, token, m } of tokens) {
    if (m.phase !== 'commit') continue;
    for (const bid of plan.bids) {
      const key = `${token}:${bid.who}`;
      state.salts[key] ??= crypto.randomUUID();
      await saveState();
      const commitAction = fc('commit', { commitment: base64(commitment(P[bid.who].id, bid.amount, bid.price, state.salts[key]!)) }, YOCTO, 30n * TGAS);
      if (bid.relayed) {
        // NEP-366: the player signs a delegate action; the Juno root relays it and pays the gas.
        const { signedDelegate } = await account(P[bid.who]).createSignedMetaTransaction({ receiverId: token, actions: [commitAction], blockHeightTtl: 120 });
        if (!allowedDelegate(signedDelegate, root.id, new Set([P[bid.who].id]))) throw Error('relayer policy refused a valid sealed bid');
        const result = (await account(root).relayMetaTransaction(signedDelegate)) as any;
        const hash = result.transaction.hash as string;
        evidence.transactions.push({ step: `${plan.slug}_nep366_sealed_bid_${bid.who}_relayed_by_root`, signer: root.id, receiver: P[bid.who].id, hash, explorer: `https://testnet.nearblocks.io/txns/${hash}` });
        await saveEvidence();
        const failure = result.status?.Failure ?? result.receipts_outcome?.map((r: any) => r.outcome.status?.Failure).find(Boolean);
        if (failure) throw Error(`NEP-366 relay failed (${hash}): ${JSON.stringify(failure).slice(0, 300)}`);
        console.log(`✓ ${(plan.slug + '_nep366_bid_' + bid.who).padEnd(34)} ${hash}`);
        continue;
      }
      await send(P[bid.who], token, `${plan.slug}_sealed_bid_${bid.who}`, [commitAction]);
    }
  }
  const commitEnd = Math.max(...tokens.map((t) => t.m.commit_end_ms));
  const revealEnd = Math.min(...tokens.map((t) => t.m.reveal_end_ms));
  if (Date.now() < commitEnd + 3000) await sleep(commitEnd + 3000 - Date.now());
  if (Date.now() < revealEnd - 5000) {
    for (const { plan, token } of tokens) {
      for (const bid of plan.bids) {
        const salt = state.salts[`${token}:${bid.who}`];
        if (!salt) continue;
        await send(P[bid.who], token, `${plan.slug}_reveal_${bid.who}`, [
          fc('reveal', { amount: bid.amount.toString(), max_price: bid.price.toString(), salt }, 0n, 30n * TGAS),
        ]);
      }
    }
  }
  const settleAt = Math.max(...tokens.map((t) => t.m.reveal_end_ms));
  if (Date.now() < settleAt + 3000) await sleep(settleAt + 3000 - Date.now());
  for (const { plan, token } of tokens) {
    const m = await market(token, rpc);
    if (m.phase === 'settle') await send(P[plan.creator], token, `${plan.slug}_settle`, [fc('settle', {}, 0n, 150n * TGAS)]);
    await waitFor(token, (x) => x.phase === 'curve' || x.phase === 'graduated', 'curve');
    for (const bid of plan.bids) {
      const placed = evidence.transactions.some((t) => t.step.startsWith(`${plan.slug}_`) && t.step.includes(`bid_${bid.who}`));
      const refunded = evidence.transactions.some((t) => t.step === `${plan.slug}_refund_${bid.who}`);
      if (placed && !refunded) await send(P[bid.who], token, `${plan.slug}_refund_${bid.who}`, [fc('claim_refund', {}, 0n, 50n * TGAS)]);
    }
    await plan.after(token);
    state.done = [...(state.done ?? []), plan.slug];
    await saveState();
  }
}

const waveArg = process.argv.indexOf('--wave');
const waves = waveArg > 0 ? [Number(process.argv[waveArg + 1]) - 1] : WAVES.map((_, i) => i);
for (const index of waves) {
  const wave = WAVES[index]!.filter((p) => !(state.done ?? []).includes(p.slug));
  if (wave.length) await runWave(wave);
}

if (process.argv.includes('--finalize-dare')) {
  const token = `cap-toss.${root.id}`;
  const m = await market(token, rpc);
  if (m.dare && !m.dare_finalized && Date.now() > m.commit_end_ms - 60_000 + 300_000) {
    await send(P.oto, token, 'cap_toss_finalize_dare', [fc('finalize_dare', {}, 0n, 50n * TGAS)]);
  }
}

evidence.status = 'complete';
await saveEvidence();
const summary = await Promise.all(evidence.posts.map(async (p) => {
  const m = await market(p, rpc);
  return { post: p, phase: m.phase, supply: m.total_supply, floor_vault: m.floor_vault, sealed_bids: m.sealed_bid_count, graduated: m.graduated };
}));
console.log(JSON.stringify({ factory: root.id, players: evidence.players, posts: summary, transactions: evidence.transactions.length, evidence: outPath.replace(process.cwd() + '/', '') }, null, 2));
