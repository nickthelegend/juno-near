import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { base64, commitment, YOCTO } from "@juno/sdk";

import { CoinGlyph, Identicon } from "./art";
import { Handle } from "./Handle";
import { TransactionSheet, TransactionReceipt, TransactionProgress } from "./TradeSheet";
import { buildLifecycle, lifecycleOptions, type LifecycleMethod } from "../lib/lifecycle";
import type { LifecycleRead } from "../lib/useLifecycle";
import type { SendProgress } from "../lib/wallet";
import { BrandImage } from "./brand";
import { Object3D } from "./art3d";
import { Button, Skeleton } from "./kit";
import { Tappable } from "./Press";
import { juno, type Coin, type FeedItem } from "../lib/api";
import { describeTxError, EXPLORER_NAME, explorer } from "../lib/chain";
import { loadMarkets, invalidateMarkets } from "../lib/markets";
import { useHandle } from "../lib/names";
import { useReducedMotion } from "../lib/motion";
import { amountOf, money, since, splitAmount, useApi } from "../lib/useApi";
import { useWallet } from "../lib/wallet";
import { theme } from "../theme";

/**
 * What only Juno on NEAR has, drawn in the app's existing surfaces.
 *
 * - The ink panel in the feed rail: NEAR held in every
 *   post's redeemable floor, live sealed bids, and the newest fill.
 * - A floor chip under each post, in the same pill as the old burned chip.
 * - On a coin page: the sealed-bid opening auction (with its countdown), the
 *   graduation escrow, and the dare bond — each a card in the page's own style.
 *
 * Every figure is read from NEAR testnet. Nothing here is computed from a
 * guess: a figure that could not be read shows a dash.
 */

const c = theme.colors;
const POLL_MS = 30_000;

/* ------------------------------------------------------------------ */
/* Glyphs                                                              */
/* ------------------------------------------------------------------ */

