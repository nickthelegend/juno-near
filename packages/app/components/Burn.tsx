import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Linking, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";

import { CoinGlyph } from "./art";
import { BrandImage } from "./brand";
import { Button, Skeleton } from "./kit";
import { Tappable } from "./Press";
import { juno, type BurnEvent, type Burns, type BurnOracleStatus, type Coin, type FlushQuote } from "../lib/api";
import { describeTxError, EXPLORER_NAME, explorer, IS_FORK } from "../lib/chain";
import { useWallet } from "../lib/wallet";
import { useReducedMotion } from "../lib/motion";
import { amountOf, money, since, splitAmount, useApi, type AsyncState } from "../lib/useApi";
import { theme } from "../theme";

/**
 * $WIF leaving supply, as the contracts recorded it.
 *
 * Every number on these surfaces is read from the chain: the factory's
 * `totalWifBurned`, each curve's `tradeWifBurned` / `graduationWifBurned`,
 * and the `WifBurned` / `TrackerBurnFlushed` logs the indexer stored. When
 * the read fails the panel says so; when nothing has burned it says that.
 * It never shows a number it did not read.
 */

const c = theme.colors;
const POLL_MS = 8_000;

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

/** The burn counter, re-read every few seconds while mounted. Keeps the last good read while refreshing. */
export function useBurns(limit = 12): AsyncState<Burns> {
  const state = useApi(() => juno.burns(limit), [limit]);
  const refresh = useRef(state.refresh);
  refresh.current = state.refresh;
  useEffect(() => {
    const id = setInterval(() => refresh.current(), POLL_MS);
    return () => clearInterval(id);
  }, []);
  return state;
}

/** A 503 carrying "Setup required" is a deployment gap, not an outage: say which. */
function isSetup(state: AsyncState<unknown>): boolean {
  return state.errorStatus === 503 && /setup required/i.test(state.error ?? "");
}

export function kindLabel(event: BurnEvent): string {
  if (event.kind === "graduation") return "Graduation burn · 10% of the reserve";
  if (event.kind === "flush") {
    return `Tracker flush · ${amountOf(event.usdgSwapped ?? null, "USDG")} → WIF`;
  }
  return "Trade fee · half of the WIF fee";
}

/* ------------------------------------------------------------------ */
/* Glyph                                                               */
/* ------------------------------------------------------------------ */

