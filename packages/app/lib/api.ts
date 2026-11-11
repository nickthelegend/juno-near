import {
  accountBalance,
  balanceOf,
  buyQuote,
  curveCost,
  formatNear,
  holders as readHolders,
  market as readMarket,
  posts as readPosts,
  quoteBuy,
  redeemQuote,
  sellQuote,
  spotPrice,
  trades as readTrades,
  YOCTO,
  type Market,
  type Trade,
} from "@juno/sdk";
import { Platform } from "react-native";

import { explorer, FACTORY, RPC_URLS } from "./chain";

/**
 * The Juno client, on NEAR.
 *
 * Every figure here is read from NEAR testnet through `@juno/sdk`: the
 * factory lists the posts, and each post's own contract answers `market`,
 * `trades` and `holders`. There is no Juno server. A transaction is a
 * function call on the post's account (or the factory, for a launch), and
 * `lib/wallet` signs it as a NEP-366 delegate action for the relayer.
 *
 * Amounts: one post token is one whole unit (the contract has 0 decimals,
 * 1,000 per post: 200 in the opening auction, 800 on the curve). NEAR figures
 * are numbers of NEAR, converted from yocto once, here.
 */

export class ApiError extends Error {
  readonly status: number;
  timedOut = false;
  body: unknown = null;
  constructor(message: string, status: number, body: unknown = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

/** Where relative media paths (the seeded posts' art) resolve. */
export const APP_URL =
  process.env.EXPO_PUBLIC_APP_URL?.replace(/\/$/, "") ??
  (Platform.OS === "web" && typeof window !== "undefined" ? window.location.origin : "");

/** Kept for the share link and anything that names the app's own origin. */
export const API_URL = APP_URL;

function requireFactory(): string {
  if (!FACTORY) throw new ApiError("Setup required: EXPO_PUBLIC_JUNO_FACTORY", 503);
  return FACTORY;
}

/** yocto → NEAR, as a number for display. Exact strings stay in the SDK. */
export function near(yocto: bigint | string | number): number {
  const value = typeof yocto === "bigint" ? yocto : BigInt(yocto);
  return Number(formatNear(value, 8));
}

export function toYocto(amount: number): bigint {
  const [whole = "0", frac = ""] = amount.toFixed(24).split(".");
  return BigInt(whole) * YOCTO + BigInt((frac + "0".repeat(24)).slice(0, 24));
}

async function guard<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const text = error instanceof Error ? error.message : String(error);
    if (/does not exist|UNKNOWN_ACCOUNT/i.test(text)) throw new ApiError("Not found on NEAR testnet", 404);
    if (/429|rate/i.test(text)) throw new ApiError("NEAR testnet RPC is rate limiting. Try again in a moment.", 429);
    if (/fetch|network|Failed/i.test(text)) throw new ApiError("NEAR testnet can't be reached right now. Check your connection and try again.", 0);
    throw new ApiError(text.slice(0, 200), 500);
  }
}

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export type CurveState = {
  progress: number;
  raisedUsd: number;
  thresholdUsd: number;
  raisedQuote?: number;
  thresholdQuote?: number;
  graduated: boolean;
};

export type QuoteAsset = { address: null; symbol: "NEAR"; decimals: 24 };

/** The NEAR-only state of a post: its opening auction, floor and dare. */
export type NearState = {
  phase: Market["phase"];
  commitEndMs: number;
  revealEndMs: number;
  sealedBids: number;
  revealedBids: number;
  /** NEAR per token the auction cleared at; 0 before settlement. */
  clearingPrice: number;
  /** NEAR held for holders, and what each token can redeem against it. */
  floorVault: number;
  floorPerToken: number;
  totalSupply: number;
  curveSold: number;
  curveReserve: number;
  graduationEscrow: number;
  dare: string;
  dareBond: number;
  proof: string;
  dareFinalized: boolean;
  /** Exact yocto strings, for quotes. */
  raw: Market;
};

