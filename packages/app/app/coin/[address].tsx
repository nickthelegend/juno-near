import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Linking, Platform, RefreshControl, ScrollView, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Svg, { Path, Rect } from "react-native-svg";
import styled from "styled-components/native";

import { CoinGlyph, Identicon } from "../../components/art";
import { AuctionCard, DareCard, FloorGlyph, GraduationMoment, PhaseChip, AuctionBar } from "../../components/Floor";
import { DepthChart } from "../../components/DepthChart";
import { Handle } from "../../components/Handle";
import { PriceLine } from "../../components/PriceLine";
import { Tappable } from "../../components/Press";
import { TradeSheet } from "../../components/TradeSheet";
import {
  Body,
  Button,
  Caption,
  Card,
  ChevronLeft,
  Col,
  ExternalGlyph,
  Label,
  Mono,
  Pill,
  Placeholder,
  Row,
  Skeleton,
  Stat,
  Title,
} from "../../components/kit";
import { ApiError, juno } from "../../lib/api";
import {
  describeTxError,
  displayAddress,
  explorer,
  EXPLORER_NAME,
  FACTORY,
  NETWORK_NAME,
  sameAddress,
  shortAddress,
  validAddress,
} from "../../lib/chain";
import { money, since, tokens, useApi } from "../../lib/useApi";
import { shareCoin } from "../../lib/social";
import { useWallet } from "../../lib/wallet";
import { useLifecycle } from "../../lib/useLifecycle";
import { useFeedRevision } from "../../lib/refresh";
import { theme } from "../../theme";

/**
 * One coin: what it is, what it costs, and how to trade it.
 *
 * The chart is the whole top of the screen, edge to edge, and everything else
 * is arranged underneath in the order the questions get asked: what is this,
 * how big is it, who else is here, what are the details.
 *
 * On NEAR a coin is a post account. Under the size band sit the three things
 * only this build has: the redeemable floor, the sealed-bid opening auction
 * (live with a countdown while it runs, a record of the clearing price after)
 * and the dare. When the curve sells its last token it graduates by itself:
 * the curve closes, its liquidity stays in the post account's escrow, and the
 * floor stays redeemable.
 */

const TABS = [
  { id: "activity" as const, label: "Activity" },
  { id: "holders" as const, label: "Holders" },
  { id: "details" as const, label: "Details" },
];

type Tab = (typeof TABS)[number]["id"];

