/**
 * The chain the app talks to, and everything that depends on which one it is.
 *
 * Juno on NEAR runs on NEAR testnet. Every post is a named sub-account of the
 * factory (`<slug>.<factory>`), and that account is the coin: its contract
 * holds the sealed-bid opening auction, the bonding curve, the redeemable
 * floor and the dare bond. One place, so no screen hardcodes an explorer, a
 * network name or an RPC.
 */
import { TESTNET_RPC } from "@juno/sdk";

export const RPC_URL = process.env.EXPO_PUBLIC_NEAR_RPC_URL || TESTNET_RPC;
/**
 * Public testnet RPCs tried in order when one throttles (FastNEAR answers a
 * burst with a 429 that carries no CORS header, which a browser reports as a
 * failed fetch). Reads only; every one of them is a real NEAR testnet node.
 */
export const RPC_URLS: string[] = [...new Set([RPC_URL, TESTNET_RPC, "https://near-testnet.drpc.org", "https://rpc.testnet.near.org"])];
/** The factory account every post is a sub-account of. Null means Setup required. */
export const FACTORY: string | null = process.env.EXPO_PUBLIC_JUNO_FACTORY || null;
/** The relayer that creates email accounts and submits NEP-366 meta transactions. */
export const RELAYER_URL: string | null = process.env.EXPO_PUBLIC_RELAYER_URL?.replace(/\/$/, "") || null;
/** A mainnet account to name in 1Click dry quotes. No swap is ever sent from the app. */
export const MAINNET_ACCOUNT: string | null = process.env.EXPO_PUBLIC_NEAR_MAINNET_ACCOUNT || null;

export const IS_TESTNET = true;
export const IS_FORK = false;
export const NETWORK_NAME = "NEAR testnet";
/** What the money is, said once wherever a balance is shown. */
export const NETWORK_LABEL = "NEAR testnet · test NEAR, no real money";
export const EXPLORER_NAME = "NearBlocks";
const EXPLORER = "https://testnet.nearblocks.io";

/** An explorer link. `address` covers accounts and contracts alike: on NEAR they are the same thing. */
export function explorer(kind: "tx" | "address" | "token", id: string): string {
  if (kind === "tx") return `${EXPLORER}/txns/${id}`;
  return `${EXPLORER}/address/${id}`;
}

export function validAddress(value: string | null | undefined): value is string {
  return !!value && /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(value) && value.length >= 2 && value.length <= 64;
}

/** Accounts are shown as they are on chain. */
export function displayAddress(value: string): string {
  return value;
}

/**
 * A NEAR account, short enough for a row: the `.testnet` suffix goes, and a
 * long name keeps its head and tail.
 */
export function shortAddress(value: string, head = 10, tail = 6): string {
  const bare = value.replace(/\.testnet$/, "");
  return bare.length > head + tail + 1 ? `${bare.slice(0, head)}…${bare.slice(-tail)}` : bare;
}

export function sameAddress(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a === b;
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

export type TxFailure = {
  /** Copy to show. Empty when `cancelled`. */
  message: string;
  /** The person backed out. Say nothing. */
  cancelled: boolean;
  /** The contract's ERR_* code, when there was one. */
  reason: string | null;
};

export class TxError extends Error {
  readonly cancelled: boolean;
  readonly reason: string | null;
  constructor(failure: TxFailure) {
    super(failure.message || "Cancelled");
    this.name = "TxError";
    this.cancelled = failure.cancelled;
    this.reason = failure.reason;
  }
}

/** The contract's panics, one line each. */
const REASONS: Record<string, string> = {
  ERR_COMMIT_CLOSED: "The sealed-bid window has closed.",
  ERR_REVEAL_WINDOW: "Bids can only be revealed in the minute after bidding closes.",
  ERR_SETTLE_WINDOW: "The auction cannot be settled yet.",
  ERR_DUPLICATE_BID: "You already placed a sealed bid on this post.",
  ERR_FIXED_ESCROW: "A sealed bid escrows exactly 1 NEAR.",
  ERR_HASH: "That reveal does not match your sealed bid.",
  ERR_ESCROW: "Amount × max price is more than the 1 NEAR you escrowed.",
  ERR_CURVE_CLOSED: "The curve is closed: the auction has not settled, or the post graduated.",
  ERR_PAYMENT: "The price moved. Try again.",
  ERR_SELL: "Nothing to sell at this size.",
  ERR_BALANCE: "You do not hold that many.",
  ERR_REDEEM: "Nothing to redeem yet.",
  ERR_QUANTITY: "That is more than the curve has left.",
  ERR_STORAGE_DEPOSIT: "Launching a post needs 3 NEAR for its account, plus any dare bond.",
  ERR_SLUG: "Names are 2–32 lowercase letters, digits or dashes.",
  ERR_DUPLICATE: "A post with that name already exists.",
  ERR_CREATOR: "Only the creator can do that.",
  ERR_PROOF: "Only the creator can post the dare proof.",
  ERR_VOTE: "Only holders vote, once each.",
  ERR_VOTE_WINDOW: "The dare vote is closed.",
  ERR_DARE_WINDOW: "The dare cannot be finalised yet.",
};

export function describeTxError(error: unknown): TxFailure {
  if (error instanceof TxError) {
    return { message: error.cancelled ? "" : error.message, cancelled: error.cancelled, reason: error.reason };
  }
  const text = error instanceof Error ? error.message : typeof error === "string" ? error : "The transaction failed";
  if (/cancel/i.test(text) && /sign/i.test(text)) return { message: "", cancelled: true, reason: null };
  const code = /ERR_[A-Z_]+/.exec(text)?.[0] ?? null;
  if (code) return { message: REASONS[code] ?? `The contract refused it (${code}).`, cancelled: false, reason: code };
  if (/NotEnoughBalance|LackBalanceForState|not enough balance/i.test(text)) {
    return { message: "Not enough NEAR for this and its gas.", cancelled: false, reason: null };
  }
  if (/429|rate limit|too many requests|timeout|timed out|fetch failed|network/i.test(text)) {
    return { message: "The network is busy. Try again in a moment.", cancelled: false, reason: null };
  }
  return { message: text.split("\n")[0]!.slice(0, 220), cancelled: false, reason: null };
}