export type Coin = {
  /** The post's NEAR account, which is also its token contract. */
  address: string;
  format: "post" | "reel";
  name: string;
  symbol: string;
  description?: string;
  media: { kind: "image" | "video"; url: string; posterUrl?: string; width: number; height: number };
  creator: { handle: string; displayName: string; avatarUrl: string; wallet: string };
  createdAt: string;
  pool: string;
  chainId: number;
  quote: QuoteAsset;
  /** Graduation keeps liquidity in the post account's escrow; this is its explorer page. */
  graduatedPool?: string | null;
  /** No USD feed: prices are in NEAR. Always null. */
  quoteUsdRate: number | null;
  marketCap: number;
  marketCapQuote?: number;
  marketCapCurrency: string;
  marketCapChangePct: number | null;
  volume24h: number | null;
  volume24hQuote?: number | null;
  totalVolume: number | null;
  totalVolumeQuote?: number | null;
  creatorRewards: number;
  creatorFeesQuote?: number;
  holders: number | null;
  /** NEAR per token (named for the shape the screens were written against). */
  priceUsd: number;
  priceQuote?: number;
  graduation?: { txHash: string | null; timestamp: string } | null;
  priceHistory?: Array<{ t: string; price: number; volume: number; side: "buy" | "sell" }>;
  priceHistoryPartial?: boolean;
  curve: CurveState;
  curvePreset: string;
  likes?: number;
  commentCount?: number;
  viewerLiked?: boolean | null;
  near: NearState;
};

export type Activity = {
  id: string;
  side: "buy" | "sell";
  /** What the contract recorded: an auction fill, a curve buy or sell, or a floor redemption. */
  kind: Trade["kind"];
  actor: { handle: string; avatarUrl: string };
  wallet: string;
  amount: number;
  valueUsd: number;
  valueQuote?: number;
  timestamp: string;
  txHash?: string;
};

export type Holder = {
  rank: number;
  actor: { handle: string; avatarUrl: string };
  wallet: string;
  balance: number;
  share: number;
};

export type FeedItem = {
  kind: "trade";
  /** What the contract recorded for this fill. */
  fill: Trade["kind"];
  id: string;
  timestamp: string;
  side: "buy" | "sell";
  amount: number;
  valueUsd: number;
  price: number;
  priceNow: number | null;
  currency: string;
  note: string | null;
  actor: { wallet: string; handle: string; avatarUrl: string };
  coin: { address: string; name: string; symbol: string; mediaUrl: string | null; mediaKind: string; posterUrl: string | null };
};

export type PositionTrade = { t: string; side: "buy" | "sell"; base: number; price: number };

export type Position = {
  baseMint: string;
  poolAddress: string;
  name: string;
  symbol: string;
  mediaUrl: string | null;
  mediaMime: string | null;
  curvePreset: string;
  balance: number;
  price: number;
  value: number;
  averageCost: number | null;
  unrealisedPnl: number | null;
  unrealisedPnlPct: number | null;
  realisedPnl: number;
  currency: string;
  graduated: boolean;
  trades: PositionTrade[];
  /** What this many tokens redeem against the floor right now. */
  floorValue: number;
  partial: boolean;
};

export type Portfolio = {
  wallet: string;
  positions: Position[];
  missing: number;
  totalValue: number | null;
  totalPnl: number | null;
  totalPnlPct: number | null;
  currency: string;
  partial: boolean;
  history: Array<{ t: string; value: number }>;
};

export type Crowd = {
  currency: string;
  quoteUsdRate: number;
  traders: number;
  holdersStill: number;
  firstBuyer: { wallet: string; price: number; timestamp: string; multiple: number | null } | null;
  biggestBuy: number | null;
  partial: boolean;
};

export type DepthPoint = {
  amountIn: number;
  amountOut: number;
  averagePrice: number;
  priceImpact: number;
  curveImpact: number;
  fee: number;
  allowed?: boolean;
};

/** One NEAR function call, for the wallet to sign and the relayer to submit. */
export type TxStep = {
  label: string;
  receiverId: string;
  methodName: string;
  args: Record<string, unknown>;
  /** yocto, decimal string. */
  deposit: string;
  /** gas units, decimal string. */
  gas: string;
};

export type SwapQuote = {
  side: "buy" | "sell" | "redeem";
  /** Tokens for a buy, NEAR for a sell or redeem. */
  amountOut: number;
  /** NEAR a buy costs (fees and floor share included). */
  amountIn: number;
  fee: number;
  /** NEAR a buy adds to the redeemable floor (20% of the curve price). */
  toFloor: number;
  priceImpact: number;
  /** Paid from the floor rather than the curve (the floor is higher). */
  fromFloor: boolean;
};