/** A floor: a bar under a stack. Means one thing: NEAR held for holders to redeem. */
export function FloorGlyph({ size = 16, color = c.pos, filled = false }: { size?: number; color?: string; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={6} y={4.5} width={12} height={5} rx={2.5} fill={filled ? color : "none"} stroke={color} strokeWidth={1.9} />
      <Rect x={6} y={10.5} width={12} height={5} rx={2.5} fill={filled ? color : "none"} stroke={color} strokeWidth={1.9} />
      <Path d="M3.5 19.5h17" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

/** A sealed envelope: a bid nobody can read until it is revealed. */
export function SealGlyph({ size = 16, color = c.text }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={6} width={17} height={12.5} rx={2.5} stroke={color} strokeWidth={1.9} />
      <Path d="m4.5 7.5 7.5 6 7.5-6" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
      <Circle cx={12} cy={14.5} r={2} fill={color} />
    </Svg>
  );
}

function ArrowOut({ size = 14, color = c.muted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M8 16 16 8M9.5 8H16v6.5" stroke={color} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* Clock                                                               */
/* ------------------------------------------------------------------ */

/** Seconds until `ms`, re-rendered every second while it is in the future. */
export function useCountdown(ms: number | null): number | null {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (ms === null || ms <= Date.now()) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [ms]);
  if (ms === null) return null;
  return Math.max(0, Math.ceil((ms - now) / 1000));
}

export function clock(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Where a post is in its life, in a few words, for a button or a chip. */
export function phaseLabel(coin: Coin, secondsLeft: number | null): string {
  const n = coin.near;
  const bids = `${n.sealedBids} sealed ${n.sealedBids === 1 ? "bid" : "bids"}`;
  if (n.phase === "commit") return secondsLeft !== null ? `Bidding · ${clock(secondsLeft)}` : bids;
  if (n.phase === "reveal") return secondsLeft !== null ? `Reveal · ${clock(secondsLeft)}` : "Revealing";
  if (n.phase === "settle") return "Ready to settle";
  if (n.phase === "graduated") return "Graduated";
  return "Buy";
}

/* ------------------------------------------------------------------ */
/* The panel                                                           */
/* ------------------------------------------------------------------ */

function useTicking(target: number | null): number | null {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const from = useRef<number | null>(target);
  useEffect(() => {
    if (target === null) return;
    const start = from.current ?? target;
    from.current = target;
    if (reduced || !(target > start) || start === 0) {
      setShown(target);
      return;
    }
    let raf = 0;
    const t0 = Date.now();
    const step = () => {
      const t = Math.min(1, (Date.now() - t0) / 700);
      const eased = 1 - Math.pow(1 - t, 3);
      if (t >= 1) setShown(target);
      else {
        setShown(start + (target - start) * eased);
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);
  return shown;
}

function useLive<T>(load: () => Promise<T>) {
  const state = useApi(load, []);
  const refresh = useRef(state.refresh);
  refresh.current = state.refresh;
  useEffect(() => {
    const id = setInterval(() => {
      invalidateMarkets();
      refresh.current();
    }, POLL_MS);
    return () => clearInterval(id);
  }, []);
  return state;
}

/** The ink panel: NEAR held in post floors across Juno, the auctions running now, and the newest fill. */
export function FloorPanel() {
  const router = useRouter();
  const markets = useLive(() => loadMarkets());
  const fills = useLive(() => juno.feed(4));
  const posts = markets.data?.posts ?? null;
  const total = posts ? posts.reduce((sum, coin) => sum + coin.near.floorVault, 0) : null;
  const shown = useTicking(total);

  if (!posts) {
    if (markets.loading) {
      return (
        <View style={s.panel} accessibilityLabel="Reading the post floors">
          <Text style={s.panelLabel}>NEAR in post floors</Text>
          <Skeleton h={40} w="70%" style={{ backgroundColor: c.inkSoft, marginTop: 12 }} />
          <Skeleton h={14} w="45%" style={{ backgroundColor: c.inkSoft, marginTop: 12 }} />
        </View>
      );
    }
    const setup = /setup required/i.test(markets.error ?? "");
    return (
      <View style={s.panel}>
        <Row>
          <FloorGlyph color={c.lime} />
          <Text style={s.panelLabel}>{setup ? "Setup required" : "Could not read NEAR testnet"}</Text>
        </Row>
        <Text style={s.panelDetail}>{(markets.error ?? "The RPC did not answer.").replace(/^Setup required:\s*/i, "Set ")}</Text>
        {setup ? null : (
          <Button label="Try again" variant="lime" onPress={markets.refresh} style={{ alignSelf: "flex-start", marginTop: 14 }} />
        )}
      </View>
    );
  }

  const figure = splitAmount((shown ?? 0).toFixed(8), 4);
  const bidding = posts.filter((coin) => coin.near.phase === "commit" || coin.near.phase === "reveal");
  const sealed = bidding.reduce((sum, coin) => sum + coin.near.sealedBids, 0);
  const graduated = posts.filter((coin) => coin.curve.graduated).length;
  const latest: FeedItem | null = fills.data?.items[0] ?? null;

  return (
    <View style={s.panel}>
      <Row justify="space-between">
        <Row>
          <FloorGlyph color={c.lime} filled />
          <Text style={s.panelLabel}>NEAR in post floors</Text>
        </Row>
        <View style={s.livePill} accessibilityLabel={markets.error ? "Stale: the last read failed" : "Live: re-read every few seconds"}>
          <View style={[s.liveDot, markets.error ? { backgroundColor: c.neg } : null]} />
          <Text style={s.liveText}>{markets.error ? "Stale" : "Live"}</Text>
        </View>
      </Row>

      <View style={s.figureRow}>
        <Text style={[s.figure, { flexShrink: 1 }]} accessibilityLabel={`${total} NEAR in floors`} numberOfLines={1} adjustsFontSizeToFit>
          {figure.whole}
          <Text style={s.figureFrac}>.{figure.frac}</Text>
          <Text style={s.figureUnit}> NEAR</Text>
        </Text>
        <View style={s.coin}>
          <BrandImage art="postCard" alt="" size={76} float="drift" eager />
        </View>
      </View>
      <Text style={s.panelDetail}>
        Any holder can redeem against a post's floor at any time. 20% of each buy's base price and half the auction proceeds go in. NEAR testnet.
      </Text>

      <View style={s.split}>
        <SplitFigure label="Sealed bids now" value={String(sealed)} hint={`${bidding.length} ${bidding.length === 1 ? "auction" : "auctions"} open`} />
        <View style={s.splitRule} />
        <SplitFigure label="Posts" value={String(posts.length)} hint={`${graduated} graduated`} />
      </View>

      {latest ? (
        <Tappable
          onPress={() => router.push(`/coin/${latest.coin.address}` as never)}
          to={0.98}
          accessibilityRole="link"
          accessibilityLabel={`Latest fill on $${latest.coin.symbol}, ${since(latest.timestamp)} ago. Open the coin.`}
          style={s.latest}
        >
          <CoinGlyph seed={latest.coin.address} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.latestTitle} numberOfLines={1}>
              {latest.fill === "auction" ? "Won" : latest.fill === "redeem" ? "Redeemed" : latest.fill === "buy" ? "Bought" : "Sold"} {latest.amount} ${latest.coin.symbol} · {amountOf(latest.valueUsd, "NEAR")}
            </Text>
            <LatestDetail item={latest} />
          </View>
          <ArrowOut />
        </Tappable>
      ) : (
        <View style={[s.latest, { paddingVertical: 14 }]}>
          <Text style={[s.latestDetail, { flex: 1 }]}>No fills yet. The first auction settles a minute after bidding closes.</Text>
        </View>
      )}
    </View>
  );
}

function LatestDetail({ item }: { item: FeedItem }) {
  const handle = useHandle(item.actor.wallet);
  return (
    <Text style={s.latestDetail} numberOfLines={1}>
      {handle} · {since(item.timestamp)} ago
    </Text>
  );
}

function SplitFigure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={s.splitLabel}>{label}</Text>
      <Text style={s.splitValue} numberOfLines={1}>
        {value}
      </Text>
      <Text style={s.splitHint}>{hint}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Chips                                                               */
/* ------------------------------------------------------------------ */

/** "Floor 0.0012 NEAR" under a post: what one token redeems for right now. */
export function FloorChip({ coin, tone = "light" }: { coin: Coin; tone?: "light" | "night" }) {
  if (!(coin.near.floorPerToken > 0)) return null;
  return (
    <View style={[s.floor, tone === "night" ? s.floorNight : null]} accessibilityLabel={`Floor ${coin.near.floorPerToken} NEAR per token`}>
      <FloorGlyph size={12} color={tone === "night" ? c.lime : c.pos} filled />
      <Text style={[s.floorText, tone === "night" ? { color: c.lime } : null]}>Floor {money(coin.near.floorPerToken, "NEAR")}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Coin page cards                                                     */
/* ------------------------------------------------------------------ */

type BidSecret = { amount: string; maxPrice: string; salt: string };
function secretKey(token: string, account: string) {
  return `juno-bid:${token}:${account}`;
}
function readSecret(token: string, account: string): BidSecret | null {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") {
      const raw = localStorage.getItem(secretKey(token, account));
      return raw ? (JSON.parse(raw) as BidSecret) : null;
    }
  } catch {
    /* storage refused */
  }
  return null;
}
function writeSecret(token: string, account: string, secret: BidSecret) {
  try {
    if (Platform.OS === "web" && typeof localStorage !== "undefined") localStorage.setItem(secretKey(token, account), JSON.stringify(secret));
  } catch {
    /* storage refused */
  }
}

/**
 * The sealed-bid opening auction, as a coin-page card.
 *
 * For its first minute a post takes sealed bids: each is a hash of (amount,
 * max price, salt) with exactly 1 NEAR escrowed, so nobody — not the creator,
 * not a bot — can see or front-run a bid. The next minute bids are revealed.
 * Then anyone settles it: everyone who cleared pays the same price, the rest
 * is refunded, and half the proceeds seed the floor.
 */
export function AuctionCard({ coin, onChanged, lifecycle }: { coin: Coin; onChanged: () => void; lifecycle: LifecycleRead }) {
  const wallet = useWallet();
  const n = coin.near;
  const commitLeft = useCountdown(n.phase === "commit" ? n.commitEndMs : null);
  const revealLeft = useCountdown(n.phase === "reveal" ? n.revealEndMs : null);
  const [amount, setAmount] = useState("50");
  const [maxPrice, setMaxPrice] = useState("0.0005");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const pendingBidAccount = useRef<string | null>(null);

  // A phase boundary passing on screen is a reason to re-read.
  useEffect(() => {
    if (commitLeft === 0 || revealLeft === 0) onChanged();
  }, [commitLeft, revealLeft, onChanged]);

  if (n.phase === "curve" || n.phase === "graduated") {
    if (!(n.clearingPrice > 0) && n.sealedBids === 0) return <LifecycleControl coin={coin} read={lifecycle} method="claim_refund" quiet />;
    const winners = (lifecycle.data?.post === coin.address ? lifecycle.data.snapshot.bidders : []).filter((b) => Number(b.allocated) > 0);
    return (
      <View style={f.card}>
        <Row justify="space-between">
          <Row>
            <SealGlyph />
            <Text style={f.title}>Opening auction</Text>
          </Row>
          <Object3D art="envelope" alt="" size={44} style={{ margin: "-6px 0" }} />
        </Row>
        <PhaseSteps at={3} dark={false} />
        <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={f.tileLabel}>Cleared at one price</Text>
            <Text style={f.bigFig} numberOfLines={1} adjustsFontSizeToFit>{n.clearingPrice > 0 ? money(n.clearingPrice, "NEAR") : "No fills"}</Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={f.tileLabel}>{n.sealedBids} sealed · {n.revealedBids} revealed</Text>
            <Text style={f.tileLabel}>200 tokens allocated</Text>
          </View>
        </View>
        {winners.length ? (
          <View style={{ gap: 8 }}>
            {winners.map((b) => (
              <View key={b.owner} style={f.winner}>
                <Identicon seed={b.owner} size={24} />
                <Text style={f.winnerName} numberOfLines={1}><Handle wallet={b.owner} /></Text>
                <Text style={f.winnerFig}>{b.allocated} tokens</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={f.body}>Every winner paid the same clearing price, so bidding first bought nothing.</Text>
        <LifecycleControl coin={coin} read={lifecycle} method="claim_refund" quiet />
      </View>
    );
  }

  const run = async (label: string, build: () => Promise<Parameters<typeof wallet.send>[0]>) => {
    setBusy(true);
    setError(null);
    setHash(null);
    try {
      if (!wallet.address) await wallet.connect();
      const steps = await build();
      const sent = await wallet.send(steps);
      setHash(sent.hashes[sent.hashes.length - 1] ?? null);
      onChanged();
    } catch (caught) {
      const failure = describeTxError(caught);
      if (label === "Bid" && pendingBidAccount.current && (failure.cancelled || /blocked the wallet window/.test(failure.message))) {
        // A cancelled/blocked approval cannot have submitted this commitment.
        // Keep the secret for uncertain network outcomes, where a bid may have landed.
        try {
          if (typeof localStorage !== "undefined") localStorage.removeItem(secretKey(coin.address, pendingBidAccount.current));
        } catch { /* storage refused */ }
        pendingBidAccount.current = null;
      }
      setError(failure.cancelled ? null : failure.message || `${label} failed`);
    } finally {
      setBusy(false);
    }
  };

  const commit = () =>
    run("Bid", async () => {
      const account = wallet.address ?? (await wallet.connect());
      const units = BigInt(Math.max(1, Math.floor(Number(amount) || 0)));
      const price = BigInt(Math.round(Number(maxPrice) * 1e8)) * (YOCTO / 100_000_000n);
      if (units * price > YOCTO) throw new Error("Amount × max price must fit inside the 1 NEAR escrow.");
      const salt = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      writeSecret(coin.address, account, { amount: units.toString(), maxPrice: price.toString(), salt });
      pendingBidAccount.current = account;
      return [juno.call(coin.address, "commit", "Sealed bid", { commitment: base64(commitment(account, units, price, salt)) }, YOCTO)];
    });
  const reveal = () =>
    run("Reveal", async () => {
      const account = wallet.address ?? (await wallet.connect());
      const secret = readSecret(coin.address, account);
      if (!secret) throw new Error("This device does not hold your bid's secret, so it cannot reveal it.");
      return [juno.call(coin.address, "reveal", "Reveal", { amount: secret.amount, max_price: secret.maxPrice, salt: secret.salt })];
    });
  const settle = () => run("Settle", async () => [juno.call(coin.address, "settle", "Settle", {}, 0n, 150n * 10n ** 12n)]);

  const mine = wallet.address ? readSecret(coin.address, wallet.address) : null;
  const book = lifecycle.data?.post === coin.address ? lifecycle.data.snapshot.bidders : [];
  const left = n.phase === "commit" ? commitLeft : n.phase === "reveal" ? revealLeft : 0;
  const total = 60;
  const step = n.phase === "commit" ? 0 : n.phase === "reveal" ? 1 : 2;
  const units = Math.max(0, Math.floor(Number(amount) || 0));
  const each = Number(maxPrice) || 0;
  const fits = units > 0 && units * each <= 1;

  return (
    <View style={a.card}>
      <Row justify="space-between">
        <Row>
          <SealGlyph color={c.lime} />
          <Text style={a.title}>Opening auction</Text>
        </Row>
        <View style={a.live}>
          <LiveDot />
          <Text style={a.liveText}>Live</Text>
        </View>
      </Row>

      <PhaseSteps at={step} />

      <View style={a.clockRow}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={a.clock}>{n.phase === "settle" ? "0:00" : clock(left ?? total)}</Text>
          <Text style={a.clockLabel}>
            {n.phase === "commit" ? "until sealed bids close" : n.phase === "reveal" ? "until reveals close" : "Bidding is over · ready to settle"}
          </Text>
        </View>
        <Ring pct={n.phase === "settle" ? 1 : 1 - (left ?? total) / total} />
      </View>

      <View style={a.stats}>
        <Stat2 value={String(n.sealedBids)} label={n.sealedBids === 1 ? "sealed bid" : "sealed bids"} />
        <Stat2 value={String(n.revealedBids)} label="revealed" />
        <Stat2 value="200" label="tokens for sale" />
      </View>

      {book.length ? (
        <View style={a.book}>
          {book.map((b) => (
            <View key={b.owner} style={a.bidder}>
              <Identicon seed={b.owner} size={22} />
              <Text style={a.bidderName} numberOfLines={1}><Handle wallet={b.owner} /></Text>
              <Text style={[a.bidderState, b.revealed ? a.bidderOpen : null]}>{b.revealed ? "Revealed" : "Sealed"}</Text>
            </View>
          ))}
        </View>
      ) : (
        <Text style={a.note}>No sealed bids yet. Bids are hashes with 1 NEAR escrowed, so nobody can see a price until the reveal.</Text>
      )}

      <View style={a.inset}>
        {n.phase === "commit" ? (
          mine ? (
            <View style={{ gap: 4 }}>
              <Text style={f.tileLabel}>Your sealed bid</Text>
              <Text style={a.mineFig}>{mine.amount} tokens · up to {amountOf(Number(mine.maxPrice) / 1e24, "NEAR")} each</Text>
              <Text style={f.body}>The price stays on this device until you reveal it.</Text>
            </View>
          ) : (
            <>
              <View style={f.inputs}>
                <Field label="Tokens" value={amount} onChange={setAmount} />
                <Field label="Max NEAR each" value={maxPrice} onChange={setMaxPrice} />
              </View>
              <Text style={[f.body, !fits && units > 0 ? { color: c.neg } : null]}>
                {fits ? `Pays at most ${amountOf(units * each, "NEAR")}. Everyone who clears pays one price; unused escrow comes back.` : "Tokens × max price must fit inside the 1 NEAR escrow."}
              </Text>
              <Button label="Place sealed bid · 1 NEAR escrow" variant="lime" tall disabled={!fits} onPress={() => void commit()} loading={busy} />
            </>
          )
        ) : n.phase === "reveal" ? (
          <>
            {wallet.address && book.some((b) => b.owner === wallet.address && b.revealed) ? (
              <View style={{ gap: 4 }}>
                <Text style={f.tileLabel}>Your bid is revealed</Text>
                <Text style={a.mineFig}>{mine ? `${mine.amount} tokens · up to ${amountOf(Number(mine.maxPrice) / 1e24, "NEAR")} each` : "Revealed on chain"}</Text>
                <Text style={f.body}>Settlement opens when the reveal clock reaches zero.</Text>
              </View>
            ) : (
              <>
                <Text style={f.body}>{mine ? `Reveal ${mine.amount} tokens at up to ${amountOf(Number(mine.maxPrice) / 1e24, "NEAR")}. A bid left hidden is refunded minus 1%.` : "This device holds no sealed bid for this post."}</Text>
                <Button label={mine ? "Reveal my bid" : "No bid from this device"} variant="lime" tall disabled={!mine} onPress={() => void reveal()} loading={busy} />
              </>
            )}
          </>
        ) : (
          <>
            <Text style={f.body}>Anyone can settle. Revealed bids are ranked by max price; all 200 tokens clear at one price.</Text>
            <Button label="Settle the auction" variant="lime" tall onPress={() => void settle()} loading={busy} />
          </>
        )}
        {error ? <Text style={f.error}>{error}</Text> : null}
        {hash ? <TxLink hash={hash} /> : null}
      </View>
    </View>
  );
}

/** The coin page's bottom bar while the opening auction runs: the live phase and its clock. */
export function AuctionBar({ coin }: { coin: Coin }) {
  const n = coin.near;
  const left = useCountdown(n.phase === "commit" ? n.commitEndMs : n.phase === "reveal" ? n.revealEndMs : null);
  const text = n.phase === "commit" ? "Sealed bids close" : n.phase === "reveal" ? "Reveals close" : "Auction over · settle it above";
  return (
    <View style={{ flex: 1, minHeight: 56, borderRadius: 999, backgroundColor: c.ink, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingHorizontal: 18 }}>
      <LiveDot />
      <Text style={{ color: c.onInk, fontSize: theme.type.body.size, fontWeight: "700" }}>{text}</Text>
      {left !== null && n.phase !== "settle" ? <Text style={{ color: c.lime, fontSize: theme.type.body.size, fontWeight: "800", ...tabular }}>{clock(left)}</Text> : null}
    </View>
  );
}

/** Over a post's photo: where its market is right now, ticking during the auction. */
export function PhaseChip({ coin }: { coin: Coin }) {
  const n = coin.near;
  const left = useCountdown(n.phase === "commit" ? n.commitEndMs : n.phase === "reveal" ? n.revealEndMs : null);
  const live = n.phase === "commit" || n.phase === "reveal" || n.phase === "settle";
  const text = n.phase === "graduated" ? "Graduated" : n.phase === "curve" ? `On the curve · ${Math.floor((n.curveSold / 800) * 100)}%` : phaseLabel(coin, left);
  return (
    <View pointerEvents="none" style={{ position: "absolute", left: 12, top: 12, flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, backgroundColor: n.phase === "graduated" ? c.lime : "rgba(18,21,14,0.82)" }}>
      {live ? <LiveDot /> : null}
      <Text style={{ color: n.phase === "graduated" ? c.ink : live ? c.lime : c.onInk, fontSize: theme.type.caption.size, fontWeight: "800", ...tabular }}>{text}</Text>
    </View>
  );
}

/** Bid · Reveal · Settle · Trade — where the opening auction is, as four segments. */
export function PhaseSteps({ at, dark = true }: { at: number; dark?: boolean }) {
  const steps = ["Bid", "Reveal", "Settle", "Trade"];
  return (
    <View style={{ flexDirection: "row", gap: 6 }}>
      {steps.map((label, i) => (
        <View key={label} style={{ flex: 1, gap: 6 }}>
          <View style={{ height: 4, borderRadius: 2, backgroundColor: i < at ? c.lime : i === at ? c.lime : dark ? "rgba(243,247,238,0.16)" : c.line, opacity: i < at ? 0.55 : 1 }} />
          <Text style={{ fontSize: theme.type.caption.size, fontWeight: i === at ? "800" : "600", color: i === at ? (dark ? c.lime : c.text) : dark ? "#7F8A78" : c.faint }}>{label}</Text>
        </View>
      ))}
    </View>
  );
}

function LiveDot() {
  const reduced = useReducedMotion();
  const style = Platform.OS === "web" && !reduced ? ({ animationName: "junoPulse", animationDuration: "1.4s", animationIterationCount: "infinite" } as object) : null;
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined" || document.getElementById("juno-pulse")) return;
    const el = document.createElement("style");
    el.id = "juno-pulse";
    el.textContent = "@keyframes junoPulse{0%{box-shadow:0 0 0 0 rgba(214,255,61,.7)}70%{box-shadow:0 0 0 7px rgba(214,255,61,0)}100%{box-shadow:0 0 0 0 rgba(214,255,61,0)}}";
    document.head.appendChild(el);
  }, []);
  return <View style={[{ width: 7, height: 7, borderRadius: 4, backgroundColor: c.lime }, style]} />;
}

function Ring({ pct }: { pct: number }) {
  const r = 26, len = 2 * Math.PI * r, p = Math.max(0, Math.min(1, pct));
  return (
    <Svg width={64} height={64} viewBox="0 0 64 64">
      <Circle cx={32} cy={32} r={r} stroke="rgba(243,247,238,0.14)" strokeWidth={6} fill="none" />
      <Circle cx={32} cy={32} r={r} stroke={c.lime} strokeWidth={6} fill="none" strokeLinecap="round" strokeDasharray={`${len * p} ${len}`} transform="rotate(-90 32 32)" />
    </Svg>
  );
}

function Stat2({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={a.statValue} numberOfLines={1}>{value}</Text>
      <Text style={a.statLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

/** A graduated post: the curve sold out and its liquidity is held in the post account's escrow. */
export function GraduationMoment({ coin }: { coin: Coin }) {
  if (!coin.curve.graduated) return null;
  const when = coin.graduation ? new Date(coin.graduation.timestamp) : null;
  return (
    <View style={f.moment}>
      <View style={f.momentBadge}>
        <FloorGlyph size={22} color={c.lime} filled />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={f.momentFigure}>{amountOf(coin.near.graduationEscrow, "NEAR")} in graduation escrow</Text>
        <Text style={f.momentKicker}>
          {when
            ? `Graduated ${when.toLocaleDateString([], { day: "numeric", month: "short" })}, ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Graduated"}
        </Text>
        <Text style={f.momentBody}>
          All 800 curve tokens sold. The curve is closed and its liquidity stays locked in this post's own account until a Rhea pool is seeded. The floor stays redeemable.
        </Text>
        <Pressable onPress={() => void Linking.openURL(explorer("address", coin.address))} accessibilityRole="link" style={f.momentLink}>
          <Text style={f.momentLinkText}>{coin.address} on {EXPLORER_NAME}</Text>
          <ArrowOut size={12} color={c.lime} />
        </Pressable>
      </View>
    </View>
  );
}

/** The dare: the creator's bond, the proof, and how holders voted. */
export function DareCard({ coin, lifecycle }: { coin: Coin; lifecycle: LifecycleRead }) {
  const n = coin.near;
  const snap = lifecycle.data?.post === coin.address ? lifecycle.data.snapshot : null;
  const left = useCountdown(snap && !snap.finalized ? snap.deadlineMs : null);
  if (!n.dare) return null;
  const votes = snap?.votes ?? [];
  const yes = votes.filter((v) => v.accepted).reduce((t, v) => t + Number(v.weight), 0);
  const no = votes.filter((v) => !v.accepted).reduce((t, v) => t + Number(v.weight), 0);
  const share = yes + no > 0 ? yes / (yes + no) : 0;
  const open = left !== null && left > 0;
  const options = snap ? lifecycleOptions(snap) : null;
  const action = options ? (["submit_proof", "vote_proof", "finalize_dare", "claim_dare"] as const).find((m) => options[m].eligible) : undefined;
  const status = n.dareFinalized
    ? (n.proof && yes > no ? "Proof accepted · bond returned to the creator" : "Dare failed · bond split across holders")
    : open
      ? `${clock(left!)} left to post proof and vote`
      : "Voting closed · ready to finalize";
  return (
    <View style={f.dareCard}>
      <Row justify="space-between">
        <View style={f.darePill}><Text style={f.darePillText}>Dare</Text></View>
        <Object3D art="dice" alt="" size={52} float style={{ margin: "-10px 0" }} />
      </Row>
      <Text style={f.dareBig}>“{n.dare}”</Text>
      <View style={f.tiles}>
        <Tile label="Bond" value={n.dareBond > 0 ? `${Number(n.dareBond.toFixed(3))} NEAR` : n.dareFinalized ? "Settled" : "None"} on={n.dareBond > 0} />
        <Tile label="Proof" value={n.proof ? "Posted" : "Not yet"} />
        <Tile label="Votes" value={String(votes.length)} />
      </View>
      {n.proof ? (
        <View style={f.proof}>
          <Text style={f.tileLabel}>Creator's proof</Text>
          <Text style={f.proofText}>{n.proof}</Text>
        </View>
      ) : null}
      {votes.length ? (
        <View style={{ gap: 8 }}>
          <View style={f.tally}>
            <View style={[f.tallyYes, { flex: Math.max(share, 0.0001) }]} />
            <View style={[f.tallyNo, { flex: Math.max(1 - share, 0.0001) }]} />
          </View>
          <Row justify="space-between">
            <Text style={[f.tileLabel, { color: c.pos }]}>Accept · {yes} tokens</Text>
            <Text style={[f.tileLabel, { color: c.neg }]}>Reject · {no} tokens</Text>
          </Row>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
            {votes.map((v) => (
              <View key={v.owner} style={f.voter}>
                <Identicon seed={v.owner} size={18} />
                <Text style={f.voterText}><Handle wallet={v.owner} /> {v.accepted ? "accepted" : "rejected"}</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View style={[f.dareStatus, n.dareFinalized ? f.dareStatusDone : null]}>
        <Text style={[f.dareStatusText, n.dareFinalized ? { color: c.lime } : null]}>{status}</Text>
      </View>
      {/* Every control stays mounted (quiet when not eligible) so an open receipt survives the re-read that follows it. */}
      {(["submit_proof", "vote_proof", "finalize_dare", "claim_dare"] as const).map((m) => <LifecycleControl key={m} coin={coin} read={lifecycle} method={m} quiet />)}
      {action ? null : (
        <Text style={f.body}>{n.dareFinalized ? (n.proof && yes > no ? "Holders accepted the proof by token balance, so the contract returned the bond to the creator." : "No accepted proof by the deadline, so the contract split the bond across holders by balance.") : "The creator posts proof; holders vote with their balance. Flake, and the bond is split among holders."}</Text>
      )}
    </View>
  );
}

/** Buttons only appear for a connected account eligible in the current final-chain snapshot. */
function LifecycleControl({ coin, read, method, quiet }: { coin: Coin; read: LifecycleRead; method: LifecycleMethod; quiet?: boolean }) {
  const wallet = useWallet();
  const account = useRef(wallet.address); account.current = wallet.address;
  const [open, setOpen] = useState(false);
  const [proof, setProof] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [progress, setProgress] = useState<SendProgress | null>(null);
  const snapshot = read.data?.post === coin.address && read.data.snapshot.accountId === wallet.address ? read.data.snapshot : null;
  const allowed = snapshot && !read.loading && !read.error ? lifecycleOptions(snapshot)[method] : { eligible: false, reason: read.error ? "Could not read lifecycle eligibility. Pull to refresh or wait a moment." : "Checking lifecycle eligibility…" };
  const share = snapshot && BigInt(snapshot.darePayoutYocto ?? "0") > 0n ? ` · ${amountOf(Number(BigInt(snapshot.darePayoutYocto)) / 1e24, "NEAR")}` : "";
  const title = { claim_refund: "Claim auction refund", submit_proof: "Submit proof", vote_proof: "Vote on proof", finalize_dare: "Finalize dare", claim_dare: `Claim my bond share${share}` }[method];
  async function run(accepted?: boolean) {
    setBusy(true); setError(null); setProgress(null);
    try {
      const signer = account.current;
      if (!signer) throw Error("Connect a NEAR wallet to continue.");
      const fresh = await juno.lifecycle(coin.address, signer);
      const step = buildLifecycle(coin.address, fresh, method, { proof, accepted });
      if (account.current !== signer) throw Error("The connected account changed. Try again.");
      const sent = await wallet.send([step], { onProgress: setProgress });
      setHash(sent.hashes[sent.hashes.length - 1]!); read.refresh();
    } catch (caught) {
      const failure = describeTxError(caught); setError(failure.cancelled ? null : failure.message); read.refresh();
    } finally { setBusy(false); }
  }
  return <>
    {allowed.eligible ? <Button label={title} variant="lime" tall onPress={() => { setProof(coin.near.proof); setError(null); setHash(null); setOpen(true); }} /> : quiet ? null : <Text testID={`${method}-reason`} style={f.body}>{allowed.reason}</Text>}
    {open ? <TransactionSheet title={title} busy={busy} onClose={() => setOpen(false)}>
      {hash ? <TransactionReceipt hash={hash} label={title} onDone={() => setOpen(false)} /> : <>
        <Text style={f.body}>{method === "claim_refund" ? "Return unused auction escrow to this account." : method === "claim_dare" ? "The creator flaked, so the bond was split across holders by balance. This sends your share to this account." : method === "finalize_dare" ? "Settle the dare bond using holders' recorded votes." : coin.near.proof ? `Proof: ${coin.near.proof}` : "The creator has not posted proof yet."}</Text>
        {method === "submit_proof" ? <Field label="Proof text or URL" value={proof} onChange={setProof} numeric={false} /> : null}
        {method === "vote_proof" ? <Text style={f.body}>One vote per account. Voting weight is the token balance at finalization.</Text> : null}
        {progress ? <TransactionProgress labels={[title]} at={progress} /> : null}
        {error ? <Text style={f.error}>{error}</Text> : null}
        {method === "vote_proof" ? <><Button label="Accept proof" onPress={() => void run(true)} disabled={busy} loading={busy} /><Button label="Reject proof" variant="ink" onPress={() => void run(false)} disabled={busy} /></> : <Button label={title} onPress={() => void run()} disabled={busy || (method === "submit_proof" && (!proof.trim() || new TextEncoder().encode(proof.trim()).length > 300))} loading={busy} />}
      </>}
    </TransactionSheet> : null}
  </>;
}

function Tile({ label, value, on }: { label: string; value: string; on?: boolean }) {
  return (
    <View style={[f.tile, on ? f.tileOn : null]}>
      <Text style={f.tileLabel}>{label}</Text>
      <Text style={f.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

function Field({ label, value, onChange, numeric = true }: { label: string; value: string; onChange: (v: string) => void; numeric?: boolean }) {
  return (
    <View style={f.field}>
      <Text style={f.tileLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={(text) => onChange(numeric ? text.replace(/[^0-9.]/g, "") : text)}
        keyboardType={numeric ? "decimal-pad" : "default"}
        style={f.fieldInput}
        accessibilityLabel={label}
      />
    </View>
  );
}

export function TxLink({ hash }: { hash: string }) {
  return (
    <Pressable onPress={() => void Linking.openURL(explorer("tx", hash))} accessibilityRole="link" style={f.txLink}>
      <Text style={f.txText}>
        tx {hash.slice(0, 8)}…{hash.slice(-6)} · {EXPLORER_NAME}
      </Text>
      <ArrowOut size={12} color={c.focus} />
    </Pressable>
  );
}

function Row({ children, justify }: { children: React.ReactNode; justify?: "space-between" }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: justify }}>{children}</View>;
}

const tabular = { fontVariant: ["tabular-nums" as const] };

const s = StyleSheet.create({
  figureRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  coin: { marginTop: 6, marginBottom: -16, marginRight: -4 },
  panel: { backgroundColor: c.ink, borderRadius: theme.radius.lg, padding: 20, gap: 6, alignSelf: "stretch" },
  panelLabel: { color: c.onInk, fontSize: theme.type.label.size, fontWeight: "600", letterSpacing: -0.1 },
  panelDetail: { color: "#A9B3A2", fontSize: theme.type.caption.size, lineHeight: 17 },
  livePill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c.inkSoft },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.lime },
  liveText: { color: "#A9B3A2", fontSize: theme.type.micro.size, fontWeight: "600", ...tabular },
  figure: { marginTop: 10, color: c.lime, fontSize: theme.type.display.size, lineHeight: theme.type.display.height, letterSpacing: theme.type.display.tracking, fontWeight: "700", ...tabular },
  figureFrac: { color: "#7C8C55", fontWeight: "600" },
  figureUnit: { color: c.onInk, fontSize: theme.type.title.size, fontWeight: "600", letterSpacing: -0.2 },
  split: { flexDirection: "row", marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(243,247,238,0.16)", gap: 12 },
  splitRule: { width: StyleSheet.hairlineWidth, backgroundColor: "rgba(243,247,238,0.16)" },
  splitLabel: { color: "#A9B3A2", fontSize: theme.type.caption.size },
  splitValue: { color: c.onInk, fontSize: theme.type.body.size, fontWeight: "700", marginTop: 2, ...tabular },
  splitHint: { color: "#7F8A78", fontSize: theme.type.micro.size, marginTop: 1 },
  latest: { marginTop: 14, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: c.surface, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10, minHeight: 56 },
  latestTitle: { color: c.text, fontSize: theme.type.label.size, fontWeight: "700", ...tabular },
  latestDetail: { color: c.muted, fontSize: theme.type.caption.size, marginTop: 1 },
  floor: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, backgroundColor: c.posSoft, alignSelf: "flex-start" },
  floorNight: { backgroundColor: "rgba(214,255,61,0.16)" },
  floorText: { color: c.pos, fontSize: theme.type.caption.size, fontWeight: "700", ...tabular },
});

const a = StyleSheet.create({
  card: { backgroundColor: c.ink, borderRadius: theme.radius.lg, padding: 18, gap: 16, alignSelf: "stretch", marginTop: 16 },
  title: { color: c.onInk, fontSize: theme.type.title.size, fontWeight: "700", letterSpacing: -0.4 },
  live: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c.inkSoft },
  liveText: { color: c.lime, fontSize: theme.type.caption.size, fontWeight: "800" },
  clockRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  clock: { color: c.lime, fontSize: 56, lineHeight: 60, fontWeight: "800", letterSpacing: -2, ...tabular },
  clockLabel: { color: "#A9B3A2", fontSize: theme.type.label.size, fontWeight: "600" },
  stats: { flexDirection: "row", gap: 12, paddingTop: 14, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(243,247,238,0.16)" },
  statValue: { color: c.onInk, fontSize: theme.type.title.size, fontWeight: "800", ...tabular },
  statLabel: { color: "#A9B3A2", fontSize: theme.type.caption.size, fontWeight: "600" },
  book: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  bidder: { flexDirection: "row", alignItems: "center", gap: 7, paddingLeft: 5, paddingRight: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c.inkSoft },
  bidderName: { color: c.onInk, fontSize: theme.type.label.size, fontWeight: "700", maxWidth: 110 },
  bidderState: { color: "#A9B3A2", fontSize: theme.type.caption.size, fontWeight: "700" },
  bidderOpen: { color: c.lime },
  note: { color: "#A9B3A2", fontSize: theme.type.label.size, lineHeight: 20 },
  inset: { backgroundColor: c.surface, borderRadius: theme.radius.md, padding: 14, gap: 12 },
  mineFig: { color: c.text, fontSize: theme.type.lead.size, fontWeight: "800", ...tabular },
});

const f = StyleSheet.create({
  bigFig: { color: c.text, fontSize: theme.type.heading.size, fontWeight: "800", letterSpacing: -0.6, ...tabular },
  winner: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: c.surfaceAlt, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 9 },
  winnerName: { flex: 1, minWidth: 0, color: c.text, fontSize: theme.type.label.size, fontWeight: "700" },
  winnerFig: { color: c.text, fontSize: theme.type.label.size, fontWeight: "800", ...tabular },
  dareCard: { backgroundColor: c.surface, borderRadius: theme.radius.lg, padding: 16, gap: 14, alignSelf: "stretch", marginTop: 16, borderWidth: 2, borderColor: c.lime },
  darePill: { backgroundColor: c.ink, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  darePillText: { color: c.lime, fontSize: theme.type.caption.size, fontWeight: "800" },
  dareBig: { color: c.text, fontSize: theme.type.title.size, lineHeight: 27, fontWeight: "800", letterSpacing: -0.5 },
  proof: { backgroundColor: c.limeSoft, borderRadius: theme.radius.md, padding: 12, gap: 4 },
  proofText: { color: c.text, fontSize: theme.type.body.size, fontWeight: "600" },
  tally: { flexDirection: "row", height: 10, borderRadius: 5, overflow: "hidden", gap: 2 },
  tallyYes: { backgroundColor: c.pos },
  tallyNo: { backgroundColor: c.negSoft },
  voter: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: c.surfaceAlt, borderRadius: 999, paddingLeft: 4, paddingRight: 10, paddingVertical: 4 },
  voterText: { color: c.text, fontSize: theme.type.caption.size, fontWeight: "700" },
  dareStatus: { backgroundColor: c.surfaceAlt, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  dareStatusDone: { backgroundColor: c.ink },
  dareStatusText: { color: c.text, fontSize: theme.type.label.size, fontWeight: "800", ...tabular },
  card: { backgroundColor: c.surface, borderRadius: theme.radius.lg, padding: 16, gap: 12, alignSelf: "stretch", marginTop: 16 },
  title: { color: c.text, fontSize: theme.type.title.size, fontWeight: "700", letterSpacing: -0.4 },
  kicker: { color: c.muted, fontSize: theme.type.caption.size, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.6 },
  dare: { color: c.text, fontSize: theme.type.lead.size, fontWeight: "700", letterSpacing: -0.2, lineHeight: 24 },
  body: { color: c.muted, fontSize: theme.type.label.size, lineHeight: 20 },
  mine: { color: c.text, fontSize: theme.type.label.size, lineHeight: 20, fontWeight: "600" },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, minWidth: 0, backgroundColor: c.surfaceAlt, borderRadius: theme.radius.md, padding: 12, gap: 2 },
  tileOn: { backgroundColor: c.limeSoft },
  tileLabel: { color: c.muted, fontSize: theme.type.caption.size, fontWeight: "600" },
  tileValue: { color: c.text, fontSize: theme.type.lead.size, fontWeight: "800", letterSpacing: -0.2, ...tabular },
  clock: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: c.ink },
  clockText: { color: c.lime, fontSize: theme.type.caption.size, fontWeight: "700", ...tabular },
  inputs: { flexDirection: "row", gap: 8 },
  field: { flex: 1, minWidth: 0, borderRadius: theme.radius.md, borderWidth: 1, borderColor: c.lineStrong, paddingHorizontal: 12, paddingVertical: 8, gap: 2 },
  fieldInput: { color: c.text, fontSize: theme.type.lead.size, fontWeight: "700", ...tabular, padding: 0 },
  error: { color: c.neg, fontSize: theme.type.label.size },
  txLink: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  txText: { color: c.focus, fontSize: theme.type.caption.size, fontWeight: "600", ...tabular },
  moment: { flexDirection: "row", gap: 14, marginTop: 16, padding: 16, borderRadius: theme.radius.lg, backgroundColor: c.ink },
  momentBadge: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.inkSoft, alignItems: "center", justifyContent: "center" },
  momentFigure: { color: c.lime, fontSize: theme.type.lead.size, fontWeight: "800", letterSpacing: -0.2, ...tabular },
  momentKicker: { color: "#A9B3A2", fontSize: theme.type.caption.size, ...tabular },
  momentBody: { color: c.onInk, fontSize: theme.type.label.size, lineHeight: 20 },
  momentLink: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 },
  momentLinkText: { color: c.lime, fontSize: theme.type.caption.size, fontWeight: "600" },
});