/** A flame, on the app's 24-unit grid at the 1.9 stroke. Means one thing: WIF burned. */
export function FlameGlyph({ size = 16, color = c.burnInk, filled = false }: { size?: number; color?: string; filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 21.2c-4 0-6.9-2.8-6.9-6.6 0-3.5 2.4-5.6 3.8-8.4.3 1.9 1.2 3.1 2.5 3.8.2-3.1 1.6-5.6 3.9-7.2-.2 2.8.9 4.6 2.4 6.4 1.2 1.5 2.1 3.1 2.1 5.3 0 3.9-3 6.7-7.8 6.7z"
        fill={filled ? color : "none"}
        stroke={color}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
      {filled ? (
        <Path d="M12 19c-1.6 0-2.7-1-2.7-2.5 0-1.4 1-2.3 1.6-3.4.5 1 1.1 1.5 1.8 1.8.4-.8.8-1.4 1.4-1.9.6 1 1 1.9 1 2.9 0 1.8-1.3 3.1-3.1 3.1z" fill={c.ink} />
      ) : null}
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

function InfoGlyph({ size = 18, color = c.muted }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.9} />
      <Path d="M12 11v5.5M12 7.6v.2" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */
/* The counter                                                         */
/* ------------------------------------------------------------------ */

/**
 * The total, ticking up to a new read.
 *
 * The one piece of motion on this surface: when a new burn lands the figure
 * counts from the old total to the new one over 700ms. Under reduced motion it
 * just changes. The figure it settles on is always the exact read.
 */
function useTicking(target: string | null): string | null {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(target);
  const from = useRef<string | null>(target);
  useEffect(() => {
    if (target === null) return;
    const start = Number(from.current ?? target);
    const end = Number(target);
    from.current = target;
    if (reduced || !(end > start) || start === 0) {
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
        setShown((start + (end - start) * eased).toFixed(18));
        raf = requestAnimationFrame(step);
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, reduced]);
  return shown;
}

/**
 * The ink panel: all-time WIF burned, its split, and the newest burn.
 *
 * `compact` drops the split and the latest-burn row, for a header strip.
 */
export function BurnPanel({
  burns,
  onSeeAll,
}: {
  burns: AsyncState<Burns>;
  onSeeAll?: () => void;
}) {
  const router = useRouter();
  const data = burns.data;
  const shown = useTicking(data?.totalWifBurned ?? null);

  if (!data) {
    if (burns.loading) {
      return (
        <View style={s.panel} accessibilityLabel="Reading the burn counter">
          <Text style={s.panelLabel}>WIF burned on Juno</Text>
          <Skeleton h={40} w="70%" style={{ backgroundColor: c.inkSoft, marginTop: 12 }} />
          <Skeleton h={14} w="45%" style={{ backgroundColor: c.inkSoft, marginTop: 12 }} />
        </View>
      );
    }
    const setup = isSetup(burns);
    return (
      <View style={s.panel}>
        <Row>
          <FlameGlyph color={c.ember} />
          <Text style={s.panelLabel}>{setup ? "Setup required" : "Could not read the burn counter"}</Text>
        </Row>
        <Text style={s.panelDetail}>{burns.error ?? "The API did not answer."}</Text>
        {setup ? null : (
          <Button label="Try again" variant="lime" onPress={burns.refresh} style={{ alignSelf: "flex-start", marginTop: 14 }} />
        )}
      </View>
    );
  }

  const total = splitAmount(shown ?? data.totalWifBurned, 4);
  const totalNumber = Number(data.totalWifBurned);
  const usd = data.wifUsd !== null && totalNumber > 0 ? totalNumber * data.wifUsd : null;
  const latest = data.events[0] ?? null;

  return (
    <View style={s.panel}>
      <Row justify="space-between">
        <Row>
          <FlameGlyph color={c.ember} filled />
          <Text style={s.panelLabel}>WIF burned on Juno</Text>
        </Row>
        <View style={s.livePill} accessibilityLabel={burns.error ? "Stale: the last read failed" : "Live: re-read every few seconds"}>
          <View style={[s.liveDot, burns.error ? { backgroundColor: c.neg } : null]} />
          <Text style={s.liveText}>{burns.error ? "Stale" : "Live"}</Text>
        </View>
      </Row>

      <View style={s.figureRow}>
        <Text
          style={[s.figure, { flexShrink: 1 }]}
          accessibilityLabel={`${data.totalWifBurned} WIF burned`}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          {total.whole}
          <Text style={s.figureFrac}>.{total.frac}</Text>
          <Text style={s.figureUnit}> WIF</Text>
        </Text>
        <View style={s.coin}>
          <BrandImage art="flameCoin" alt="" size={76} float="drift" eager />
        </View>
      </View>
      <Text style={s.panelDetail}>
        {usd !== null
          ? `≈ ${money(usd, "USD")} at the WIF/WETH pool price. `
          : ""}
        {IS_FORK ? "Local fork: mainnet supply is unaffected. " : ""}
        Block {data.asOfBlock.toLocaleString("en-US")}.
      </Text>

      <View style={s.split}>
        <SplitFigure label="From trade fees" value={data.tradeWifBurned} hint="incl. tracker flushes" />
        <View style={s.splitRule} />
        <SplitFigure label="From graduations" value={data.graduationWifBurned} hint="10% of each reserve" />
      </View>

      {latest ? (
        <Tappable
          onPress={() => router.push(`/coin/${latest.token}` as never)}
          to={0.98}
          accessibilityRole="link"
          accessibilityLabel={`Latest burn: ${amountOf(latest.amount, "WIF")} on $${latest.symbol}, ${since(latest.timestamp)} ago. Open the coin.`}
          style={s.latest}
        >
          <CoinGlyph seed={latest.token} size={36} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.latestTitle} numberOfLines={1}>
              {amountOf(latest.amount, "WIF")} burned · ${latest.symbol}
            </Text>
            <Text style={s.latestDetail} numberOfLines={1}>
              {kindLabel(latest)} · {since(latest.timestamp)} ago
            </Text>
          </View>
          <ArrowOut />
        </Tappable>
      ) : (
        <View style={[s.latest, { paddingVertical: 14 }]}>
          <Text style={[s.latestDetail, { flex: 1 }]}>
            Nothing has burned yet. The first WIF trade burns half of its fee.
          </Text>
        </View>
      )}

      {onSeeAll && data.events.length > 0 ? (
        <Pressable onPress={onSeeAll} accessibilityRole="link" style={s.seeAll} hitSlop={6}>
          <Text style={s.seeAllText}>Every burn, with its transaction</Text>
          <ArrowOut color={c.lime} />
        </Pressable>
      ) : null}
    </View>
  );
}

function SplitFigure({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Text style={s.splitLabel}>{label}</Text>
      <Text style={s.splitValue} numberOfLines={1}>
        {amountOf(value, "WIF")}
      </Text>
      <Text style={s.splitHint}>{hint}</Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* The list                                                            */
/* ------------------------------------------------------------------ */

type Filter = "all" | BurnEvent["kind"];
const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "trade", label: "Trades" },
  { id: "graduation", label: "Graduations" },
  { id: "flush", label: "Flushes" },
];

/** Filter chips: ink on white for the active one, outline for the rest, 44pt tall. */
export function BurnFilters({ value, onChange }: { value: Filter; onChange: (f: Filter) => void }) {
  return (
    <View style={s.chips} accessibilityRole="tablist">
      {FILTERS.map((f) => {
        const on = f.id === value;
        return (
          <Pressable
            key={f.id}
            onPress={() => onChange(f.id)}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            style={[s.chip, on ? s.chipOn : null]}
          >
            <Text style={[s.chipText, on ? s.chipTextOn : null]}>{f.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One burn: the coin, what kind of burn, how much, when. Opens the transaction. */
export function BurnRow({ event, first }: { event: BurnEvent; first?: boolean }) {
  const router = useRouter();
  return (
    <View style={[s.row, first ? null : s.rowRule]}>
      <Tappable
        onPress={() => router.push(`/coin/${event.token}` as never)}
        to={0.98}
        accessibilityRole="link"
        accessibilityLabel={`$${event.symbol}: ${amountOf(event.amount, "WIF")} burned, ${kindLabel(event)}. Open the coin.`}
        style={s.rowMain}
      >
        <CoinGlyph seed={event.token} size={40} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={s.rowTitle} numberOfLines={1}>
            ${event.symbol}
            <Text style={s.rowName}> {event.name}</Text>
          </Text>
          <Text style={s.rowDetail} numberOfLines={2}>
            {kindLabel(event)}
            {event.kind === "flush" && event.bounty ? ` · ${amountOf(event.bounty, "USDG")} bounty paid` : ""}
          </Text>
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={s.rowAmount}>−{amountOf(event.amount, "WIF")}</Text>
          <Text style={s.rowAge}>{since(event.timestamp)} ago</Text>
        </View>
      </Tappable>
      <Pressable
        onPress={() => void Linking.openURL(explorer("tx", event.txHash))}
        accessibilityRole="link"
        accessibilityLabel={`Open the transaction on ${EXPLORER_NAME}`}
        style={s.txLink}
      >
        <Text style={s.txText}>
          tx {event.txHash.slice(0, 8)}…{event.txHash.slice(-6)} · block {event.blockNumber.toLocaleString("en-US")}
        </Text>
        <ArrowOut size={12} />
      </Pressable>
    </View>
  );
}

/** The newest burns on one sheet, with filter chips, and honest empty/error states. */
export function BurnList({ burns, limit }: { burns: AsyncState<Burns>; limit?: number }) {
  const [filter, setFilter] = useState<Filter>("all");
  const events = (burns.data?.events ?? []).filter((e) => filter === "all" || e.kind === filter).slice(0, limit);
  return (
    <View style={{ gap: 12 }}>
      <BurnFilters value={filter} onChange={setFilter} />
      <View style={s.sheet}>
        {!burns.data && burns.loading ? (
          <View style={{ padding: 16, gap: 10 }}>
            <Skeleton h={40} />
            <Skeleton h={40} />
          </View>
        ) : !burns.data ? (
          <View style={{ padding: 16, gap: 6 }}>
            <Text style={s.rowTitle}>{isSetup(burns) ? "Setup required" : "Could not read the burns"}</Text>
            <Text style={s.rowDetail}>{burns.error}</Text>
          </View>
        ) : events.length === 0 ? (
          <View style={{ padding: 16, gap: 6 }}>
            <Text style={s.rowTitle}>
              {filter === "all" ? "No burns yet" : `No ${FILTERS.find((f) => f.id === filter)!.label.toLowerCase()} yet`}
            </Text>
            <Text style={s.rowDetail}>
              {filter === "flush"
                ? "A flush happens when someone calls flushBurn on a stock tracker with accrued USDG."
                : filter === "graduation"
                  ? "A post's curve burns 10% of its WIF reserve when it fills and graduates."
                  : "Every buy or sell of a post burns half of its WIF fee."}
            </Text>
          </View>
        ) : (
          events.map((event, i) => <BurnRow key={`${event.txHash}:${event.logIndex}`} event={event} first={i === 0} />)
        )}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Inline                                                              */
/* ------------------------------------------------------------------ */

/** "0.42 WIF burned" beside a post's market figures. Null while unread; "0 WIF burned" is a real reading. */
export function BurnedChip({ wif, tone = "light" }: { wif: number | null | undefined; tone?: "light" | "night" }) {
  if (wif === null || wif === undefined) return null;
  const night = tone === "night";
  return (
    <View style={[s.burned, night ? s.burnedNight : null]} accessibilityLabel={`${amountOf(wif, "WIF")} burned so far`}>
      <FlameGlyph size={13} color={night ? c.ember : c.burnInk} filled={wif > 0} />
      <Text style={[s.burnedText, night ? { color: c.onNight } : null]}>{amountOf(wif, "WIF")} burned</Text>
    </View>
  );
}

/**
 * "Burned so far" on a post's own page: the curve's `wifBurned`, split into
 * trade-fee burns and the graduation burn. Hidden on trackers, whose burns
 * show in the flush card instead.
 */
export function CoinBurnRow({ coin }: { coin: Coin }) {
  const b = coin.burn;
  if (!b || coin.quote.symbol !== "WIF") return null;
  return (
    <View style={f.coinBurn} accessibilityLabel={`${amountOf(b.wifBurned, "WIF")} burned so far by this market`}>
      <View style={f.coinBurnIcon}>
        <FlameGlyph size={20} filled={b.wifBurned > 0} />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={f.coinBurnFigure} numberOfLines={1}>
          {amountOf(b.wifBurned, "WIF")} burned so far
        </Text>
        <Text style={f.coinBurnDetail}>
          {b.wifBurned === 0
            ? "Half of the WIF fee on every buy and sell burns. Nothing has traded yet."
            : `${amountOf(b.tradeWifBurned, "WIF")} from trade fees${b.graduationWifBurned > 0 ? ` · ${amountOf(b.graduationWifBurned, "WIF")} at graduation` : " · 10% of the reserve burns at graduation"}`}
        </Text>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Flush the burn (stock trackers)                                     */
/* ------------------------------------------------------------------ */

type FlushDone = { hash: string; event: BurnEvent | null };

/**
 * `flushBurn` on a tracker, for anyone.
 *
 * A tracker trades in USDG, so its burn share cannot burn WIF directly: it
 * accrues on the curve. Calling `flushBurn` swaps up to 25 USDG of it through
 * the live USDG/WETH and WETH/WIF pools, burns the WIF, and pays the caller 1%
 * of the batch (at most 0.25 USDG). The three tiles are the contract's own
 * numbers; "Burns now" is the server's simulation of this caller's call.
 */
export function FlushBurn({ coin, onFlushed, compact = false }: { coin: Coin; onFlushed?: () => void; compact?: boolean }) {
  const wallet = useWallet();
  const pending = coin.burn?.pendingBurnQuote ?? null;
  const flush = coin.burn?.flush ?? null;
  const [quote, setQuote] = useState<FlushQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [oracle, setOracle] = useState<BurnOracleStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<FlushDone | null>(null);

  useEffect(() => {
    let alive = true;
    if (flush) juno.burnOracleStatus(coin.pool).then((status) => { if (alive) setOracle(status); }).catch(() => {});
    return () => { alive = false; };
  }, [coin.pool, flush?.batchQuote]);
  const warming = oracle && !oracle.ready
    ? oracle.waitMinutes > 0 ? `Burn opens in ${oracle.waitMinutes} min — the price history is still filling` : "Burn opens once the WIF pool has 30 minutes of price history"
    : null;

  // The exact WIF a flush burns depends on the pools at this block: quote it
  // for the signed-in caller, the account the simulation runs as.
  useEffect(() => {
    let alive = true;
    setQuote(null);
    setQuoteError(null);
    if (!wallet.address || !flush || compact || warming) return;
    juno
      .buildFlush({ curve: coin.pool, from: wallet.address })
      .then((built) => alive && setQuote(built.quote))
      .catch((caught: unknown) => alive && setQuoteError(caught instanceof Error ? caught.message : "Could not quote the flush"));
    return () => {
      alive = false;
    };
  }, [wallet.address, coin.pool, flush?.batchQuote, compact, warming]);

  if (pending === null) return null;

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const from = wallet.address ?? (await wallet.connect());
      const built = await juno.buildFlush({ curve: coin.pool, from });
      const sent = await wallet.send(built.steps, { chainId: built.chainId });
      const hash = sent.hashes[sent.hashes.length - 1]!;
      // Read the burn back from the indexed logs, so the receipt shows what
      // the contract burned rather than what was quoted.
      let event: BurnEvent | null = null;
      for (let attempt = 0; attempt < 6 && !event; attempt += 1) {
        const burns = await juno.burns(30).catch(() => null);
        event = burns?.events.find((e) => e.txHash.toLowerCase() === hash.toLowerCase()) ?? null;
        if (!event) await new Promise((r) => setTimeout(r, 1500));
      }
      setDone({ hash, event });
      onFlushed?.();
    } catch (caught) {
      const failure = describeTxError(caught);
      setError(failure.cancelled ? null : failure.message || "The flush failed");
    } finally {
      setBusy(false);
    }
  }

  const receipt = done ? (
    <Pressable
      onPress={() => void Linking.openURL(explorer("tx", done.hash))}
      accessibilityRole="link"
      style={f.receipt}
    >
      <FlameGlyph size={14} filled />
      <Text style={f.receiptText} numberOfLines={2}>
        {done.event
          ? `Burned ${amountOf(done.event.amount, "WIF")} · you earned ${amountOf(done.event.bounty ?? null, "USDG")}`
          : "Flushed. The indexer has not stored the burn yet."}{" "}
        · tx {done.hash.slice(0, 8)}…{done.hash.slice(-6)}
      </Text>
      <ArrowOut size={12} />
    </Pressable>
  ) : null;

  if (compact) {
    return (
      <View style={f.compact}>
        <FlameGlyph size={14} filled={pending > 0} />
        <Text style={f.compactText} numberOfLines={2}>
          {pending > 0
            ? `${amountOf(pending, "USDG")} waiting to burn as WIF${flush ? ` · flush pays ${amountOf(flush.bountyQuote, "USDG")}` : ""}`
            : "Nothing waiting to burn. Each trade adds half its fee."}
        </Text>
        {flush && !done ? (
          <Pressable
            onPress={() => void run()}
            disabled={busy || !!warming}
            accessibilityRole="button"
            accessibilityLabel={`Flush the burn on $${coin.symbol} and earn ${amountOf(flush.bountyQuote, "USDG")}`}
            style={[f.compactButton, busy || warming ? { opacity: 0.5 } : null]}
          >
            <Text style={f.compactButtonText}>{busy ? "Flushing…" : "Flush"}</Text>
          </Pressable>
        ) : null}
        {warming ? <Text style={[f.body, { flexBasis: "100%" }]}>{warming}</Text> : null}
        {receipt ? <View style={{ flexBasis: "100%" }}>{receipt}</View> : null}
        {error ? <Text style={[f.error, { flexBasis: "100%" }]}>{error}</Text> : null}
      </View>
    );
  }

  return (
    <View style={f.card}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <FlameGlyph size={18} filled={pending > 0} />
        <Text style={f.title}>Flush the burn</Text>
      </View>
      <Text style={f.body}>
        Half of every fee on this tracker is set aside in USDG to buy and burn WIF. Anyone can flush it: the contract
        swaps up to {amountOf(flush?.maxBatchQuote ?? 25, "USDG")} through the live pools, burns the WIF and pays you 1%
        (at most 0.25 USDG).
      </Text>
      <View style={f.tiles}>
        <Tile label="Waiting" value={amountOf(pending, "USDG")} hint="accrued on the curve" />
        <Tile label="You earn" value={amountOf(flush ? flush.bountyQuote : 0, "USDG")} hint="bounty, paid in USDG" on={!!flush} />
        <Tile
          label="Burns now"
          value={quote ? amountOf(quote.wifOut, "WIF") : flush ? (wallet.address ? (quoteError ? "—" : "…") : "—") : "0 WIF"}
          hint={quote ? "simulated at this block" : wallet.address || !flush ? "WIF, at the pool price" : "sign in to quote"}
        />
      </View>
      {quoteError ? <Text style={f.error}>{quoteError}</Text> : null}
      {warming ? <Text style={f.body}>{warming}</Text> : null}
      {receipt}
      {flush && !done ? (
        <Button
          label={busy ? "Flushing…" : `Flush and earn ${amountOf(flush.bountyQuote, "USDG")}`}
          variant="ink"
          loading={busy}
          disabled={!!warming}
          onPress={() => void run()}
          style={{ alignSelf: "stretch" }}
        />
      ) : !flush ? (
        <Text style={f.body}>Nothing to flush yet. The next trade on this tracker adds half of its fee.</Text>
      ) : null}
      {error ? <Text style={f.error}>{error}</Text> : null}
    </View>
  );
}

function Tile({ label, value, hint, on = false }: { label: string; value: string; hint: string; on?: boolean }) {
  return (
    <View style={[f.tile, on ? f.tileOn : null]}>
      <Text style={f.tileLabel}>{label}</Text>
      <Text style={f.tileValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      <Text style={f.tileHint} numberOfLines={2}>
        {hint}
      </Text>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Graduation                                                          */
/* ------------------------------------------------------------------ */

/**
 * The moment a post's curve filled: 10% of its WIF reserve burned and the
 * rest went into a locked Uniswap v3 position. Read from the indexed
 * `Graduated` event and the `WifBurned` log in the same transaction.
 */
export function GraduationMoment({ coin }: { coin: Coin }) {
  const g = coin.graduation;
  if (!coin.curve.graduated) return null;
  const when = g ? new Date(g.timestamp) : null;
  return (
    <View style={f.moment}>
      <View style={f.momentBadge}>
        <FlameGlyph size={22} color={c.ember} filled />
      </View>
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={f.momentFigure}>
          {g ? `${amountOf(g.wifBurned, "WIF")} burned at graduation` : "Graduated"}
        </Text>
        <Text style={f.momentKicker}>
          {when
            ? `Graduated ${when.toLocaleDateString([], { day: "numeric", month: "short" })}, ${when.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "The graduation transaction is not indexed yet."}
        </Text>
        <Text style={f.momentBody}>
          The curve sold out. 10% of its WIF reserve burned in the graduation transaction; the rest is locked in a
          Uniswap v3 pool with the remaining tokens.
        </Text>
        {g ? (
          <Pressable onPress={() => void Linking.openURL(explorer("tx", g.txHash))} accessibilityRole="link" style={f.momentLink}>
            <Text style={f.momentLinkText}>
              tx {g.txHash.slice(0, 8)}…{g.txHash.slice(-6)} · block {g.blockNumber.toLocaleString("en-US")}
            </Text>
            <ArrowOut size={12} color={c.lime} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Stock Token notice                                                  */
/* ------------------------------------------------------------------ */

/**
 * The Stock Token restricted-jurisdictions notice.
 *
 * Shown where a tracker can be bought, not in a footer. The list follows the
 * issuer's restricted-jurisdictions page; it is not exhaustive and the page
 * is linked for the full terms.
 */
export const RESTRICTED_URL = "https://docs.robinhood.com/rhj/restricted-jurisdictions";

export function StockNotice({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <View style={s.notice}>
      <InfoGlyph />
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text style={s.noticeTitle}>Stock Tokens are not for everyone</Text>
        <Text style={s.noticeBody}>
          Not offered in the United States, Canada, the United Kingdom, Switzerland or sanctioned countries, among
          others. A tracker gives price exposure, not legal ownership of the stock or the Stock Token.
          {compact ? "" : " Check the rules where you live before you trade."}
        </Text>
        {open ? (
          <Text style={s.noticeBody}>
            The restricted list names Belarus, Cuba, Iran, Myanmar, North Korea, Russia, South Sudan, Sudan, Syria,
            Ukraine and Venezuela, and the offer is restricted in the US, Canada, the UK and Switzerland, without
            limitation.
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", flexWrap: "wrap", columnGap: 16 }}>
          <Pressable
            onPress={() => setOpen((v) => !v)}
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            style={s.noticeLink}
          >
            <Text style={s.noticeToggle}>{open ? "Hide the country list" : "Which countries"}</Text>
          </Pressable>
          <Pressable onPress={() => void Linking.openURL(RESTRICTED_URL)} accessibilityRole="link" style={s.noticeLink}>
            <Text style={s.noticeLinkText}>Restricted jurisdictions</Text>
            <ArrowOut size={12} color={c.focus} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ */

function Row({ children, justify }: { children: React.ReactNode; justify?: "space-between" }) {
  return <View style={{ flexDirection: "row", alignItems: "center", gap: 8, justifyContent: justify }}>{children}</View>;
}

const tabular = { fontVariant: ["tabular-nums" as const] };

const f = StyleSheet.create({
  coinBurn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 16,
    padding: 14,
    borderRadius: theme.radius.lg,
    backgroundColor: c.surface,
  },
  coinBurnIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.burnSoft, alignItems: "center", justifyContent: "center" },
  coinBurnFigure: { color: c.burnInk, fontSize: theme.type.lead.size, fontWeight: "800", letterSpacing: -0.2, ...tabular },
  coinBurnDetail: { color: c.muted, fontSize: theme.type.caption.size, lineHeight: 16, ...tabular },
  card: { backgroundColor: c.surface, borderRadius: theme.radius.lg, padding: 16, gap: 12, alignSelf: "stretch" },
  title: { color: c.text, fontSize: theme.type.title.size, fontWeight: "700", letterSpacing: -0.4 },
  body: { color: c.muted, fontSize: theme.type.label.size, lineHeight: 20 },
  tiles: { flexDirection: "row", gap: 8 },
  tile: { flex: 1, minWidth: 0, backgroundColor: c.surfaceAlt, borderRadius: theme.radius.md, padding: 12, gap: 2 },
  tileOn: { backgroundColor: c.limeSoft },
  tileLabel: { color: c.muted, fontSize: theme.type.caption.size, fontWeight: "600" },
  tileValue: { color: c.text, fontSize: theme.type.body.size, fontWeight: "700", ...tabular },
  tileHint: { color: c.muted, fontSize: theme.type.micro.size, lineHeight: 14 },
  error: { color: c.neg, fontSize: theme.type.caption.size, lineHeight: 17 },
  receipt: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: "rgba(180,64,10,0.28)",
    backgroundColor: c.surface,
  },
  receiptText: { flex: 1, color: c.burnInk, fontSize: theme.type.caption.size, fontWeight: "600", ...tabular },
  compact: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.md,
    backgroundColor: c.surfaceAlt,
  },
  compactText: { flex: 1, minWidth: 140, color: c.muted, fontSize: theme.type.caption.size, lineHeight: 16, ...tabular },
  compactButton: {
    minHeight: 44,
    paddingHorizontal: 16,
    borderRadius: 999,
    backgroundColor: c.ink,
    alignItems: "center",
    justifyContent: "center",
  },
  compactButtonText: { color: c.onInk, fontSize: theme.type.label.size, fontWeight: "700" },
  moment: {
    flexDirection: "row",
    gap: 14,
    padding: 18,
    borderRadius: theme.radius.lg,
    backgroundColor: c.ink,
    alignSelf: "stretch",
  },
  momentBadge: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "rgba(255,107,26,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
  momentKicker: { color: c.lime, fontSize: theme.type.caption.size, fontWeight: "700" },
  momentFigure: { color: c.onInk, fontSize: theme.type.heading.size, lineHeight: theme.type.heading.height, fontWeight: "800", letterSpacing: -0.5, ...tabular },
  momentBody: { color: "#A9B3A2", fontSize: theme.type.caption.size, lineHeight: 17 },
  momentLink: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, alignSelf: "flex-start" },
  momentLinkText: { color: c.lime, fontSize: theme.type.caption.size, fontWeight: "600", ...tabular },
});

const s = StyleSheet.create({
  figureRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  coin: { marginTop: 6, marginBottom: -16, marginRight: -4 },
  panel: {
    backgroundColor: c.ink,
    borderRadius: theme.radius.lg,
    padding: 20,
    gap: 6,
    alignSelf: "stretch",
  },
  panelLabel: { color: c.onInk, fontSize: theme.type.label.size, fontWeight: "600", letterSpacing: -0.1 },
  panelDetail: { color: "#A9B3A2", fontSize: theme.type.caption.size, lineHeight: 17 },
  livePill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: c.inkSoft,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.lime },
  liveText: { color: "#A9B3A2", fontSize: theme.type.micro.size, fontWeight: "600", ...tabular },
  figure: {
    marginTop: 10,
    color: c.lime,
    fontSize: theme.type.display.size,
    lineHeight: theme.type.display.height,
    letterSpacing: theme.type.display.tracking,
    fontWeight: "700",
    ...tabular,
  },
  figureFrac: { color: "#7C8C55", fontWeight: "600" },
  figureUnit: { color: c.onInk, fontSize: theme.type.title.size, fontWeight: "600", letterSpacing: -0.2 },
  split: {
    flexDirection: "row",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(243,247,238,0.16)",
    gap: 12,
  },
  splitRule: { width: StyleSheet.hairlineWidth, backgroundColor: "rgba(243,247,238,0.16)" },
  splitLabel: { color: "#A9B3A2", fontSize: theme.type.caption.size },
  splitValue: { color: c.onInk, fontSize: theme.type.body.size, fontWeight: "700", marginTop: 2, ...tabular },
  splitHint: { color: "#7F8A78", fontSize: theme.type.micro.size, marginTop: 1 },
  latest: {
    marginTop: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: c.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 56,
  },
  latestTitle: { color: c.text, fontSize: theme.type.label.size, fontWeight: "700", ...tabular },
  latestDetail: { color: c.muted, fontSize: theme.type.caption.size, marginTop: 1 },
  seeAll: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", minHeight: 44, marginBottom: -8 },
  seeAllText: { color: c.lime, fontSize: theme.type.label.size, fontWeight: "600" },

  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    minHeight: 44,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: c.lineStrong,
    backgroundColor: c.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: c.ink, borderColor: c.ink },
  chipText: { color: c.text, fontSize: theme.type.label.size, fontWeight: "500" },
  chipTextOn: { color: c.onInk, fontWeight: "700" },

  sheet: { backgroundColor: c.surface, borderRadius: theme.radius.lg, overflow: "hidden", alignSelf: "stretch" },
  row: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 2 },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.line },
  rowMain: { flexDirection: "row", alignItems: "center", gap: 12, minHeight: 44 },
  rowTitle: { color: c.text, fontSize: theme.type.body.size, fontWeight: "700" },
  rowName: { color: c.muted, fontSize: theme.type.label.size, fontWeight: "500" },
  rowDetail: { color: c.muted, fontSize: theme.type.caption.size, lineHeight: 16, marginTop: 2 },
  rowAmount: { color: c.burnInk, fontSize: theme.type.label.size, fontWeight: "700", ...tabular },
  rowAge: { color: c.muted, fontSize: theme.type.caption.size, marginTop: 2 },
  txLink: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingLeft: 52 },
  txText: { color: c.muted, fontSize: theme.type.micro.size, ...tabular },

  burned: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    backgroundColor: c.burnSoft,
    alignSelf: "flex-start",
  },
  burnedNight: { backgroundColor: "rgba(255,107,26,0.22)" },
  burnedText: { color: c.burnInk, fontSize: theme.type.caption.size, fontWeight: "700", ...tabular },

  notice: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: c.lineStrong,
    backgroundColor: c.surface,
    alignSelf: "stretch",
  },
  noticeTitle: { color: c.text, fontSize: theme.type.label.size, fontWeight: "700" },
  noticeBody: { color: c.muted, fontSize: theme.type.caption.size, lineHeight: 17 },
  noticeLink: { flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, alignSelf: "flex-start" },
  noticeToggle: { color: c.text, fontSize: theme.type.caption.size, fontWeight: "700" },
  noticeLinkText: {
    color: c.focus,
    fontSize: theme.type.caption.size,
    fontWeight: "600",
    ...(Platform.OS === "web" ? { textDecorationLine: "underline" as const } : null),
  },
});