export type SwapBuild = { steps: TxStep[]; quote: SwapQuote };

export type Balances = {
  near: number | null;
  /** One post token's balance, when asked for with `token`. */
  token: number | null;
};

export type Trader = {
  wallet: string;
  realised: number;
  unrealised: number | null;
  trades: number;
  coins: number;
  winRate: number | null;
  bestExit: number | null;
  holding: number;
  isCreator: boolean;
  followers: number;
};

const TGAS = 10n ** 12n;

/* ------------------------------------------------------------------ */
/* Reading a post                                                      */
/* ------------------------------------------------------------------ */

type Raw = { account: string; market: Market; trades: Trade[]; holders: Array<[string, string]> };

const ART_EXT = /\.(mp4|webm|mov)(\?|$)/i;
const FULL_CURVE = near(curveCost(0n, 800n));

function titleCase(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}

/** Gross NEAR per token of one fill: the price the curve (or floor) charged, before fee and floor share. */
function fillPrice(trade: Trade): number | null {
  const quantity = Number(trade.quantity);
  if (!quantity) return null;
  const total = BigInt(trade.total);
  if (trade.kind === "auction") return near(total) / quantity;
  if (trade.kind === "buy") return near((total * 100n) / 121n) / quantity;
  if (trade.kind === "sell") return near((total * 100n) / 99n) / quantity;
  return null;
}

/** What one more token costs now: the curve's marginal price, or the floor if that is higher. */
function priceNow(m: Market): number {
  const supply = BigInt(m.total_supply);
  const curve = spotPrice(BigInt(m.curve_sold));
  const floor = BigInt(m.floor_per_token);
  if (m.phase === "commit" || m.phase === "reveal" || m.phase === "settle") return supply > 0n ? near(floor) : near(spotPrice(0n));
  return near(curve > floor ? curve : floor);
}

function toCoin({ account, market: m, trades, holders }: Raw): Coin {
  const createdMs = m.commit_end_ms - 60_000;
  const price = priceNow(m);
  const supply = Number(m.total_supply);
  const history = trades
    .map((trade) => ({ trade, price: fillPrice(trade) }))
    .filter((row): row is { trade: Trade; price: number } => row.price !== null)
    .map(({ trade, price: p }) => ({
      t: new Date(trade.ms).toISOString(),
      price: p,
      volume: near(trade.total),
      side: (trade.kind === "sell" ? "sell" : "buy") as "buy" | "sell",
    }));
  const dayAgo = Date.now() - 86_400_000;
  const reference = history.find((point) => Date.parse(point.t) >= dayAgo) ?? history[0];
  const change = reference && reference.price > 0 && history.length > 0 ? ((price - reference.price) / reference.price) * 100 : null;
  const volume = trades.filter((t) => t.kind !== "redeem").reduce((sum, t) => sum + near(t.total), 0);
  const volume24 = trades
    .filter((t) => t.kind !== "redeem" && t.ms >= dayAgo)
    .reduce((sum, t) => sum + near(t.total), 0);
  const video = ART_EXT.test(m.media_url);
  const marketCap = price * supply;
  const graduatedAt = m.graduated ? [...trades].reverse().find((t) => t.kind === "buy" && t.sold_after === "800") : undefined;

  return {
    address: account,
    format: video ? "reel" : "post",
    name: titleCase(m.slug),
    symbol: m.slug.toUpperCase(),
    description: m.caption || undefined,
    media: { kind: video ? "video" : "image", url: m.media_url, width: 1, height: 1 },
    creator: { handle: m.creator, displayName: m.creator, avatarUrl: "", wallet: m.creator },
    createdAt: new Date(createdMs).toISOString(),
    pool: account,
    chainId: 0,
    quote: { address: null, symbol: "NEAR", decimals: 24 },
    graduatedPool: m.graduated ? account : null,
    quoteUsdRate: null,
    marketCap,
    marketCapQuote: marketCap,
    marketCapCurrency: "NEAR",
    marketCapChangePct: change === null || !Number.isFinite(change) ? null : change,
    volume24h: volume24,
    volume24hQuote: volume24,
    totalVolume: volume,
    totalVolumeQuote: volume,
    creatorRewards: near(m.creator_earnings),
    creatorFeesQuote: near(m.creator_earnings),
    holders: holders.length,
    priceUsd: price,
    priceQuote: price,
    graduation: m.graduated ? { txHash: null, timestamp: new Date(graduatedAt?.ms ?? Date.now()).toISOString() } : null,
    priceHistory: history,
    priceHistoryPartial: trades.length >= 120,
    curve: {
      progress: Number(m.curve_sold) / 800,
      raisedUsd: near(m.curve_reserve),
      thresholdUsd: FULL_CURVE,
      raisedQuote: near(m.curve_reserve),
      thresholdQuote: FULL_CURVE,
      graduated: m.graduated,
    },
    curvePreset: "sealed-bid",
    near: {
      phase: m.phase,
      commitEndMs: m.commit_end_ms,
      revealEndMs: m.reveal_end_ms,
      sealedBids: m.sealed_bid_count,
      revealedBids: m.revealed_bid_count,
      clearingPrice: near(m.clearing_price),
      floorVault: near(m.floor_vault),
      floorPerToken: near(m.floor_per_token),
      totalSupply: supply,
      curveSold: Number(m.curve_sold),
      curveReserve: near(m.curve_reserve),
      graduationEscrow: near(m.graduation_escrow),
      dare: m.dare,
      dareBond: near(m.dare_bond),
      proof: m.proof,
      dareFinalized: m.dare_finalized,
      raw: m,
    },
  };
}

