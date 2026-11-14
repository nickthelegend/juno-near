import * as Clipboard from "expo-clipboard";
import { Image as ExpoImage } from "expo-image";
import { useRouter } from "expo-router";
import { useMemo, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import { AreaChart, RANGES, withinRange, type Range } from "../../components/AreaChart";
import { CoinArt, Identicon } from "../../components/art";
import { Object3D } from "../../components/art3d";
import { Tappable } from "../../components/Press";
import { WalletCard } from "../../components/WalletCard";
import { Handle } from "../../components/Handle";
import { Button, Delta, ExternalGlyph, Placeholder, Pill, Segmented, Skeleton } from "../../components/kit";
import { juno, type Coin } from "../../lib/api";
import { useLinkedState } from "../../lib/linked";
import { money, since, tokens, useApi } from "../../lib/useApi";
import { displayAddress, explorer, EXPLORER_NAME, NETWORK_LABEL, NETWORK_NAME, sameAddress } from "../../lib/chain";
import { useWallet } from "../../lib/wallet";
import { useFeedRevision } from "../../lib/refresh";
import { theme } from "../../theme";

type Tab = "holdings" | "posts" | "activity";

const TABS = [
  { id: "holdings" as const, label: "Holdings" },
  { id: "posts" as const, label: "Posts" },
  { id: "activity" as const, label: "Activity" },
];

const c = theme.colors;

/**
 * Profile and portfolio.
 *
 * Read top to bottom it answers the questions in the order someone asks them:
 * who is this, what is it worth, how has that moved, what is it made of, what
 * have they posted, what have they done. One ink statement carries the money
 * (NEAR plus post coins, both read from NEAR testnet); everything below it is
 * on the app's white cards.
 *
 * Holdings come from chain. Cost does not exist on-chain, so it is derived from
 * this wallet's own decoded trades — which means a position acquired any other
 * way has a balance but no cost, and shows a dash rather than a fabricated
 * zero. A zero cost would imply the whole holding is profit.
 *
 * The value chart is reconstructed the same way: every balance change is a
 * trade, every price is the trade that set it. A point per trade rather than
 * per interval, because no price was observed in between.
 */
export default function ProfileScreen() {
  const wallet = useWallet();
  const router = useRouter();
  const revision = useFeedRevision();
  const [tab, setTab] = useLinkedState<Tab>(
    "tab",
    TABS.map((option) => option.id),
    "holdings",
  );
  const [range, setRange] = useState<Range>("ALL");
  const [copied, setCopied] = useState(false);
  // Yoga on iOS gives a percentage-wide tile no height from aspectRatio, so tiles are sized from the grid's width.
  const [tileW, setTileW] = useState<number | null>(null);

  const portfolio = useApi(
    async () => (wallet.address ? juno.portfolio(wallet.address) : null),
    [wallet.address, revision],
  );
  // This account's own posts: every post on the factory whose creator is this wallet.
  const posts = useApi(
    async () => (wallet.address ? (await juno.coins()).coins.filter((coin) => sameAddress(coin.creator.wallet, wallet.address)) : []),
    [wallet.address, revision],
  );

  const data = portfolio.data;
  const held = useMemo(() => (data?.positions ?? []).filter((position) => position.balance > 0), [data?.positions]);
  const currency = data?.currency ?? "NEAR";
  const pnl =
    !data || data.totalPnl === null || (data.partial && data.positions.length === 0) ? null : data.totalPnl;
  const holdingsValue = !data || data.totalValue === null || (data.partial && data.positions.length === 0) ? null : data.totalValue;

  const series = useMemo(() => withinRange(data?.history ?? [], range), [data?.history, range]);
  const volumes = useMemo(() => {
    if (!data) return [];
    const byTime = new Map<string, number>();
    for (const position of data.positions) {
      for (const trade of position.trades) byTime.set(trade.t, (byTime.get(trade.t) ?? 0) + trade.base * trade.price);
    }
    return series.map((point) => byTime.get(point.t) ?? 0);
  }, [data, series]);

  const trades = useMemo(
    () =>
      (data?.positions ?? [])
        .flatMap((p) => p.trades.map((t) => ({ ...t, name: p.name, symbol: p.symbol, currency: p.currency, mint: p.baseMint })))
        .sort((a, b) => Date.parse(b.t) - Date.parse(a.t))
        .slice(0, 25),
    [data?.positions],
  );

  if (!wallet.ready) {
    return (
      <Page edges={["top"]}>
        <View style={{ padding: 16, gap: 14 }}>
          <Skeleton h={64} round={32} w={64} />
          <Skeleton h={220} round={30} />
        </View>
      </Page>
    );
  }

  if (!wallet.address) {
    return (
      <Page edges={["top"]}>
        <Placeholder
          art
          title="Not signed in"
          detail={
            wallet.walletName === "Test wallet"
              ? `One tap signs in with Juno's test wallet. It shows every transaction before it signs. ${NETWORK_LABEL}.`
              : wallet.walletLogin
                ? `Sign in with your email, or connect a NEAR wallet you already have. ${NETWORK_LABEL}.`
                : `Sign in with your email. Juno makes you a NEAR account, with no seed phrase; the key stays on this device. ${NETWORK_LABEL}.`
          }
          action={<Button label="Sign in" onPress={() => void wallet.connect().catch(() => undefined)} />}
        />
      </Page>
    );
  }

  const address = wallet.address;
  const copy = async () => {
    await Clipboard.setStringAsync(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  return (
    <Page edges={["top"]}>
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 130, gap: 14 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={portfolio.refreshing}
            onRefresh={() => {
              portfolio.refresh();
              posts.refresh();
            }}
            tintColor={c.muted}
          />
        }
      >
        {/* Identity: avatar, name, wallet, address. */}
        <View style={styles.identity}>
          <View style={styles.avatarRing}>
            <Identicon seed={address} size={58} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
            <Text style={styles.name} numberOfLines={1}>
              <Handle wallet={address} />
            </Text>
            <Text style={styles.sub} numberOfLines={1}>
              {wallet.walletName ?? (wallet.via === "email" ? "Email account" : "NEAR wallet")} · {NETWORK_NAME}
            </Text>
            <Tappable onPress={() => void copy()} to={0.96} accessibilityRole="button" accessibilityLabel="Copy account">
              <View style={styles.addressChip}>
                <Text style={styles.addressText} numberOfLines={1}>{copied ? "Copied" : displayAddress(address)}</Text>
              </View>
            </Tappable>
          </View>
          <Tappable onPress={() => void Linking.openURL(explorer("address", address))} to={0.92} accessibilityRole="link" accessibilityLabel={`This account on ${EXPLORER_NAME}`}>
            <View style={styles.iconButton}>
              <ExternalGlyph size={18} color={c.text} />
            </View>
          </Tappable>
        </View>

        {/* Social proof row: what this account has made and holds, at a glance. */}
        <View style={styles.counts}>
          <Count value={posts.data ? String(posts.data.length) : posts.loading ? "…" : "—"} label="Posts" />
          <View style={styles.countRule} />
          <Count value={data ? String(held.length) : portfolio.loading ? "…" : "—"} label="Holdings" />
          <View style={styles.countRule} />
          <Count value={data ? String(data.positions.reduce((n, p) => n + p.trades.length, 0)) : portfolio.loading ? "…" : "—"} label="Trades" />
        </View>

        <WalletCard address={address} holdings={holdingsValue} pnl={pnl} pnlPct={data?.totalPnlPct ?? null} loading={portfolio.loading} />

        {data?.partial ? (
          <Pill
            label={data.positions.length === 0 ? "Some pools could not be read — holdings unknown" : "Some pools could not be read — this may not be everything"}
            tone="neg"
          />
        ) : null}

        {/* How the coins' value has moved, trade by trade. */}
        <View style={styles.card}>
          <View style={styles.cardHead}>
            <View style={{ gap: 2 }}>
              <Text style={styles.cardTitle}>Portfolio</Text>
              <Text style={styles.cardSub}>Your post coins, priced at each trade</Text>
            </View>
          </View>
          <View style={{ alignItems: "center", marginVertical: 8 }}>
            <Segmented items={RANGES} value={range} onChange={setRange} />
          </View>
          {portfolio.loading ? (
            <Skeleton h={150} round={16} />
          ) : (
            <AreaChart
              points={series}
              bars={volumes}
              format={(v) => money(v, currency, { compact: true })}
              emptyLabel={
                data?.partial
                  ? "Some pools would not load — history unknown."
                  : data?.positions.length && data.history.length === 0
                    ? "Historical values are unavailable for transferred records."
                    : "Your first buy starts this chart."
              }
            />
          )}
        </View>

        {/* Holdings · Posts · Activity, as a segmented switch on the sage. */}
        <View style={styles.tabs}>
          {TABS.map((option) => {
            const on = tab === option.id;
            return (
              <Pressable key={option.id} onPress={() => setTab(option.id)} accessibilityRole="tab" accessibilityState={{ selected: on }} style={[styles.tab, on ? styles.tabOn : null]}>
                <Text style={[styles.tabText, on ? styles.tabTextOn : null]}>{option.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {tab === "holdings" ? (
          portfolio.loading ? (
            <View style={styles.card}>
              <Skeleton h={44} />
              <Skeleton h={44} />
            </View>
          ) : portfolio.error ? (
            <View style={styles.card}>
              <Text style={[styles.body, { color: c.neg }]}>{portfolio.error}</Text>
            </View>
          ) : !data ? (
            <View style={styles.card}>
              <Text style={styles.body}>Holdings could not be read.</Text>
            </View>
          ) : held.length === 0 ? (
            <Empty art={data.partial ? "warning" : "heartCoin"} text={data.partial ? "Some pools would not load, so whether this wallet holds anything is unknown. Pull to retry." : "Nothing held yet. Bid in an opening or buy on the curve and it shows up here."} />
          ) : (
            <View style={styles.list}>
              {held.map((position, i) => {
                return (
                  <Tappable key={position.baseMint} onPress={() => router.push(`/coin/${position.baseMint}` as never)} to={0.985}>
                    <View style={[styles.holding, i > 0 ? styles.ruled : null]}>
                      <CoinArt
                        uri={position.mediaUrl ? juno.still({ kind: position.mediaMime?.startsWith("video") ? "video" : "image", url: position.mediaUrl }) : null}
                        seed={position.baseMint}
                        size={44}
                        radius={12}
                      />
                      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                        <Text style={styles.rowTitle} numberOfLines={1}>{position.name}</Text>
                        <Text style={styles.rowSub} numberOfLines={1}>
                          {tokens(position.balance)} ${position.symbol} · {money(position.price, position.currency)}
                        </Text>
                      </View>
                      <View style={{ alignItems: "flex-end", gap: 2 }}>
                        <Text style={styles.rowValue}>{money(position.value, position.currency)}</Text>
                        <Delta pct={position.unrealisedPnlPct} />
                      </View>
                    </View>
                    <Text style={styles.rowFoot} numberOfLines={1}>
                      {position.averageCost === null ? "No recorded cost" : `Avg cost ${money(position.averageCost, position.currency, { compact: false })}`}
                      {` · floor redeems ${money(position.floorValue, position.currency, { compact: false })}`}
                    </Text>
                  </Tappable>
                );
              })}
            </View>
          )
        ) : tab === "posts" ? (
          posts.loading ? (
            <View style={styles.grid}>
              <Skeleton h={160} round={18} w="48%" />
              <Skeleton h={160} round={18} w="48%" />
            </View>
          ) : posts.error ? (
            <View style={styles.card}>
              <Text style={[styles.body, { color: c.neg }]}>{posts.error}</Text>
            </View>
          ) : (posts.data ?? []).length === 0 ? (
            <Empty art="postCoin" text="No posts yet. Post a photo and it launches its own coin, opening with a sealed-bid auction." action={<Button label="Post a photo" onPress={() => router.push("/(tabs)/post" as never)} />} />
          ) : (
            <View style={styles.grid} onLayout={(e) => setTileW(Math.floor((e.nativeEvent.layout.width - 10) / 2))}>
              {(posts.data ?? []).map((coin) => (
                <PostTile key={coin.address} coin={coin} width={tileW} onPress={() => router.push(`/coin/${coin.address}` as never)} />
              ))}
            </View>
          )
        ) : trades.length === 0 ? (
          <Empty art="curve" text={portfolio.loading ? "Reading your trades from NEAR testnet…" : "No trades yet."} />
        ) : (
          <View style={styles.list}>
            {trades.map((trade, i) => (
              <Tappable key={`${trade.t}-${i}`} onPress={() => router.push(`/coin/${trade.mint}` as never)} to={0.985}>
                <View style={[styles.holding, i > 0 ? styles.ruled : null]}>
                  <View style={[styles.side, { backgroundColor: trade.side === "buy" ? c.posSoft : c.negSoft }]}>
                    <Text style={[styles.sideText, { color: trade.side === "buy" ? c.pos : c.neg }]}>{trade.side === "buy" ? "Buy" : "Sell"}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                    <Text style={styles.rowTitle} numberOfLines={1}>{trade.name}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {tokens(trade.base)} ${trade.symbol} at {money(trade.price, trade.currency, { compact: false })}
                    </Text>
                  </View>
                  <Text style={styles.when}>{since(trade.t)} ago</Text>
                </View>
              </Tappable>
            ))}
          </View>
        )}

        {/* The account itself, last. */}
        <View style={styles.footer}>
          <Text style={styles.body}>
            {wallet.via === "wallet"
              ? wallet.walletName === "Test wallet"
                ? `A Juno test account on ${NETWORK_NAME}. Every call shows on the approval sheet first, and the account pays its own deposits and gas.`
                : `Your own NEAR account on ${NETWORK_NAME}. You approve every call in ${wallet.walletName ?? "your wallet"} and pay its gas and deposit; Juno never sees its key.`
              : `A named NEAR account on ${NETWORK_NAME}. Its key was generated on this device and stays here; the Juno relayer only submits the transactions you sign, as NEP-366 meta transactions, and pays their gas.`}
          </Text>
          <View style={{ flexDirection: "row", gap: 10 }}>
            <Button label={EXPLORER_NAME} variant="quiet" onPress={() => void Linking.openURL(explorer("address", address))} style={{ flex: 1 }} />
            <Button label="Sign out" variant="quiet" onPress={() => void wallet.disconnect()} style={{ flex: 1 }} />
          </View>
        </View>
      </ScrollView>
    </Page>
  );
}

function Count({ value, label }: { value: string; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 1 }}>
      <Text style={styles.countValue}>{value}</Text>
      <Text style={styles.countLabel}>{label}</Text>
    </View>
  );
}

function Empty({ art, text, action }: { art: "warning" | "heartCoin" | "curve" | "postCoin"; text: string; action?: React.ReactNode }) {
  return (
    <View style={[styles.card, { flexDirection: "row", alignItems: "center", gap: 14, flexWrap: "wrap" }]}>
      <Object3D art={art} alt="" size={56} />
      <Text style={[styles.body, { flex: 1, minWidth: 160 }]}>{text}</Text>
      {action ? <View style={{ flexBasis: "100%" }}>{action}</View> : null}
    </View>
  );
}

/** One of this account's posts: its photo, where it is in its life, and its price. */
function PostTile({ coin, width, onPress }: { coin: Coin; width: number | null; onPress: () => void }) {
  const still = juno.still(coin.media);
  const n = coin.near;
  const live = n.phase === "commit" || n.phase === "reveal" || n.phase === "settle";
  const stage =
    n.phase === "commit" ? "Bidding" : n.phase === "reveal" ? "Revealing" : n.phase === "settle" ? "Ready to settle" : n.phase === "graduated" ? "Graduated" : "On the curve";
  return (
    <Tappable onPress={onPress} to={0.97} style={[styles.tile, width ? { width } : null]} accessibilityRole="button" accessibilityLabel={`${coin.name}, ${stage}`}>
      <View style={[styles.tileMedia, width ? { height: width } : null]}>
        {still ? <ExpoImage source={{ uri: still }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Identicon seed={coin.address} size={64} />}
        <View style={[styles.stage, live ? { backgroundColor: c.lime } : null]}>
          <Text style={[styles.stageText, live ? { color: c.onLime } : null]}>{stage}</Text>
        </View>
      </View>
      <View style={{ paddingHorizontal: 10, paddingVertical: 8, gap: 1 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{coin.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          ${coin.symbol} · {live ? `${n.sealedBids} sealed ${n.sealedBids === 1 ? "bid" : "bids"}` : money(coin.priceQuote ?? coin.priceUsd, "NEAR")}
        </Text>
      </View>
    </Tappable>
  );
}

const Page = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(p) => p.theme.colors.bg};
`;

const tabular = { fontVariant: ["tabular-nums" as const] };

const styles = StyleSheet.create({
  identity: { flexDirection: "row", alignItems: "center", gap: 14, paddingTop: 10 },
  avatarRing: { padding: 3, borderRadius: 40, backgroundColor: c.lime },
  name: { fontSize: theme.type.heading.size, lineHeight: theme.type.heading.height, letterSpacing: theme.type.heading.tracking, fontWeight: "800", color: c.text },
  sub: { fontSize: theme.type.caption.size, fontWeight: "600", color: c.muted },
  addressChip: { alignSelf: "flex-start", marginTop: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, backgroundColor: c.surface },
  addressText: { fontSize: theme.type.caption.size, fontWeight: "700", color: c.text, ...tabular },
  iconButton: { width: 44, height: 44, borderRadius: 22, backgroundColor: c.surface, alignItems: "center", justifyContent: "center" },
  counts: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderRadius: theme.radius.lg, backgroundColor: c.surface },
  countRule: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: c.lineStrong },
  countValue: { fontSize: theme.type.title.size, fontWeight: "800", color: c.text, letterSpacing: -0.3, ...tabular },
  countLabel: { fontSize: theme.type.caption.size, fontWeight: "600", color: c.muted },
  card: { backgroundColor: c.surface, borderRadius: theme.radius.lg, padding: 16, gap: 10, ...theme.shadow.card },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  cardTitle: { fontSize: theme.type.title.size, fontWeight: "800", color: c.text, letterSpacing: -0.4 },
  cardSub: { fontSize: theme.type.caption.size, fontWeight: "500", color: c.muted },
  tabs: { flexDirection: "row", padding: 4, borderRadius: 999, backgroundColor: "rgba(18,21,14,0.06)", gap: 4 },
  tab: { flex: 1, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: c.ink },
  tabText: { fontSize: theme.type.label.size, fontWeight: "700", color: c.muted },
  tabTextOn: { color: c.lime },
  list: { backgroundColor: c.surface, borderRadius: theme.radius.lg, paddingHorizontal: 14, paddingVertical: 4, ...theme.shadow.card },
  holding: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12, paddingBottom: 6 },
  ruled: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: c.lineStrong },
  thumb: { width: 44, height: 44, borderRadius: 12, backgroundColor: c.surfaceAlt },
  thumbArt: { width: 44, height: 44, borderRadius: 12, overflow: "hidden", backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: theme.type.label.size + 1, fontWeight: "800", color: c.text, letterSpacing: -0.2 },
  rowSub: { fontSize: theme.type.caption.size, fontWeight: "600", color: c.muted, ...tabular },
  rowValue: { fontSize: theme.type.label.size + 1, fontWeight: "800", color: c.text, ...tabular },
  rowFoot: { fontSize: theme.type.micro.size, fontWeight: "600", color: c.faint, paddingLeft: 56, paddingBottom: 10, ...tabular },
  side: { width: 44, height: 30, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  sideText: { fontSize: theme.type.caption.size, fontWeight: "800" },
  when: { fontSize: theme.type.caption.size, fontWeight: "600", color: c.faint, ...tabular, paddingBottom: 6 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10, justifyContent: "space-between" },
  tile: { width: 160, borderRadius: theme.radius.lg, overflow: "hidden", backgroundColor: c.surface, ...theme.shadow.card },
  tileMedia: { height: 160, backgroundColor: c.surfaceAlt, alignItems: "center", justifyContent: "center" },
  stage: { position: "absolute", left: 8, top: 8, paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: "rgba(18,21,14,0.72)" },
  stageText: { fontSize: theme.type.micro.size, fontWeight: "800", color: c.onInk },
  body: { fontSize: theme.type.label.size, lineHeight: 20, color: c.muted },
  footer: { gap: 12, paddingTop: 6 },
});
