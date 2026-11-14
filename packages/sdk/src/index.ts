import { sha256 } from '@noble/hashes/sha256';

export const TESTNET_RPC = 'https://test.rpc.fastnear.com';
export const ONECLICK = 'https://1click.chaindefuser.com/v0';
export const YOCTO = 10n ** 24n;
export const BASE = YOCTO / 10_000n;
const WAD = 10n ** 18n;
const WEIGHTS = [1000000n,1200000n,1440000n,1728000n,2073600n,2488320n,2985984n,3583181n,4299817n,5159780n,6191736n,7430084n,8916100n,10699321n,12839185n,15407022n];
const WEIGHT_SUM = 87442130n;
export type Market = {
  slug: string; creator: string; caption: string; media_url: string;
  phase: 'commit'|'reveal'|'settle'|'curve'|'graduated';
  commit_end_ms: number; reveal_end_ms: number; sealed_bid_count: number; revealed_bid_count: number;
  clearing_price: string; total_supply: string; curve_sold: string; floor_vault: string;
  floor_per_token: string; curve_reserve: string; graduation_escrow: string;
  creator_earnings: string; graduated: boolean; dare: string; dare_bond: string; proof: string; dare_finalized: boolean;
};

function sqrt(x: bigint): bigint {
  if (x < 2n) return x;
  let r = 1n << BigInt((x.toString(2).length + 1) >> 1);
  while (true) { const next = (r + x / r) / 2n; if (next >= r) return r; r = next; }
}
function table(): {prices: bigint[]; sizes: bigint[]} {
  let root = 100n * WAD;
  for (let i=0;i<4;i++) root=sqrt(root*WAD);
  const prices=[BASE];
  for(let i=1;i<=16;i++) { const p=prices[i-1], rem=root%WAD; prices.push(p*(root/WAD)+(p/WAD)*rem+(p%WAD)*rem/WAD); }
  const sizes:bigint[]=[];
  let used=0n;
  for(let i=0;i<15;i++){const size=800n*WEIGHTS[i]/WEIGHT_SUM;sizes.push(size);used+=size;}
  sizes.push(800n-used);
  return {prices,sizes};
}
export function curveCost(sold: bigint, quantity: bigint, roundUp = true): bigint {
  if (quantity <= 0n || sold < 0n || sold + quantity > 800n) throw Error('ERR_QUANTITY');
  const {prices,sizes}=table();
  const from=sold, to=sold+quantity;
  let start=0n, total=0n;
  for(let k=0;k<16;k++){
    if(start>=to)break;
    const end=start+sizes[k];
    if(end>from && sizes[k]>0n){
      const lo=from>start?from:start, hi=to<end?to:end;
      const x=hi-lo, a=lo-start;
      const numerator=(prices[k+1]-prices[k])*x*(2n*a+x);
      const denominator=2n*sizes[k];
      total+=x*prices[k]+(roundUp?(numerator+denominator-1n)/denominator:numerator/denominator);
    }
    start=end;
  }
  return total;
}
export function buyQuote(sold: bigint, quantity: bigint, vault = 0n, supply = 0n): bigint {
  const curve = curveCost(sold, quantity);
  const floor = supply === 0n ? 0n : (vault * quantity + supply - 1n) / supply;
  const gross = curve > floor ? curve : floor;
  return gross + gross / 5n + gross / 100n;
}
export function floorPerToken(vault: bigint, supply: bigint): bigint {
  return supply === 0n ? 0n : vault / supply;
}
export function formatNear(yocto: bigint, precision = 4): string {
  const sign = yocto < 0n ? '-' : '';
  const a = yocto < 0n ? -yocto : yocto;
  const scale = 10n ** BigInt(precision);
  const fraction = (a % YOCTO) * scale / YOCTO;
  return `${sign}${a / YOCTO}.${fraction.toString().padStart(precision, '0')}`;
}
export function commitment(owner: string, amount: bigint, maxPrice: bigint, salt: string): Uint8Array {
  return sha256(new TextEncoder().encode(`juno:v1:${owner}:${amount}:${maxPrice}:${salt}`));
}
export function base64(bytes: Uint8Array): string {
  const B = (globalThis as {Buffer?: {from(b: Uint8Array): {toString(e: string): string}}}).Buffer;
  if (B) return B.from(bytes).toString('base64');
  return btoa(String.fromCharCode(...bytes));
}
/** NEARFS (IPFS over NEAR): a file stored as the arguments of an `fs_store` call is served by its CID here. */
export const NEARFS_GATEWAY = 'https://ipfs.web4.testnet.page/ipfs/';
/** NEARFS serves one raw block per file; larger files would need chunking, so Juno keeps photos under this. */
export const NEARFS_MAX_BYTES = 250_000;
/** CIDv1 of a raw block (codec 0x55, sha2-256), base32 lower: the address NEARFS gives the bytes of one `fs_store` call. */
export function nearfsCid(bytes: Uint8Array): string {
  const digest = sha256(bytes);
  const raw = new Uint8Array(4 + digest.length);
  raw.set([0x01, 0x55, 0x12, 0x20]); raw.set(digest, 4);
  const A = 'abcdefghijklmnopqrstuvwxyz234567';
  let bits = 0, value = 0, out = 'b';
  for (const byte of raw) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { out += A[(value >>> (bits - 5)) & 31]; bits -= 5; } value &= 0xff; }
  if (bits) out += A[(value << (5 - bits)) & 31];
  return out;
}
async function rpc(body: object, endpoint = TESTNET_RPC): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(endpoint, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({jsonrpc:'2.0', id:'juno', ...body}), signal: controller.signal });
    if (!response.ok) throw Error(`RPC HTTP ${response.status}`);
    const data = await response.json();
    if (data.error) {
      // NEAR puts UNKNOWN_ACCOUNT and contract panics behind the generic "Server error".
      const detail = typeof data.error.data === 'string' ? data.error.data : JSON.stringify(data.error.data ?? {});
      throw Error([data.error.cause?.name, data.error.message, detail].filter(Boolean).join(': '));
    }
    return data.result;
  } catch (error) {
    if (controller.signal.aborted) throw Error('NEAR testnet RPC timed out');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
export async function view<T>(account: string, method: string, args: object = {}, endpoint = TESTNET_RPC): Promise<T> {
  const result = await rpc({method:'query', params:{request_type:'call_function', finality:'final', account_id:account, method_name:method, args_base64:base64(new TextEncoder().encode(JSON.stringify(args)))}}, endpoint);
  return JSON.parse(new TextDecoder().decode(Uint8Array.from(result.result)));
}
export type Trade = { ms: number; kind: 'auction'|'buy'|'sell'|'redeem'; account: string; quantity: string; total: string; sold_after: string };
export const trades = (account: string, endpoint?: string) => view<Trade[]>(account, 'trades', {}, endpoint);
export const holders = (account: string, endpoint?: string) => view<Array<[string, string]>>(account, 'holders', {}, endpoint);
export const balanceOf = (token: string, accountId: string, endpoint?: string) => view<string>(token, 'ft_balance_of', {account_id: accountId}, endpoint);
export const quoteBuy = (token: string, quantity: bigint, endpoint?: string) => view<string>(token, 'quote_buy', {quantity: quantity.toString()}, endpoint).then(BigInt);
/** Marginal price of the next whole token on the curve, in yocto. */
export function spotPrice(sold: bigint): bigint { return sold >= 800n ? curveCost(799n, 1n) : curveCost(sold, 1n); }
/** What a sell of `quantity` pays out after the 1% fee, mirroring the contract (curve or floor, whichever is higher). */
export function sellQuote(sold: bigint, quantity: bigint, vault: bigint, supply: bigint): bigint {
  if (quantity <= 0n || quantity > sold || supply === 0n) throw Error('ERR_SELL');
  const gross = curveCost(sold - quantity, quantity, false);
  const floorGross = vault * quantity / supply;
  const actual = gross < floorGross ? floorGross : gross;
  return actual - actual / 100n;
}
/** What redeeming `quantity` against the floor pays (1% stays for remaining holders). */
export function redeemQuote(vault: bigint, supply: bigint, quantity: bigint): bigint {
  if (quantity <= 0n || supply === 0n) return 0n;
  const proRata = vault * quantity / supply;
  return proRata - proRata / 100n;
}
export async function accountBalance(accountId: string, endpoint = TESTNET_RPC): Promise<bigint> {
  const result = await rpc({method:'query', params:{request_type:'view_account', finality:'final', account_id:accountId}}, endpoint);
  return BigInt(result.amount);
}
export const posts = (factory: string, endpoint?: string) => view<string[]>(factory, 'posts', {}, endpoint);
export const market = (account: string, endpoint?: string) => view<Market>(account, 'market', {}, endpoint);
export async function oneClickTokens(): Promise<Array<{assetId:string;symbol:string;blockchain:string;decimals:number}>> {
  const response = await fetch(`${ONECLICK}/tokens`);
  if (!response.ok) throw Error(`1Click HTTP ${response.status}`);
  return response.json();
}
export async function dryQuote(input: {originAsset:string; destinationAsset:string; amount:string; recipient:string; refundTo:string; recipientType?:'DESTINATION_CHAIN'|'INTENTS'; refundType?:'ORIGIN_CHAIN'|'INTENTS'; swapType?:'EXACT_INPUT'|'EXACT_OUTPUT'}, jwt?:string): Promise<unknown> {
  const response = await fetch(`${ONECLICK}/quote`, {method:'POST', headers:{'Content-Type':'application/json', ...(jwt ? {Authorization:`Bearer ${jwt}`} : {})}, body:JSON.stringify({dry:true, swapType:input.swapType ?? 'EXACT_INPUT', slippageTolerance:100, depositType:'ORIGIN_CHAIN', originAsset:input.originAsset, destinationAsset:input.destinationAsset, amount:input.amount, recipient:input.recipient, recipientType:input.recipientType ?? 'DESTINATION_CHAIN', refundTo:input.refundTo, refundType:input.refundType ?? 'ORIGIN_CHAIN', deadline:new Date(Date.now()+180_000).toISOString()})});
  const data = await response.json();
  if (!response.ok) throw Error(`1Click quote ${response.status}: ${JSON.stringify(data)}`);
  return data;
}

/** Public Borsh STATE layout of the deployed Juno contract. No signing material is read. */
export type LifecycleSnapshot = {
  accountId: string | null; creator: string; dare: string; proof: string;
  settled: boolean; finalized: boolean; deadlineMs: number; nowMs: number;
  hasBid: boolean; refundYocto: string; holding: string; voted: boolean;
  /** Public auction book: who sealed a bid, whether it is revealed, and what it won after settlement. */
  bidders: { owner: string; revealed: boolean; allocated: string }[];
  /** Public dare votes, weighted by each voter's current balance (the weight finalization uses). */
  votes: { owner: string; accepted: boolean; weight: string }[];
  openedMs: number;
  /** This account's unclaimed share of a failed dare's bond. */
  darePayoutYocto: string;
};

export function decodeLifecycle(bytes: Uint8Array, accountId: string | null, nowMs: number): LifecycleSnapshot {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  function take(n: number) {
    if (!Number.isSafeInteger(n) || n < 0 || at + n > bytes.length) throw Error('Cannot read Juno lifecycle state.');
    const start = at; at += n; return start;
  }
  const u32 = () => view.getUint32(take(4), true);
  const u64 = () => view.getBigUint64(take(8), true);
  const u128 = () => { const low = u64(); return low + (u64() << 64n); };
  function skipBytes() { take(u32()); }
  function text() { const n = u32(); return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(take(n), at)); }
  function bool() { const n = bytes[take(1)]; if (n > 1) throw Error('Unsupported Juno lifecycle state.'); return n === 1; }
  function count(max = 100_000) { const n = u32(); if (n > max) throw Error('Unsupported Juno lifecycle state.'); return n; }
  if (bool()) throw Error('Lifecycle controls require a post account.');
  text(); skipBytes(); // owner, uploaded code (empty on posts)
  for (let n = count(); n > 0; n--) text(); // factory's posts (empty on posts)
  text(); const creator = text(); text(); text(); // slug, creator, caption, media
  const opened = u64();
  let hasBid = false, refundYocto = '0';
  const bidders: LifecycleSnapshot['bidders'] = [];
  for (let n = count(64); n > 0; n--) {
    const owner = text(); skipBytes(); u128(); u128(); u128(); const revealed = bool(); const allocated = u128(); const refund = u128();
    bidders.push({ owner, revealed, allocated: allocated.toString() });
    if (owner === accountId) { hasBid = true; refundYocto = refund.toString(); }
  }
  const settled = bool(); u128(); // clearing price
  let holding = '0';
  const balances = new Map<string, bigint>();
  for (let n = count(); n > 0; n--) { const owner = text(); const amount = u128(); balances.set(owner, amount); if (owner === accountId) holding = amount.toString(); }
  for (let n = 0; n < 6; n++) u128(); // supply, sold, floor, reserve, graduation escrow, creator earnings
  bool(); // graduated
  const dare = text(); u128(); const proof = text();
  let voted = false;
  const votes: LifecycleSnapshot['votes'] = [];
  for (let n = count(); n > 0; n--) { const owner = text(); const accepted = bool(); votes.push({ owner, accepted, weight: (balances.get(owner) ?? 0n).toString() }); if (owner === accountId) voted = true; }
  const finalized = bool();
  let darePayoutYocto = '0';
  for (let n = count(); n > 0; n--) { const owner = text(); const amount = u128(); if (owner === accountId) darePayoutYocto = amount.toString(); }
  const deadlineMs = Number(opened) + 300_000;
  if (!Number.isSafeInteger(deadlineMs) || !Number.isSafeInteger(nowMs) || nowMs < 0) throw Error('Unsupported Juno lifecycle timestamp.');
  return { accountId, creator, dare, proof, settled, finalized, deadlineMs, nowMs, hasBid, refundYocto, holding, voted, bidders, votes, openedMs: Number(opened), darePayoutYocto };
}
/** Read public post state at one final block, including per-account refund and vote eligibility. */
export async function lifecycle(account: string, viewer: string | null, endpoint = TESTNET_RPC) {
  const state = await rpc({ method: 'query', params: { request_type: 'view_state', account_id: account, prefix_base64: base64(new TextEncoder().encode('STATE')), finality: 'final' } }, endpoint);
  const entry = state.values.find((v: { key: string }) => v.key === 'U1RBVEU=');
  if (!entry) throw Error('Juno lifecycle state is unavailable.');
  const block = await rpc({ method: 'block', params: { block_id: state.block_hash } }, endpoint);
  const B = (globalThis as { Buffer?: { from(s: string, encoding: string): Uint8Array } }).Buffer;
  const bytes = B ? B.from(entry.value, 'base64') : Uint8Array.from(atob(entry.value), c => c.charCodeAt(0));
  return decodeLifecycle(bytes, viewer, Number(BigInt(block.header.timestamp_nanosec) / 1_000_000n));
}