/**
 * A read that a public RPC dropped (a throttled burst, a reset connection) is
 * worth two quiet retries before the screen says it failed. Only reads.
 */
let preferred = 0;
async function retry<T>(read: (endpoint: string) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    const index = (preferred + attempt) % RPC_URLS.length;
    try {
      const value = await read(RPC_URLS[index]!);
      preferred = index;
      return value;
    } catch (error) {
      const text = error instanceof Error ? error.message : String(error);
      if (attempt >= RPC_URLS.length + 1 || /does not exist|UNKNOWN_ACCOUNT|ERR_/i.test(text)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
}

async function readOne(account: string): Promise<Raw> {
  const [m, t, h] = await Promise.all([
    retry((rpc) => readMarket(account, rpc)),
    retry((rpc) => readTrades(account, rpc)),
    retry((rpc) => readHolders(account, rpc)),
  ]);
  return { account, market: m, trades: t, holders: h };
}

/** Every post, read once and shared for a few seconds between screens. */
let shared: { at: number; value: Promise<Raw[]> } | null = null;
async function readAll(fresh = false): Promise<Raw[]> {
  if (!fresh && shared && Date.now() - shared.at < 15_000) return shared.value;
  const value = (async () => {
    const factory = requireFactory();
    const accounts = await guard(retry((rpc) => readPosts(factory, rpc)));
    // Portfolio and rankings must not turn failed market reads into empty wallets.
    return guard(Promise.all(accounts.map((account) => readOne(account))));
  })();
  shared = { at: Date.now(), value };
  value.catch(() => {
    if (shared?.value === value) shared = null;
  });
  return value;
}

export function invalidateReads() {
  shared = null;
}

function activityOf(raw: Raw): Activity[] {
  return [...raw.trades].reverse().map((trade, i) => ({
    id: `${raw.account}:${trade.ms}:${i}`,
    side: trade.kind === "sell" || trade.kind === "redeem" ? "sell" : "buy",
    kind: trade.kind,
    actor: { handle: trade.account, avatarUrl: "" },
    wallet: trade.account,
    amount: Number(trade.quantity),
    valueUsd: near(trade.total),
    valueQuote: near(trade.total),
    timestamp: new Date(trade.ms).toISOString(),
  }));
}

function holdersOf(raw: Raw): Holder[] {
  const total = raw.holders.reduce((sum, [, b]) => sum + Number(b), 0) || 1;
  return raw.holders.map(([wallet, balance], i) => ({
    rank: i + 1,
    actor: { handle: wallet, avatarUrl: "" },
    wallet,
    balance: Number(balance),
    share: Number(balance) / total,
  }));
}

function crowdOf(raw: Raw, coin: Coin): Crowd | null {
  const buys = raw.trades.filter((t) => t.kind === "buy" || t.kind === "auction");
  const traders = new Set(raw.trades.map((t) => t.account));
  const first = buys[0];
  const firstPrice = first ? fillPrice(first) : null;
  return {
    currency: "NEAR",
    quoteUsdRate: 0,
    traders: traders.size,
    holdersStill: raw.holders.filter(([wallet]) => traders.has(wallet)).length,
    firstBuyer:
      first && firstPrice
        ? {
            wallet: first.account,
            price: firstPrice,
            timestamp: new Date(first.ms).toISOString(),
            multiple: coin.priceQuote && firstPrice > 0 ? coin.priceQuote / firstPrice : null,
          }
        : null,
    biggestBuy: buys.length ? Math.max(...buys.map((t) => near(t.total))) : null,
    partial: raw.trades.length >= 120,
  };
}

/* ------------------------------------------------------------------ */
/* Quotes                                                              */
/* ------------------------------------------------------------------ */

function quoteFor(coin: Coin, side: "buy" | "sell" | "redeem", quantity: number): SwapQuote {
  const m = coin.near.raw;
  const q = BigInt(Math.floor(quantity));
  const sold = BigInt(m.curve_sold);
  const vault = BigInt(m.floor_vault);
  const supply = BigInt(m.total_supply);
  const spot = coin.priceQuote ?? 0;
  if (side === "buy") {
    const total = buyQuote(sold, q, vault, supply);
    const gross = (total * 100n) / 121n;
    const curveGross = curveCost(sold, q);
    const average = near(gross) / quantity;
    return {
      side,
      amountOut: quantity,
      amountIn: near(total),
      fee: near(gross / 100n),
      toFloor: near(gross / 5n),
      priceImpact: spot > 0 ? Math.max(0, average / spot - 1) : 0,
      fromFloor: gross > curveGross,
    };
  }
  if (side === "sell") {
    const out = sellQuote(sold, q, vault, supply);
    const curveOut = curveCost(sold - q, q, false);
    const gross = (out * 100n) / 99n;
    const average = near(gross) / quantity;
    return {
      side,
      amountOut: near(out),
      amountIn: 0,
      fee: near(gross / 100n),
      toFloor: 0,
      priceImpact: spot > 0 ? Math.max(0, 1 - average / spot) : 0,
      fromFloor: gross > curveOut,
    };
  }
  const out = redeemQuote(vault, supply, q);
  return { side, amountOut: near(out), amountIn: 0, fee: near(out / 99n), toFloor: 0, priceImpact: 0, fromFloor: true };
}

/* ------------------------------------------------------------------ */
/* Device-local social state                                           */
/* ------------------------------------------------------------------ */

/**
 * Likes and follows have no contract behind them on NEAR, so they are kept on
 * this device only and never shown as anyone else's. A count is the viewer's
 * own like and nothing more.
 */
const memory = new Map<string, string>();
function local(key: string): string | null {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") return localStorage.getItem(`juno:${key}`);
  } catch {
    /* storage refused */
  }
  return memory.get(key) ?? null;
}
function setLocal(key: string, value: string) {
  memory.set(key, value);
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") localStorage.setItem(`juno:${key}`, value);
  } catch {
    /* storage refused */
  }
}
function localSet(key: string): Set<string> {
  try {
    return new Set(JSON.parse(local(key) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

/* ------------------------------------------------------------------ */
/* The client                                                          */
/* ------------------------------------------------------------------ */

export const juno = {
  /** Every post on the factory, as markets. `missing` counts posts whose read failed. */
  coins: async (_limit?: number, opts: { viewer?: string | null; fresh?: boolean } = {}) => {
    const factory = requireFactory();
    const accounts = await guard(retry((rpc) => readPosts(factory, rpc)));
    const raws = await readAll(opts.fresh);
    const liked = localSet(`likes:${opts.viewer ?? "anon"}`);
    const coins = raws.map((raw) => {
      const coin = toCoin(raw);
      coin.viewerLiked = liked.has(coin.address);
      coin.likes = liked.has(coin.address) ? 1 : 0;
      return coin;
    });
    return { coins, missing: Math.max(0, accounts.length - raws.length) };
  },

  /** One post with its fills, holders and crowd. */
  coin: async (token: string) => {
    const raw = await guard(readOne(token));
    const coin = toCoin(raw);
    return {
      coin,
      activity: activityOf(raw),
      activityPartial: raw.trades.length >= 120,
      holders: holdersOf(raw),
      holdersUnreadable: false,
      crowd: crowdOf(raw, coin),
      launchTxHash: null as string | null,
    };
  },

  /** The newest fills across every post, for "Bought by". */
  feed: async (limit = 60) => {
    const raws = await readAll();
    const items: FeedItem[] = raws
      .flatMap((raw) => {
        const coin = toCoin(raw);
        return raw.trades.map((trade, i) => ({
          kind: "trade" as const,
          fill: trade.kind,
          id: `${raw.account}:${trade.ms}:${i}`,
          timestamp: new Date(trade.ms).toISOString(),
          side: (trade.kind === "sell" || trade.kind === "redeem" ? "sell" : "buy") as "buy" | "sell",
          amount: Number(trade.quantity),
          valueUsd: near(trade.total),
          price: fillPrice(trade) ?? 0,
          priceNow: coin.priceQuote ?? null,
          currency: "NEAR",
          note: null,
          actor: { wallet: trade.account, handle: trade.account, avatarUrl: "" },
          coin: { address: coin.address, name: coin.name, symbol: coin.symbol, mediaUrl: coin.media.url, mediaKind: coin.media.kind, posterUrl: null },
        }));
      })
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))
      .slice(0, limit);
    return { items };
  },

  /** What a buy or sell of each size does to the price, computed from the same curve maths as the contract. */
  depth: async (mint: string, side: "buy" | "sell" = "buy", impact?: number) => {
    const { coin } = await juno.coin(mint);
    const room = side === "buy" ? 800 - coin.near.curveSold : coin.near.curveSold;
    const sizes = [1, 5, 10, 25, 50, 100, 200, 400, 800].filter((n) => n <= room);
    const points: DepthPoint[] = sizes.map((n) => {
      const q = quoteFor(coin, side, n);
      return {
        amountIn: side === "buy" ? q.amountIn : n,
        amountOut: side === "buy" ? n : q.amountOut,
        averagePrice: side === "buy" ? q.amountIn / n : q.amountOut / n,
        priceImpact: q.priceImpact,
        curveImpact: q.priceImpact,
        fee: q.fee,
        allowed: coin.near.phase === "curve",
      };
    });
    const budget = impact ?? 0.01;
    const within = points.filter((p) => p.curveImpact <= budget);
    const best = within[within.length - 1];
    return {
      side,
      quoteUsdRate: null as number | null,
      points,
      suggestion: best
        ? { amountIn: side === "buy" ? best.amountOut : best.amountIn, curveImpact: best.curveImpact, ceilingReached: within.length === points.length }
        : null,
    };
  },

  /** Every post this account holds, priced at the curve and at the floor. */
  portfolio: async (wallet: string): Promise<Portfolio> => {
    const raws = await readAll();
    const positions: Position[] = [];
    for (const raw of raws) {
      const held = raw.holders.find(([account]) => account === wallet);
      const mine = raw.trades.filter((t) => t.account === wallet);
      if (!held && mine.length === 0) continue;
      const coin = toCoin(raw);
      const balance = held ? Number(held[1]) : 0;
      const spent = mine.filter((t) => t.kind === "buy" || t.kind === "auction").reduce((s, t) => s + near(t.total), 0);
      const bought = mine.filter((t) => t.kind === "buy" || t.kind === "auction").reduce((s, t) => s + Number(t.quantity), 0);
      const received = mine.filter((t) => t.kind === "sell" || t.kind === "redeem").reduce((s, t) => s + near(t.total), 0);
      const soldQty = mine.filter((t) => t.kind === "sell" || t.kind === "redeem").reduce((s, t) => s + Number(t.quantity), 0);
      const average = bought > 0 ? spent / bought : null;
      const price = coin.priceQuote ?? 0;
      const value = balance * price;
      const unrealised = average === null ? null : value - average * balance;
      positions.push({
        baseMint: coin.address,
        poolAddress: coin.address,
        name: coin.name,
        symbol: coin.symbol,
        mediaUrl: coin.media.url,
        mediaMime: null,
        curvePreset: coin.curvePreset,
        balance,
        price,
        value,
        averageCost: average,
        unrealisedPnl: unrealised,
        unrealisedPnlPct: unrealised !== null && average ? (unrealised / (average * balance || 1)) * 100 : null,
        realisedPnl: average === null ? 0 : received - average * soldQty,
        currency: "NEAR",
        graduated: coin.curve.graduated,
        trades: mine.map((t) => ({ t: new Date(t.ms).toISOString(), side: t.kind === "sell" || t.kind === "redeem" ? "sell" : "buy", base: Number(t.quantity), price: fillPrice(t) ?? 0 })),
        floorValue: near(redeemQuote(BigInt(raw.market.floor_vault), BigInt(raw.market.total_supply), BigInt(balance))),
        partial: raw.trades.length >= 120,
      });
    }
    const held = positions.filter((p) => p.balance > 0);
    const totalValue = held.reduce((s, p) => s + p.value, 0);
    const totalPnl = held.reduce((s, p) => s + (p.unrealisedPnl ?? 0), 0) + positions.reduce((s, p) => s + p.realisedPnl, 0);
    const cost = held.reduce((s, p) => s + (p.averageCost ?? 0) * p.balance, 0);
    return {
      wallet,
      positions,
      missing: 0,
      totalValue,
      totalPnl,
      totalPnlPct: cost > 0 ? (totalPnl / cost) * 100 : null,
      currency: "NEAR",
      partial: positions.some((p) => p.partial),
      history: [],
    };
  },

  /** Traders ranked by NEAR taken out (sells and redemptions) against cost, from every post's fill log. */
  leaderboard: async (limit = 20) => {
    const raws = await readAll();
    const creators = new Set(raws.map((raw) => raw.market.creator));
    const rows = new Map<string, Trader>();
    for (const raw of raws) {
      const coin = toCoin(raw);
      for (const trade of raw.trades) {
        const row = rows.get(trade.account) ?? {
          wallet: trade.account, realised: 0, unrealised: 0, trades: 0, coins: 0, winRate: null, bestExit: null, holding: 0,
          isCreator: creators.has(trade.account), followers: 0,
        };
        row.trades += 1;
        row.realised += trade.kind === "sell" || trade.kind === "redeem" ? near(trade.total) : -near(trade.total);
        rows.set(trade.account, row);
      }
      for (const [wallet, balance] of raw.holders) {
        const row = rows.get(wallet);
        if (!row) continue;
        row.coins += 1;
        row.holding += Number(balance) * (coin.priceQuote ?? 0);
      }
    }
    const traders = [...rows.values()]
      .map((row) => ({ ...row, unrealised: row.holding }))
      .sort((a, b) => b.realised + b.holding - (a.realised + a.holding))
      .slice(0, limit);
    return { traders, currency: "NEAR", partial: false, poolsRead: raws.length };
  },

  /** A NEAR balance, and optionally one post token's. */
  balances: async (wallet: string, token?: string | null): Promise<Balances> => {
    const [nearBalance, held] = await Promise.all([
      retry((rpc) => accountBalance(wallet, rpc)).then(near).catch(() => null),
      token ? retry((rpc) => balanceOf(token, wallet, rpc)).then(Number).catch(() => null) : Promise.resolve(null),
    ]);
    return { near: nearBalance, token: held };
  },

  /** A buy, sell or floor redemption, quoted against the post's live state and built as one function call. */
  buildSwap: async (input: { curve: string; side: "buy" | "sell" | "redeem"; amountOut: number }): Promise<SwapBuild> => {
    const { coin } = await juno.coin(input.curve);
    const quantity = Math.floor(input.amountOut);
    if (!(quantity > 0)) throw new ApiError("Enter a whole number of tokens", 400);
    if (input.side !== "redeem" && coin.near.phase !== "curve") {
      throw new ApiError(coin.near.phase === "graduated" ? "This post graduated: its curve is closed. You can still redeem against the floor." : "The curve opens when the sealed-bid auction settles.", 409);
    }
    if (input.side === "buy" && quantity > 800 - coin.near.curveSold) throw new ApiError(`Only ${800 - coin.near.curveSold} tokens are left on the curve`, 400);
    if (input.side === "sell" && quantity > coin.near.curveSold) throw new ApiError(`At most ${coin.near.curveSold} can be sold back to the curve`, 400);
    const quote = quoteFor(coin, input.side, quantity);
    let deposit = 0n;
    if (input.side === "buy") deposit = await retry((rpc) => quoteBuy(coin.address, BigInt(quantity), rpc));
    const label = input.side === "buy" ? "Buy" : input.side === "sell" ? "Sell" : "Redeem";
    return {
      quote,
      steps: [
        {
          label,
          receiverId: coin.address,
          methodName: input.side,
          args: { quantity: String(quantity) },
          deposit: deposit.toString(),
          gas: (input.side === "buy" ? 100n * TGAS : 80n * TGAS).toString(),
        },
      ],
    };
  },

  /** Quote only, for a signed-out visitor or while typing. */
  quoteSwap: async (input: { curve: string; side: "buy" | "sell" | "redeem"; amountOut: number }) => {
    const { coin } = await juno.coin(input.curve);
    return quoteFor(coin, input.side, Math.floor(input.amountOut));
  },

  /** Launch a post: a named sub-account of the factory with its own market. */
  buildLaunch: (input: { slug: string; caption: string; mediaUrl: string; dare: string; dareBondNear: number }): { steps: TxStep[]; account: string } => {
    const factory = requireFactory();
    const bond = toYocto(input.dareBondNear);
    return {
      account: `${input.slug}.${factory}`,
      steps: [
        {
          label: "Launch",
          receiverId: factory,
          methodName: "create_post",
          args: { slug: input.slug, caption: input.caption, media_url: input.mediaUrl, dare: input.dare, dare_bond: bond.toString() },
          deposit: (3n * YOCTO + bond).toString(),
          gas: (150n * TGAS).toString(),
        },
      ],
    };
  },

  /** A function call on a post with no deposit (settle, reveal, refunds, earnings, dare votes). */
  call: (receiverId: string, methodName: string, label: string, args: Record<string, unknown> = {}, deposit = 0n, gas = 120n * TGAS): TxStep => ({
    label,
    receiverId,
    methodName,
    args,
    deposit: deposit.toString(),
    gas: gas.toString(),
  }),

  /** The creator's fee share. */
  buildClaim: (input: { curve: string }) => ({ steps: [juno.call(input.curve, "withdraw_earnings", "Claim")] }),

  /* Device-local social state (see above). */
  likes: (coins: string[], viewer?: string | null) => {
    const liked = localSet(`likes:${viewer ?? "anon"}`);
    return Promise.resolve({
      counts: Object.fromEntries(coins.map((c) => [c, { likes: liked.has(c) ? 1 : 0, comments: 0, viewerLiked: liked.has(c) }])),
    });
  },
  setLike: (input: { coin: string; wallet: string; like: boolean }) => {
    const key = `likes:${input.wallet}`;
    const liked = localSet(key);
    if (input.like) liked.add(input.coin);
    else liked.delete(input.coin);
    setLocal(key, JSON.stringify([...liked]));
    return Promise.resolve({ likes: input.like ? 1 : 0, liked: input.like });
  },
  followStats: (wallet: string, viewer?: string | null) => {
    const following = localSet(`follows:${wallet}`);
    const viewerFollows = viewer ? localSet(`follows:${viewer}`).has(wallet) : null;
    return Promise.resolve({ wallet, followers: viewerFollows ? 1 : 0, following: following.size, followingList: [...following], viewerFollows });
  },
  setFollow: (follower: string, target: string, on: boolean) => {
    const key = `follows:${follower}`;
    const set = localSet(key);
    if (on) set.add(target);
    else set.delete(target);
    setLocal(key, JSON.stringify([...set]));
    return Promise.resolve({ isFollowing: on, followers: on ? 1 : 0 });
  },

  /**
   * A URL `<Image>` can load. The seeded posts store a path under the app's
   * own `/art`, which resolves against the app's origin.
   */
  media: (url: string | null | undefined): string | null => {
    if (!url) return null;
    if (url.startsWith("data:image/svg")) return null;
    if (/^https?:\/\//.test(url)) return url;
    return url.startsWith("/") ? `${APP_URL}${url}` : `${APP_URL}/${url}`;
  },
  still: (media: { kind: "image" | "video"; url: string; posterUrl?: string }): string | null => {
    const poster = media.posterUrl && media.posterUrl !== media.url ? media.posterUrl : null;
    if (poster) return juno.media(poster);
    return media.kind === "video" ? null : juno.media(media.url);
  },

  explorer: (kind: "tx" | "address" | "token", id: string) => explorer(kind, id),
};

export { formatNear };