export default function CoinScreen() {
  const { address: rawAddress } = useLocalSearchParams<{ address: string }>();
  // A post is a NEAR account; account ids are lowercase.
  const mint = (rawAddress ?? "").toLowerCase();
  const router = useRouter();
  const [sheet, setSheet] = useState<"buy" | "sell" | "redeem" | null>(null);
  const [tab, setTab] = useState<Tab>("activity");
  const [copied, setCopied] = useState(false);
  const wallet = useWallet();
  const revision = useFeedRevision();
  const lifecycle = useLifecycle(mint, wallet.address);
  // A link that is not an address is answered here, as the server would
  // answer it (400 → "No such coin"), without asking the server.
  const wellFormed = validAddress(mint);
  const notAnAddress = () => Promise.reject(new ApiError("That is not a NEAR account.", 400));
  const detail = useApi(() => (wellFormed ? juno.coin(mint) : notAnAddress()), [mint, revision], { pollMs: 6000 });
  const coin = detail.data?.coin;

  /*
   * What this wallet holds: the coin, for the sell side; NEAR, for the
   * buy side and for gas. One read, re-read after each trade.
   */
  const balances = useApi(
    async () => (wallet.address ? juno.balances(wallet.address, mint) : null),
    [wallet.address, mint, revision],
  );
  const holding = balances.data?.token ?? null;
  const quoteBalance = balances.data?.near ?? null;

  // "Copied" is a state that has to expire on its own: nothing else on the
  // screen changes to clear it.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1600);
    return () => clearTimeout(timer);
  }, [copied]);

  const art = coin ? juno.still(coin.media) : null;
  /* Every figure on this screen is in NEAR, the unit the curve prices in. */
  const unit = coin?.quote.symbol ?? "NEAR";
  const toQuote = (value: number) =>
    coin && coin.marketCapCurrency === "USD" && coin.quoteUsdRate ? value / coin.quoteUsdRate : value;
  const ticks = useMemo(
    () => (coin?.priceHistory ?? []).map((point) => ({ t: point.t, price: toQuote(point.price) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [coin?.priceHistory, coin?.quoteUsdRate, coin?.marketCapCurrency],
  );

  return (
    <Page edges={["top"]}>
      <Nav>
        <Back onPress={() => router.back()} hitSlop={12} accessibilityRole="button">
          <ChevronLeft />
        </Back>
        <NavGrow />
      </Nav>

      {detail.loading && (!coin || coin.address !== mint) ? (
        /* Shaped like the screen it precedes — a chart, an identity row, a
           stats band — rather than one big block over an empty screen. A coin
           read can take fifteen seconds against the public endpoint, which is
           a long time to look at nothing. */
        <Loading>
          <Skeleton h={40} w="52%" />
          <Skeleton h={210} round={18} style={{ marginTop: 18 }} />
          <Row gap={12} style={{ marginTop: 22 }}>
            <Skeleton h={34} w={34} round={17} />
            <Skeleton h={14} w="40%" />
          </Row>
          <Skeleton h={26} w="80%" style={{ marginTop: 14 }} />
          <Skeleton h={64} round={16} style={{ marginTop: 18 }} />
        </Loading>
      ) : detail.errorStatus === 404 || detail.errorStatus === 400 ? (
        // Not a failure to retry: there is no such coin on this chain.
        <Placeholder
          art="empty"
          title="No such coin"
          detail="Nothing on Juno has this address. It may be on another network, or the link is wrong."
          action={<Button label="Back to the feed" onPress={() => router.replace("/(tabs)/social" as never)} />}
        />
      ) : detail.error || !coin ? (
        <Placeholder
          art="warning"
          title="Could not load this coin"
          detail={detail.error ?? undefined}
          action={<Button label="Try again" onPress={detail.refresh} />}
        />
      ) : (
        <>
          <ScrollView
            contentContainerStyle={{ width: "100%", paddingBottom: 150 }}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={detail.refreshing}
                onRefresh={() => {
                  detail.refresh();
                }}
                tintColor={theme.colors.muted}
              />
            }
          >
            {/* The post itself, first, when there is one. A market that is
                a photo or a reel was shown as a price chart with the picture
                nowhere on the page — the thing people are buying into, missing
                from the screen where they buy it. Trackers have no media and
                open on their chart. */}
            {art ? (
              <Padded>
                <Tappable
                  onPress={() =>
                    coin.media.kind === "video"
                      ? router.push(`/(tabs)/reels?start=${coin.address}` as never)
                      : undefined
                  }
                  to={coin.media.kind === "video" ? 0.98 : 1}
                  accessibilityRole={coin.media.kind === "video" ? "button" : "image"}
                  accessibilityLabel={coin.media.kind === "video" ? `Play ${coin.name}` : coin.name}
                >
                  <Hero
                    source={{ uri: art }}
                    resizeMode="cover"
                    style={{
                      aspectRatio:
                        coin.media.width && coin.media.height
                          ? Math.max(0.8, Math.min(1.25, coin.media.width / coin.media.height))
                          : 1,
                    }}
                  />
                  <PhaseChip coin={coin} />
                  {coin.media.kind === "video" ? (
                    <PlayOver pointerEvents="none">
                      <PlayDisc>
                        <Svg width={26} height={26} viewBox="0 0 24 24">
                          <Path d="M7 4.5v15l12.5-7.5z" fill="#FFFFFF" />
                        </Svg>
                      </PlayDisc>
                    </PlayOver>
                  ) : null}
                </Tappable>
              </Padded>
            ) : null}

            <Padded>
              {/* Who made it, how many hold it, and a way to pass it on. */}
              <Row gap={10} align="center">
                <Tappable
                  onPress={() => router.push(`/trader/${coin.creator.wallet}` as never)}
                  to={0.95}
                >
                  <Row gap={8} align="center">
                    {art ? <Thumb source={{ uri: art }} /> : <CoinGlyph size={30} seed={coin.address} />}
                    <Label style={{ fontWeight: "700" }} numberOfLines={1}>
                      <Handle wallet={coin.creator.wallet} />
                    </Label>
                  </Row>
                </Tappable>
                <NavGrow />
                <Caption numberOfLines={1}>
                  {/* The largest-accounts read is one the public RPC refuses
                      outright, so this said "— holders" on nearly every coin.
                      When it does, the decoded trades answer instead: wallets
                      whose fills still net positive, counted from a complete
                      read only — a partial one would undercount. */}
                  {(() => {
                    const crowd = detail.data?.crowd;
                    const n =
                      coin.holders ?? (crowd && !crowd.partial ? crowd.holdersStill : null);
                    return n === null ? "— holders" : `${n} ${n === 1 ? "holder" : "holders"}`;
                  })()}
                </Caption>
                <Tappable
                  onPress={async () => {
                    const outcome = await shareCoin(coin);
                    // "Copied" on the chip below is the one confirmation this
                    // screen already has; a copied link reuses it.
                    if (outcome === "copied") setCopied(true);
                  }}
                  to={0.86}
                >
                  <IconTap hitSlop={8} accessibilityRole="button" accessibilityLabel="Share">
                    <ShareGlyph />
                  </IconTap>
                </Tappable>
              </Row>

              <Title style={{ marginTop: 12 }}>{coin.name}</Title>
              {coin.description ? (
                <Body muted style={{ marginTop: 6 }}>
                  {coin.description}
                </Body>
              ) : null}

              <Row gap={8} style={{ marginTop: 12 }}>
                <Chip>
                  <ChipMark>$</ChipMark>
                  <ChipText numberOfLines={1}>{coin.symbol}</ChipText>
                </Chip>
                <Tappable
                  onPress={async () => {
                    await Clipboard.setStringAsync(coin.address);
                    setCopied(true);
                  }}
                  to={0.95}
                >
                  <Chip accessibilityRole="button" accessibilityLabel="Copy the coin address">
                    <CopyGlyph />
                    <ChipText>{copied ? "Copied" : "Copy address"}</ChipText>
                  </Chip>
                </Tappable>
              </Row>

              {coin.near.phase !== "curve" && coin.near.phase !== "graduated" ? (
                <AuctionCard coin={coin} onChanged={detail.refresh} lifecycle={lifecycle} />
              ) : null}
            </Padded>

            {coin.near.phase === "curve" || coin.near.phase === "graduated" ? (
              <PriceLine
                ticks={ticks}
                livePrice={coin.priceQuote ?? toQuote(coin.priceUsd)}
                partial={coin.priceHistoryPartial === true}
                format={(value) => price(value, unit)}
              />
            ) : null}

            <Padded>
              {coin.near.phase === "curve" || coin.near.phase === "graduated" ? (
                <CurveCard>
                  <Row justify="space-between" align="baseline">
                    <CurveTitle>{coin.curve.graduated ? "Graduated" : "Bonding curve"}</CurveTitle>
                    <CurvePct>{Math.floor(coin.curve.progress * 100)}%</CurvePct>
                  </Row>
                  <CurveTrack>
                    {coin.curve.progress > 0 ? (
                      <CurveFill style={{ width: `${Math.min(100, Math.max(1.5, coin.curve.progress * 100))}%` }} />
                    ) : null}
                  </CurveTrack>
                  <Row justify="space-between">
                    <Caption>{coin.near.curveSold} of 800 curve tokens sold</Caption>
                    <Caption>
                      {coin.curve.graduated
                        ? "Curve closed"
                        : `${money(coin.curve.raisedQuote ?? toQuote(coin.curve.raisedUsd), unit)} of ${money(coin.curve.thresholdQuote ?? toQuote(coin.curve.thresholdUsd), unit)}`}
                    </Caption>
                  </Row>
                </CurveCard>
              ) : null}

              {/* Three figures, ruled apart rather than boxed — the band is one
                  reading of size, not three separate cards. */}
              <Band>
                <Cell>
                  <CellValue>{money(coin.marketCapQuote ?? toQuote(coin.marketCap), unit)}</CellValue>
                  <Caption numberOfLines={2}>Market cap</Caption>
                </Cell>
                <Divider />
                <Cell>
                  <CellValue>
                    {coin.totalVolume === null ? "—" : money(coin.totalVolumeQuote ?? toQuote(coin.totalVolume), unit)}
                  </CellValue>
                  <Caption numberOfLines={2}>Total volume</Caption>
                </Cell>
                <Divider />
                <Cell>
                  <CellValue>
                    {money(coin.creatorFeesQuote ?? toQuote(coin.creatorRewards), unit)}
                  </CellValue>
                  <Caption numberOfLines={2}>Creator fees</Caption>
                </Cell>
              </Band>
              {/* What only NEAR has: the floor, the sealed-bid opening and the dare. */}
              <FloorRow>
                <FloorGlyph size={20} filled />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <FloorFigure>{money(coin.near.floorPerToken, unit)} floor per token</FloorFigure>
                  <Caption>
                    {money(coin.near.floorVault, unit)} held for {tokens(coin.near.totalSupply)} tokens. Redeemable at any time, even after graduation.
                  </Caption>
                </View>
              </FloorRow>
              {coin.near.phase === "curve" || coin.near.phase === "graduated" ? <AuctionCard coin={coin} onChanged={detail.refresh} lifecycle={lifecycle} /> : null}
              <DareCard coin={coin} lifecycle={lifecycle} />

              {/* The creator's own payday, on their own coin. The contract
                  checks it too; the button is simply not shown to anyone else. */}
              {wallet.address && sameAddress(wallet.address, coin.creator.wallet) ? (
                <ClaimFees
                  curve={coin.pool}
                  rewards={coin.creatorFeesQuote ?? toQuote(coin.creatorRewards)}
                  currency={unit}
                  onClaimed={() => {
                    detail.refresh();
                  }}
                />
              ) : null}

              {coin.curve.graduated ? (
                <View style={{ marginTop: 16, gap: 12 }}>
                  <GraduationMoment coin={coin} />
                </View>
              ) : null}

              <TabBar>
                {TABS.map((option) => (
                  <TabTap
                    key={option.id}
                    onPress={() => setTab(option.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: tab === option.id }}
                  >
                    <TabLabel $on={tab === option.id}>
                      {option.label}
                    </TabLabel>
                    <TabRule $on={tab === option.id} />
                  </TabTap>
                ))}
              </TabBar>

              {tab === "activity" ? (
                <ActivityTab
                  rows={detail.data!.activity}
                  partial={detail.data!.activityPartial}
                  currency={unit}
                  toQuote={toQuote}
                  onOpenTrader={(target) => router.push(`/trader/${target}` as never)}
                />
              ) : tab === "holders" ? (
                <HoldersTab
                  rows={detail.data!.holders}
                  unreadable={detail.data!.holdersUnreadable}
                  onOpenTrader={(target) => router.push(`/trader/${target}` as never)}
                />
              ) : (
                <DetailsTab coin={coin} />
              )}
            </Padded>
          </ScrollView>

          {/* Say something, or take a position. The two things this screen is
              for, always within reach of a thumb. */}
          <Actions>
            {/* The glyph alone. The word beside it was the one label on a bar
                whose other half says Buy, and it read as a second primary
                action competing with the one that matters. */}
            <Tappable onPress={() => setSheet("redeem")} to={0.94}>
              <PostTap accessibilityRole="button" accessibilityLabel="Redeem against the floor">
                <FloorGlyph size={22} color={theme.colors.text} />
              </PostTap>
            </Tappable>
            {coin.curve.graduated ? (
              <Button label="Redeem against the floor" variant="ink" tall onPress={() => setSheet("redeem")} style={{ flex: 1 }} />
            ) : coin.near.phase !== "curve" ? (
              <AuctionBar coin={coin} />
            ) : (
              <Button label="Buy" variant="lime" tall onPress={() => setSheet("buy")} style={{ flex: 1 }} />
            )}
          </Actions>

          {sheet ? (
            <TradeSheet
              coin={coin}
              side={sheet}
              holding={holding}
              quoteBalance={quoteBalance}
              onClose={() => setSheet(null)}
              onDone={() => {
                setSheet(null);
                detail.refresh();
              }}
            />
          ) : null}

        </>
      )}
    </Page>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                                */
/* ------------------------------------------------------------------ */

function ActivityTab({
  rows,
  partial,
  currency,
  toQuote,
  onOpenTrader,
}: {
  rows: import("../../lib/api").Activity[];
  partial: boolean;
  /** The coin's quote token: every value here is in it. */
  currency: string;
  toQuote: (usd: number) => number;
  onOpenTrader: (wallet: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <Empty>
        {/* An empty list that was never successfully read is not an empty
            market. Saying "No trades yet" there is a claim the app did not
            earn. */}
        <Body muted>
          {partial
            ? "Trade history could not be read just now. Pull to retry."
            : "No trades yet."}
        </Body>
      </Empty>
    );
  }

  return (
    <>
      {rows.slice(0, 20).map((row) => (
        <Line key={row.id}>
          <Tappable onPress={() => onOpenTrader(row.wallet)} to={0.97}>
            <Row gap={8} align="center">
              <Identicon seed={row.wallet} size={26} />
              <Label numberOfLines={1} style={{ maxWidth: 96 }}>
                <Handle wallet={row.wallet} />
              </Label>
            </Row>
          </Tappable>
          <Verb $buy={row.side === "buy"}>
            {row.kind === "auction" ? "Bid" : row.kind === "redeem" ? "Redeem" : row.side === "buy" ? "Buy" : "Sell"}
          </Verb>
          <Mono style={{ flex: 1, textAlign: "right" }}>{tokens(row.amount)}</Mono>
          <Mono muted numberOfLines={1} style={{ width: 92, textAlign: "right" }}>
            {money(row.valueQuote ?? toQuote(row.valueUsd), currency)}
          </Mono>
          <Caption style={{ width: 34, textAlign: "right" }}>{since(row.timestamp)}</Caption>
        </Line>
      ))}
      {partial ? (
        <Caption style={{ marginTop: 12 }}>
          Some of this curve&rsquo;s history would not load — these are the fills that did.
        </Caption>
      ) : null}
    </>
  );
}

function HoldersTab({
  rows,
  unreadable,
  onOpenTrader,
}: {
  rows: import("../../lib/api").Holder[];
  unreadable: boolean;
  onOpenTrader: (wallet: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <Empty>
        <Body muted>
          {unreadable
            ? "The holder list could not be read just now — which is not the same as nobody holding this."
            : "Nobody holds this yet."}
        </Body>
      </Empty>
    );
  }

  return (
    <>
      {rows.map((row) => (
        <Line key={row.wallet}>
          <Rank>{row.rank}</Rank>
          <Tappable onPress={() => onOpenTrader(row.wallet)} to={0.97}>
            <Row gap={8} align="center">
              <Identicon seed={row.wallet} size={26} />
              <Label numberOfLines={1} style={{ maxWidth: 96 }}>
                <Handle wallet={row.wallet} />
              </Label>
            </Row>
          </Tappable>
          <Mono style={{ flex: 1, textAlign: "right" }}>{tokens(row.balance)}</Mono>
          <Mono muted style={{ width: 56, textAlign: "right" }}>
            {(row.share * 100).toFixed(1)}%
          </Mono>
        </Line>
      ))}
      <Caption style={{ marginTop: 12 }}>
        Every holder, read from the post contract&rsquo;s balances.
      </Caption>
    </>
  );
}

function DetailsTab({ coin }: { coin: import("../../lib/api").Coin }) {
  const [copied, setCopied] = useState<string | null>(null);
  useEffect(() => {
    if (copied === null) return;
    const timer = setTimeout(() => setCopied(null), 1400);
    return () => clearTimeout(timer);
  }, [copied]);

  async function copy(key: string, value: string) {
    await Clipboard.setStringAsync(displayAddress(value));
    setCopied(key);
  }
  const n = coin.near;

  return (
    <Col gap={0}>
      {coin.curve.graduated || n.phase !== "curve" ? null : <DepthChart mint={coin.address} />}

      <Rows>
        <DetailRow label="Created" value={new Date(coin.createdAt).toLocaleString()} shaded={false} />
        <DetailRow
          label="Post account"
          value={shortAddress(coin.address)}
          shaded
          copied={copied === "token"}
          onCopy={() => void copy("token", coin.address)}
        />
        <DetailRow label="Ticker" value={coin.symbol} shaded={false} copied={copied === "ticker"} onCopy={() => void copy("ticker", coin.symbol)} />
        <DetailRow label="Network" value={NETWORK_NAME} shaded />
        <DetailRow label="Quote" value="NEAR" shaded={false} />
        <DetailRow label="Supply" value={`${tokens(n.totalSupply)} of 1,000`} shaded />
        <DetailRow label="Curve sold" value={`${n.curveSold} of 800`} shaded={false} />
        <DetailRow label="Auction cleared" value={n.clearingPrice > 0 ? money(n.clearingPrice, "NEAR") : "—"} shaded />
        <DetailRow label="Floor vault" value={money(n.floorVault, "NEAR")} shaded={false} />
        <DetailRow label="Graduation escrow" value={money(n.graduationEscrow, "NEAR")} shaded />
        {FACTORY ? <DetailRow label="Factory" value={shortAddress(FACTORY)} shaded={false} copied={copied === "factory"} onCopy={() => void copy("factory", FACTORY!)} /> : null}
      </Rows>

      <LinkTap onPress={() => Linking.openURL(explorer("address", coin.address))}>
        <LinkText>The post account on {EXPLORER_NAME}</LinkText>
        <ExternalGlyph />
      </LinkTap>
      {FACTORY ? (
        <LinkTap onPress={() => Linking.openURL(explorer("address", FACTORY!))}>
          <LinkText>The factory on {EXPLORER_NAME}</LinkText>
          <ExternalGlyph />
        </LinkTap>
      ) : null}
    </Col>
  );
}

/**
 * Claim the trading fees this coin has paid its creator.
 *
 * Built on the server (`claimCreatorFees()` on the curve), sent from the
 * creator's wallet, and the receipt — hash and the second it landed — stays
 * on screen.
 */
function ClaimFees({
  curve,
  rewards,
  currency,
  onClaimed,
}: {
  curve: string;
  rewards: number;
  currency: string;
  onClaimed: () => void;
}) {
  const wallet = useWallet();
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ hash: string; at: Date; amount: string } | null>(null);

  async function claim() {
    setState("busy");
    setError(null);
    try {
      const built = juno.buildClaim({ curve });
      const sent = await wallet.send(built.steps);
      setReceipt({
        hash: sent.hashes[sent.hashes.length - 1]!,
        at: sent.confirmedAt,
        amount: money(rewards, currency, { compact: false }),
      });
      setState("done");
      onClaimed();
    } catch (caught) {
      const failure = describeTxError(caught);
      setError(failure.cancelled ? null : failure.message || "The claim failed");
      setState("idle");
    }
  }

  if (receipt) {
    return (
      <ClaimBox>
        <Label style={{ fontWeight: "700" }}>Claimed {receipt.amount} in creator fees</Label>
        <Tappable onPress={() => void Linking.openURL(explorer("tx", receipt.hash))} to={0.97}>
          <ClaimReceipt>
            tx {receipt.hash.slice(0, 10)}…{receipt.hash.slice(-8)} ·{" "}
            {receipt.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · {EXPLORER_NAME} ↗
          </ClaimReceipt>
        </Tappable>
      </ClaimBox>
    );
  }
  if (!(rewards > 0)) return null;
  return (
    <ClaimBox>
      <Button
        label={
          state === "busy"
            ? "Claiming…"
            : `Claim ${money(rewards, currency, { compact: false })} in creator fees`
        }
        onPress={() => void claim()}
        loading={state === "busy"}
        style={{ alignSelf: "stretch" }}
      />
      {error ? <Caption style={{ color: theme.colors.neg, marginTop: 6 }}>{error}</Caption> : null}
    </ClaimBox>
  );
}

function DetailRow({
  label,
  value,
  shaded,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  shaded: boolean;
  onCopy?: () => void;
  copied?: boolean;
}) {
  const body = (
    <DetailBox $shaded={shaded}>
      <Label muted>{label}</Label>
      <Row gap={6} align="center">
        <DetailValue numberOfLines={1}>{copied ? "Copied" : value}</DetailValue>
        {onCopy ? <CopyGlyph /> : null}
      </Row>
    </DetailBox>
  );
  return onCopy ? (
    <Tappable onPress={onCopy} to={0.985} accessibilityRole="button" accessibilityLabel={`Copy ${label}`}>
      {body}
    </Tappable>
  ) : (
    body
  );
}

function ShareGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 15V3.8M12 3.8 8.3 7.5M12 3.8l3.7 3.7"
        stroke={theme.colors.text}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M5.5 12.6v5.9a1.6 1.6 0 0 0 1.6 1.6h9.8a1.6 1.6 0 0 0 1.6-1.6v-5.9"
        stroke={theme.colors.text}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function CopyGlyph() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Rect x={8.6} y={8.6} width={11.4} height={11.4} rx={2.6} stroke={theme.colors.muted} strokeWidth={1.9} />
      <Path
        d="M15.4 5.6a2 2 0 0 0-2-1.6H6.6A2.6 2.6 0 0 0 4 6.6v6.8a2 2 0 0 0 1.6 2"
        stroke={theme.colors.muted}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function PostGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 12.4c0 3.9-3.6 7-8 7a9 9 0 0 1-2.4-.3L5 21l1.2-3.3A6.6 6.6 0 0 1 4 12.4c0-3.9 3.6-7 8-7s8 3.1 8 7z"
        stroke={theme.colors.text}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/* ------------------------------------------------------------------ */

/**
 * Prices on a bonding curve start far below a cent, so a two-decimal format
 * would render most of this app's markets as "$0.00". Three significant
 * figures keeps the reading true at any magnitude.
 */
function price(value: number, currency: string): string {
  if (!Number.isFinite(value)) return "—";
  // `money` already writes sub-cent prices the way traders do — 0.0₆242 —
  // where `toPrecision` printed "$2.42e-7" in the largest type on the screen.
  return money(value, currency, { compact: false });
}

const Page = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(p) => p.theme.colors.bg};
`;

const Nav = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-bottom: ${(p) => p.theme.space(2)}px;
`;

const NavGrow = styled.View`
  flex: 1;
`;

const Back = styled.Pressable`
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background-color: ${(p) => p.theme.colors.surface};
  align-items: center;
  justify-content: center;
`;

const Loading = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
`;

const Padded = styled.View`
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-top: ${(p) => p.theme.space(5)}px;
`;

const Hero = styled.Image`
  width: 100%;
  border-radius: ${(p) => p.theme.radius.lg}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
  margin-bottom: ${(p) => p.theme.space(3)}px;
`;

const PlayOver = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: ${(p) => p.theme.space(3)}px;
  align-items: center;
  justify-content: center;
`;

const PlayDisc = styled.View`
  width: 64px;
  height: 64px;
  border-radius: 32px;
  padding-left: 4px;
  align-items: center;
  justify-content: center;
  background-color: rgba(0, 0, 0, 0.45);
  border-width: 1.5px;
  border-color: rgba(255, 255, 255, 0.7);
`;

const Thumb = styled.Image`
  width: 30px;
  height: 30px;
  border-radius: 10px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const IconTap = styled.View`
  padding: 4px;
  min-width: 44px;
  min-height: 44px;
  align-items: center;
  justify-content: center;
`;

const Chip = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 9px 14px;
  min-height: 44px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const ChipMark = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 800;
  color: ${(p) => p.theme.colors.muted};
`;

const ChipText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 700;
  letter-spacing: ${(p) => p.theme.type.label.tracking}px;
  color: ${(p) => p.theme.colors.text};
`;

const FloorRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  margin-top: 16px;
  padding: 14px;
  border-radius: ${(p) => p.theme.radius.lg}px;
  background-color: ${(p) => p.theme.colors.posSoft};
`;

const FloorFigure = styled.Text`
  font-size: ${(p) => p.theme.type.lead.size}px;
  font-weight: 800;
  letter-spacing: -0.2px;
  color: ${(p) => p.theme.colors.pos};
  font-variant: tabular-nums;
`;

const Band = styled.View`
  flex-direction: row;
  align-items: stretch;
  margin-top: ${(p) => p.theme.space(5)}px;
  padding-vertical: ${(p) => p.theme.space(3)}px;
  border-top-width: ${(p) => p.theme.hairline}px;
  border-bottom-width: ${(p) => p.theme.hairline}px;
  border-color: ${(p) => p.theme.colors.line};
`;

const Cell = styled.View`
  flex: 1;
  gap: 3px;
  padding-horizontal: 4px;
`;

const CellValue = styled.Text`
  font-size: ${(p) => p.theme.type.lead.size}px;
  font-weight: 800;
  font-variant: tabular-nums;
  letter-spacing: ${(p) => p.theme.type.lead.tracking}px;
  color: ${(p) => p.theme.colors.text};
`;

/** A hairline inside a card, where the sheet's own rules do not reach. */
const Split = styled.View`
  height: ${(p) => p.theme.hairline}px;
  background-color: ${(p) => p.theme.colors.line};
  margin-vertical: ${(p) => p.theme.space(4)}px;
`;

const Divider = styled.View`
  width: ${(p) => p.theme.hairline}px;
  background-color: ${(p) => p.theme.colors.line};
`;

const CurveCard = styled.View`
  margin-top: 18px;
  padding: 16px;
  gap: 10px;
  border-radius: ${theme.radius.lg}px;
  background-color: ${theme.colors.surface};
`;

const CurveTrack = styled.View`
  height: 10px;
  border-radius: 5px;
  background-color: ${theme.colors.line};
  overflow: hidden;
`;

const CurveFill = styled.View`
  height: 10px;
  border-radius: 5px;
  background-color: ${theme.colors.pos};
`;

const CurveTitle = styled.Text`
  color: ${theme.colors.text};
  font-size: ${theme.type.lead.size}px;
  font-weight: 800;
  letter-spacing: -0.2px;
`;

const CurvePct = styled.Text`
  color: ${theme.colors.pos};
  font-size: ${theme.type.title.size}px;
  font-weight: 800;
  font-variant: tabular-nums;
`;

const RaisedRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin-top: ${(p) => p.theme.space(4)}px;
`;

const End = styled.Text`
  font-size: ${(p) => p.theme.type.caption.size}px;
  font-weight: 700;
  font-variant: tabular-nums;
  color: ${(p) => p.theme.colors.muted};
`;

const Track = styled.View`
  flex: 1;
  height: 8px;
  border-radius: 4px;
  background-color: ${(p) => p.theme.colors.line};
  overflow: hidden;
`;

const FillBar = styled.View`
  height: 8px;
  background-color: ${(p) => p.theme.colors.pos};
`;

const TabBar = styled.View`
  flex-direction: row;
  gap: ${(p) => p.theme.space(5)}px;
  margin-top: ${(p) => p.theme.space(5)}px;
  border-bottom-width: ${(p) => p.theme.hairline}px;
  border-bottom-color: ${(p) => p.theme.colors.line};
`;

const TabTap = styled.Pressable`
  padding-bottom: 10px;
  min-height: 44px;
  justify-content: flex-end;
`;

const TabLabel = styled.Text<{ $on: boolean }>`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: ${(p) => (p.$on ? 800 : 600)};
  letter-spacing: ${(p) => p.theme.type.label.tracking}px;
  color: ${(p) => (p.$on ? p.theme.colors.text : p.theme.colors.muted)};
`;

const TabRule = styled.View<{ $on: boolean }>`
  height: 2px;
  margin-top: 8px;
  margin-bottom: -1px;
  background-color: ${(p) => (p.$on ? p.theme.colors.text : "transparent")};
`;

const Line = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding-vertical: ${(p) => p.theme.space(3)}px;
  border-bottom-width: ${(p) => p.theme.hairline}px;
  border-bottom-color: ${(p) => p.theme.colors.line};
`;

const Verb = styled.Text<{ $buy: boolean }>`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 800;
  width: 58px;
  color: ${(p) => (p.$buy ? p.theme.colors.pos : p.theme.colors.neg)};
`;

const Rank = styled.Text`
  font-size: ${(p) => p.theme.type.caption.size}px;
  font-weight: 700;
  font-variant: tabular-nums;
  width: 18px;
  color: ${(p) => p.theme.colors.faint};
`;

const Empty = styled.View`
  padding-vertical: ${(p) => p.theme.space(6)}px;
`;

const SaveSlot = styled.View`
  margin-top: ${(p) => p.theme.space(4)}px;
`;

const Rows = styled.View`
  margin-top: ${(p) => p.theme.space(4)}px;
  border-radius: ${(p) => p.theme.radius.md}px;
  overflow: hidden;
`;

const ClaimBox = styled.View`
  margin-top: 14px;
  padding: 12px;
  border-radius: 16px;
  background-color: ${(p) => p.theme.colors.surface};
`;

const ClaimReceipt = styled.Text`
  margin-top: 4px;
  font-size: 12px;
  font-family: ${Platform.OS === "ios" ? "Menlo" : "monospace"};
  color: ${(p) => p.theme.colors.muted};
`;

const DetailBox = styled.View<{ $shaded: boolean }>`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px ${(p) => p.theme.space(3)}px;
  background-color: ${(p) => (p.$shaded ? p.theme.colors.surfaceAlt : "transparent")};
`;

const DetailValue = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 700;
  font-variant: tabular-nums;
  color: ${(p) => p.theme.colors.text};
`;

const LinkTap = styled.Pressable`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-top: ${(p) => p.theme.space(4)}px;
`;

const LinkText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.focus};
`;

const Actions = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  flex-direction: row;
  gap: ${(p) => p.theme.space(3)}px;
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-top: ${(p) => p.theme.space(3)}px;
  /* Clear of the home indicator. */
  padding-bottom: ${(p) => p.theme.space(7)}px;
  background-color: ${(p) => p.theme.colors.bg};
  border-top-width: ${(p) => p.theme.hairline}px;
  border-top-color: ${(p) => p.theme.colors.line};
`;

const PostTap = styled.View`
  align-items: center;
  justify-content: center;
  width: 54px;
  height: 54px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const GraduatedNote = styled.Text`
  flex: 1.4;
  font-size: ${(p) => p.theme.type.label.size}px;
  color: ${(p) => p.theme.colors.muted};
  text-align: center;
  align-self: center;
`;
