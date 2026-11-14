import { useCallback, useEffect, useMemo, useState } from "react";
import { Linking, Modal, Platform } from "react-native";
import Svg, { Circle, Path } from "react-native-svg";
import styled from "styled-components/native";

import { Object3D } from "./art3d";
import { Button, Caption, Col, ExternalGlyph, Label, Row } from "./kit";
import { juno, type Coin, type SwapQuote } from "../lib/api";
import { describeTxError, explorer, EXPLORER_NAME, NETWORK_NAME } from "../lib/chain";
import { money, tokens } from "../lib/useApi";
import { ApprovalOutlet, useWallet, type SendProgress } from "../lib/wallet";
import { theme } from "../theme";

/**
 * Buy, sell and redeem, with a numpad.
 *
 * A system keyboard is the wrong control here. It covers half the screen —
 * including the quote the person is deciding on — and a purpose-built pad
 * keeps the number, the quote and the button visible at once.
 *
 * ## On NEAR
 *
 * A post token is one whole unit (the contract has no decimals), so the pad
 * takes whole tokens on every side. The quote is the contract's own maths:
 * a buy is `quote_buy` read from the post's account right before signing;
 * a sell and a redemption use `@juno/sdk`'s mirror of the contract.
 *
 * - **Buy** pays the curve (or the floor, if that is higher), plus 20% into
 *   the floor and a 1% fee split between the creator and graduation.
 * - **Sell** returns tokens to the curve, minus 1%.
 * - **Redeem** burns tokens against the floor at any time — even after
 *   graduation — minus 1% that stays for the remaining holders.
 *
 * Mainnet funding is unconfigured. The buy sheet shows a NEAR-only setup line;
 * this testnet app does not request a quote or send a mainnet swap.
 */

type Side = "buy" | "sell" | "redeem";
const QUICK_BUY = [1, 10, 50, 100];
const QUICK_SHARE = [0.25, 0.5, 0.75, 1];

type Stage = "entry" | "confirming" | "done";

export function TradeSheet({
  coin,
  side: initialSide,
  onClose,
  onDone,
  holding = null,
  quoteBalance = null,
  initialAmount = "",
  onFilled,
}: {
  coin: Coin;
  side: Side;
  onClose: () => void;
  onDone: () => void;
  /** Tokens held, for a sell or redemption. Null when unknown. */
  holding?: number | null;
  /** NEAR held, for a buy. Null when unknown. */
  quoteBalance?: number | null;
  initialAmount?: string;
  /** A trade confirmed, with the NEAR spent or received. */
  onFilled?: (quoteAmount: number) => void;
}) {
  const wallet = useWallet();
  const curveOpen = coin.near.phase === "curve";
  const [side, setSide] = useState<Side>(curveOpen ? initialSide : "redeem");
  const [amount, setAmount] = useState(initialAmount);
  const [quote, setQuote] = useState<SwapQuote | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [stage, setStage] = useState<Stage>("entry");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ labels: string[]; at: SendProgress } | null>(null);
  const [landedAt, setLandedAt] = useState<Date | null>(null);

  const value = Number(amount || "0");
  const valid = Number.isInteger(value) && value > 0;
  const balance = side === "buy" ? quoteBalance : holding;
  const room = side === "buy" ? 800 - coin.near.curveSold : side === "sell" ? coin.near.curveSold : coin.near.totalSupply;

  const blocker = useMemo((): { text: string; short: string } | null => {
    if (side !== "redeem" && !curveOpen) {
      return coin.curve.graduated
        ? { text: "This post graduated: its curve is closed. You can still redeem against the floor.", short: "Curve closed" }
        : { text: "The curve opens when the sealed-bid auction settles.", short: "Auction first" };
    }
    if (side === "redeem" && !(coin.near.floorVault > 0)) return { text: "The floor is empty until the auction settles.", short: "Nothing to redeem" };
    if (!valid) return null;
    if (value > room) return { text: `At most ${room} tokens on this side right now.`, short: `Max ${room}` };
    if (side !== "buy" && balance !== null && value > balance) return { text: `You hold ${balance} ${coin.symbol}.`, short: `Not enough ${coin.symbol}` };
    if (side === "buy" && balance !== null && quote && quote.amountIn > balance) {
      return { text: `This costs ${money(quote.amountIn, "NEAR", { compact: false })} and you have ${money(balance, "NEAR")}.`, short: "Not enough NEAR" };
    }
    return null;
  }, [side, curveOpen, coin.curve.graduated, coin.near.floorVault, coin.symbol, valid, value, room, balance, quote]);

  useEffect(() => {
    if (!valid || value > room || (side !== "redeem" && !curveOpen)) {
      setQuote(null);
      setQuoting(false);
      return;
    }
    let cancelled = false;
    setQuoting(true);
    setError(null);
    const timer = setTimeout(async () => {
      try {
        const next = await juno.quoteSwap({ curve: coin.address, side, amountOut: value });
        if (!cancelled) setQuote(next);
      } catch (caught) {
        if (!cancelled) {
          setQuote(null);
          setError(caught instanceof Error ? caught.message : "Could not quote this trade");
        }
      } finally {
        if (!cancelled) setQuoting(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [valid, value, room, side, curveOpen, coin.address]);

  const press = useCallback((key: string) => {
    setError(null);
    setTxHash(null);
    setAmount((current) => {
      if (key === "back") return current.slice(0, -1);
      if (key === ".") return current;
      const next = current === "0" ? key : current + key;
      return next.length > 4 ? current : next;
    });
  }, []);

  async function confirm() {
    if (!quote) return;
    setStage("confirming");
    setError(null);
    setProgress(null);
    try {
      if (!wallet.address) await wallet.connect();
      // Re-read the post and re-quote right before signing: the curve moves as it fills.
      const built = await juno.buildSwap({ curve: coin.address, side, amountOut: value });
      setQuote(built.quote);
      const labels = built.steps.map((step) => step.label);
      const sent = await wallet.send(built.steps, { onProgress: (at) => setProgress({ labels, at }) });
      setTxHash(sent.hashes[sent.hashes.length - 1]!);
      setLandedAt(sent.confirmedAt);
      setStage("done");
      onFilled?.(side === "buy" ? built.quote.amountIn : built.quote.amountOut);
    } catch (caught) {
      const failure = describeTxError(caught);
      setError(failure.cancelled ? null : failure.message || "The trade failed");
      setStage("entry");
    } finally {
      setProgress(null);
    }
  }

  const receiving = quote
    ? side === "buy"
      ? `Costs ${money(quote.amountIn, "NEAR", { compact: false })} for ${quote.amountOut} ${coin.symbol}`
      : `You'll receive ${money(quote.amountOut, "NEAR", { compact: false })}${quote.fromFloor ? " from the floor" : ""}`
    : null;

  const quickSizes = useMemo(() => {
    if (side === "buy") return QUICK_BUY.filter((n) => n <= Math.max(1, room)).map((n) => ({ label: String(n), amount: n as number | null }));
    const held = balance === null ? null : Math.min(balance, room);
    return QUICK_SHARE.map((fraction) => ({
      label: `${fraction * 100}%`,
      amount: held === null ? null : Math.max(held > 0 ? 1 : 0, Math.floor(held * fraction)),
    }));
  }, [side, balance, room]);

  const done = stage === "done" && txHash !== null;
  const sides: Side[] = ["buy", "sell", "redeem"];

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <Scrim onPress={onClose} />

      <Sheet>
        <Grabber />

        <Row justify="space-between" align="center">
          <Row gap={4}>
            {sides.map((id) => (
              <SideTap
                key={id}
                $on={side === id}
                $buy={id !== "sell"}
                onPress={() => {
                  // A new side is a new trade: drop the last receipt so it is never shown under the wrong verb.
                  if (stage === "confirming") return;
                  setSide(id);
                  setQuote(null);
                  setError(null);
                  setTxHash(null);
                  setStage("entry");
                  setAmount("");
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: side === id }}
              >
                <SideText $on={side === id} $buy={id !== "sell"}>
                  {id === "buy" ? "Buy" : id === "sell" ? "Sell" : "Redeem"}
                </SideText>
              </SideTap>
            ))}
          </Row>
          <Close onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <CloseMark>✕</CloseMark>
          </Close>
        </Row>

        {done ? (
          <Done>
            <Object3D art="success" alt="" size={104} float eager />
            <DoneTitle>Done</DoneTitle>
            <Label muted style={{ textAlign: "center" }}>
              {side === "buy"
                ? `Bought ${quote?.amountOut ?? value} ${coin.symbol}`
                : side === "sell"
                  ? `Sold ${value} ${coin.symbol}`
                  : `Redeemed ${value} ${coin.symbol} against the floor`}{" "}
              — final on {NETWORK_NAME}.
            </Label>
            <Receipt>
              tx {txHash!.slice(0, 10)}…{txHash!.slice(-8)}
              {landedAt ? ` · ${landedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}` : ""}
            </Receipt>
            <LinkTap onPress={() => Linking.openURL(explorer("tx", txHash!))}>
              <LinkText>View on {EXPLORER_NAME}</LinkText>
              <ExternalGlyph />
            </LinkTap>
            <Button label="Done" onPress={onDone} style={{ marginTop: 16, alignSelf: "stretch" }} />
          </Done>
        ) : (
          <>
            <Field $live={valid}>
              <Col gap={2} style={{ flex: 1 }}>
                <AmountRow>
                  <AmountValue numberOfLines={1}>{amount || "0"}</AmountValue>
                  <Caret />
                </AmountRow>
                <Caption>
                  {side === "redeem"
                    ? `Floor ${money(coin.near.floorPerToken, "NEAR")} per token`
                    : `Spot ${money(coin.priceQuote ?? null, "NEAR")} per token`}
                </Caption>
              </Col>
              <Col gap={4} style={{ alignItems: "flex-end" }}>
                <TokenChip>
                  <TokenDot />
                  <TokenText>{coin.symbol}</TokenText>
                </TokenChip>
                <Caption>
                  {side === "buy"
                    ? `Balance: ${balance === null ? "—" : money(balance, "NEAR")}`
                    : `Held: ${balance === null ? "—" : `${tokens(balance)} ${coin.symbol}`}`}
                </Caption>
              </Col>
            </Field>

            <Row gap={8}>
              {quickSizes.map((preset) => (
                <Quick
                  key={preset.label}
                  disabled={preset.amount === null || preset.amount === 0}
                  onPress={() => (preset.amount ? setAmount(String(preset.amount)) : undefined)}
                >
                  <QuickLabel $off={!preset.amount}>{preset.label}</QuickLabel>
                </Quick>
              ))}
            </Row>

            <Line>
              <Row gap={6}>
                <Label muted>Trading fee</Label>
                <Info />
              </Row>
              <Mono_>{quote ? money(quote.fee, "NEAR", { compact: false }) : quoting ? "…" : "—"}</Mono_>
            </Line>
            {side === "buy" ? (
              <Line>
                <Label muted>Added to the floor</Label>
                <Mono_ style={{ color: theme.colors.pos }}>{quote ? money(quote.toFloor, "NEAR", { compact: false }) : quoting ? "…" : "—"}</Mono_>
              </Line>
            ) : null}
            <Line>
              <Label muted>{side === "redeem" ? "Paid from" : "Price impact"}</Label>
              <Mono_ $warn={side !== "redeem" && (quote?.priceImpact ?? 0) > 0.05}>
                {side === "redeem" ? "Floor vault" : quote ? `${(quote.priceImpact * 100).toFixed(2)}%` : quoting ? "…" : "—"}
              </Mono_>
            </Line>

            <Receive>{quoting ? "Quoting against the contract…" : (receiving ?? " ")}</Receive>

            {/* Funding from NEAR mainnet is only relevant when this testnet account cannot cover the buy. */}
            {side === "buy" && quote && balance !== null && quote.amountIn > balance ? (
              <Depth>
                <Col gap={2} style={{ flex: 1 }}>
                  <Label style={{ fontWeight: "700", color: theme.colors.muted }}>
                    Setup required: NEAR_MAINNET_ACCOUNT
                  </Label>
                  <Caption>NEAR mainnet funding is not configured. Trading uses NEAR testnet.</Caption>
                </Col>
              </Depth>
            ) : null}

            {stage === "confirming" && progress ? <Steps labels={progress.labels} at={progress.at} /> : null}

            {!wallet.address ? (
              <Button
                label="Sign in to trade"
                tall
                onPress={() => {
                  onClose();
                  void wallet.connect().catch(() => undefined);
                }}
                style={{ alignSelf: "stretch" }}
              />
            ) : (
              <Button
                label={
                  stage === "confirming"
                    ? progress
                      ? progress.at.phase === "signing"
                        ? `${progress.at.label}: signing…`
                        : `${progress.at.label}: ${wallet.via === "wallet" ? "confirming" : "relaying"}…`
                      : "Confirming…"
                    : blocker
                      ? blocker.short
                      : side === "buy"
                        ? "Buy"
                        : side === "sell"
                          ? "Sell"
                          : "Redeem"
                }
                variant={side === "sell" ? "sell" : "lime"}
                tall
                onPress={confirm}
                loading={stage === "confirming" || wallet.signing}
                disabled={!quote || quoting || !!blocker}
                style={{ alignSelf: "stretch" }}
              />
            )}

            {blocker ? <HintText>{blocker.text}</HintText> : null}
            {error ? <ErrorText>{error}</ErrorText> : null}

            <Pad>
              {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"].map((key, i) => (
                <Key
                  key={`${key}-${i}`}
                  disabled={key === ""}
                  onPress={() => (key ? press(key) : undefined)}
                  accessibilityRole="button"
                  accessibilityLabel={key === "back" ? "Delete" : key || "Unused"}
                >
                  <KeyLabel>{key === "back" ? "⌫" : key}</KeyLabel>
                </Key>
              ))}
            </Pad>
          </>
        )}
      </Sheet>
      <ApprovalOutlet />
    </Modal>
  );
}

/** "Approve USDC ✓ → Buy …", live while the wallet works through the steps. */
function Steps({ labels, at }: { labels: string[]; at: SendProgress }) {
  return (
    <Row gap={8} justify="center" align="center" style={{ flexWrap: "wrap" }}>
      {labels.map((label, index) => {
        const done = index < at.index || (index === at.index && at.phase === "confirmed");
        const active = index === at.index && !done;
        return (
          <Row key={`${label}-${index}`} gap={8} align="center">
            {index > 0 ? <StepArrow>→</StepArrow> : null}
            <StepChip $done={done} $active={active}>
              <StepText $done={done} $active={active}>
                {done ? "✓ " : active ? "… " : ""}
                {label}
              </StepText>
            </StepChip>
          </Row>
        );
      })}
    </Row>
  );
}

function Info() {
  return (
    <Svg width={14} height={14} viewBox="0 0 16 16" fill="none">
      <Circle cx={8} cy={8} r={6.6} stroke={theme.colors.faint} strokeWidth={1.6} />
      <Path d="M8 7.2v4" stroke={theme.colors.faint} strokeWidth={1.8} strokeLinecap="round" />
      <Circle cx={8} cy={4.9} r={0.95} fill={theme.colors.faint} />
    </Svg>
  );
}

const WarnText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  line-height: 19px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.neg};
  text-align: center;
`;

const Receipt = styled.Text`
  margin-top: 6px;
  font-size: 12px;
  font-family: ${Platform.OS === "ios" ? "Menlo" : "monospace"};
  color: ${(p) => p.theme.colors.muted};
  text-align: center;
`;

const HintText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  line-height: 19px;
  color: ${(p) => p.theme.colors.muted};
  text-align: center;
`;

const StepArrow = styled.Text`
  font-size: ${(p) => p.theme.type.caption.size}px;
  color: ${(p) => p.theme.colors.faint};
`;

const StepChip = styled.View<{ $done: boolean; $active: boolean }>`
  padding: 5px 10px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => (p.$done ? p.theme.colors.lime : p.$active ? p.theme.colors.surfaceAlt : "transparent")};
  border-width: ${(p) => p.theme.hairline}px;
  border-color: ${(p) => (p.$done ? p.theme.colors.lime : p.theme.colors.line)};
`;

const StepText = styled.Text<{ $done: boolean; $active: boolean }>`
  font-size: ${(p) => p.theme.type.caption.size}px;
  font-weight: 800;
  color: ${(p) => (p.$done ? p.theme.colors.onLime : p.$active ? p.theme.colors.text : p.theme.colors.faint)};
`;

const Scrim = styled.Pressable`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(18, 21, 14, 0.45);
`;

const Sheet = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  /* A Modal renders over the whole window on web, not inside the app's
     phone-width frame — so the sheet holds the same width itself. */
  max-width: 480px;
  margin-horizontal: auto;
  background-color: ${(p) => p.theme.colors.surface};
  border-top-left-radius: ${(p) => p.theme.radius.xl}px;
  border-top-right-radius: ${(p) => p.theme.radius.xl}px;
  padding: ${(p) => p.theme.space(4)}px;
  padding-bottom: ${(p) => p.theme.space(8)}px;
  gap: ${(p) => p.theme.space(3)}px;
`;

const Grabber = styled.View`
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background-color: ${(p) => p.theme.colors.line};
  align-self: center;
`;

const SideTap = styled.Pressable<{ $on: boolean; $buy: boolean }>`
  padding: 9px 18px;
  min-height: 44px;
  justify-content: center;
  border-radius: ${(p) => p.theme.radius.md}px;
  background-color: ${(p) =>
    !p.$on ? "transparent" : p.$buy ? p.theme.colors.lime : p.theme.colors.negSoft};
`;

const SideText = styled.Text<{ $on: boolean; $buy: boolean }>`
  font-size: ${(p) => p.theme.type.lead.size}px;
  font-weight: 800;
  letter-spacing: ${(p) => p.theme.type.lead.tracking}px;
  color: ${(p) =>
    !p.$on ? p.theme.colors.faint : p.$buy ? p.theme.colors.onLime : p.theme.colors.neg};
`;

const Close = styled.Pressable`
  width: 44px;
  height: 44px;
  border-radius: 22px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
  align-items: center;
  justify-content: center;
`;

const CloseMark = styled.Text`
  font-size: ${(p) => p.theme.type.body.size}px;
  color: ${(p) => p.theme.colors.muted};
`;

const Field = styled.View<{ $live: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.space(3)}px;
  padding: ${(p) => p.theme.space(4)}px;
  border-radius: ${(p) => p.theme.radius.lg}px;
  border-width: 1.5px;
  border-color: ${(p) => (p.$live ? p.theme.colors.ink : p.theme.colors.line)};
  background-color: ${(p) => p.theme.colors.surface};
`;

const AmountRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 2px;
`;

const AmountValue = styled.Text`
  font-size: ${(p) => p.theme.type.heading.size}px;
  line-height: ${(p) => p.theme.type.heading.height}px;
  letter-spacing: ${(p) => p.theme.type.heading.tracking}px;
  font-weight: 800;
  font-variant: tabular-nums;
  color: ${(p) => p.theme.colors.text};
`;

/* The caret. The pad is the keyboard, so the field never takes focus and
   never draws one of its own — without this the box reads as a label. */
const Caret = styled.View`
  width: 2px;
  height: ${(p) => p.theme.type.heading.size}px;
  background-color: ${(p) => p.theme.colors.focus};
  margin-left: 2px;
`;

const TokenChip = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 7px 12px;
  border-radius: ${(p) => p.theme.radius.pill}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const TokenDot = styled.View`
  width: 14px;
  height: 14px;
  border-radius: 7px;
  background-color: ${(p) => p.theme.colors.ink};
`;

const TokenText = styled.Text`
  font-size: ${(p) => p.theme.type.caption.size}px;
  font-weight: 800;
  color: ${(p) => p.theme.colors.text};
`;

const Depth = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${(p) => p.theme.space(3)}px;
  padding: ${(p) => p.theme.space(3)}px;
  border-radius: ${(p) => p.theme.radius.md}px;
  background-color: ${(p) => p.theme.colors.surfaceAlt};
`;

const UseIt = styled.Text`
  font-size: ${(p) => p.theme.type.caption.size}px;
  font-weight: 800;
  color: ${(p) => p.theme.colors.focus};
`;

const Line = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
`;

const Mono_ = styled.Text<{ $warn?: boolean }>`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 700;
  font-variant: tabular-nums;
  color: ${(p) => (p.$warn ? p.theme.colors.neg : p.theme.colors.text)};
`;

const Receive = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 600;
  color: ${(p) => p.theme.colors.text};
  min-height: 18px;
`;

const Note = styled.View`
  flex-direction: row;
  align-items: center;
  padding-horizontal: ${(p) => p.theme.space(4)}px;
  padding-vertical: 12px;
  border-radius: ${(p) => p.theme.radius.md}px;
  border-width: ${(p) => p.theme.hairline}px;
  border-color: ${(p) => p.theme.colors.line};
  background-color: ${(p) => p.theme.colors.surface};
`;

const Quick = styled.Pressable`
  flex: 1;
  padding-vertical: ${(p) => p.theme.space(3)}px;
  border-radius: ${(p) => p.theme.radius.md}px;
  border-width: ${(p) => p.theme.hairline}px;
  border-color: ${(p) => p.theme.colors.line};
  align-items: center;
`;

const QuickLabel = styled.Text<{ $off?: boolean }>`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 700;
  color: ${(p) => (p.$off ? p.theme.colors.faint : p.theme.colors.text)};
`;

const Pad = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
`;

const Key = styled.Pressable`
  width: 33.33%;
  padding-vertical: ${(p) => p.theme.space(3)}px;
  align-items: center;
`;

const KeyLabel = styled.Text`
  font-size: ${(p) => p.theme.type.heading.size}px;
  font-weight: 500;
  color: ${(p) => p.theme.colors.text};
`;

const Done = styled.View`
  align-items: center;
  gap: ${(p) => p.theme.space(2)}px;
  padding-vertical: ${(p) => p.theme.space(6)}px;
`;

const DoneTitle = styled.Text`
  font-size: ${(p) => p.theme.type.heading.size}px;
  font-weight: 800;
  color: ${(p) => p.theme.colors.pos};
`;

const LinkTap = styled.Pressable`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  margin-top: ${(p) => p.theme.space(2)}px;
`;

const LinkText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.focus};
`;

const ErrorText = styled.Text`
  font-size: ${(p) => p.theme.type.label.size}px;
  color: ${(p) => p.theme.colors.neg};
  text-align: center;
`;

/** Lifecycle actions reuse the trade sheet's existing frame, progress and receipt components. */
export function TransactionSheet({ title, busy, onClose, children }: { title: string; busy: boolean; onClose: () => void; children: React.ReactNode }) {
  return <Modal visible animationType="slide" transparent onRequestClose={() => { if (!busy) onClose(); }}>
    <Scrim onPress={() => { if (!busy) onClose(); }} />
    <Sheet><Grabber /><Row justify="space-between" align="center"><Label>{title}</Label>
      <Close disabled={busy} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close"><CloseMark>✕</CloseMark></Close>
    </Row>{children}</Sheet>
    <ApprovalOutlet />
  </Modal>;
}
export function TransactionReceipt({ hash, label, onDone }: { hash: string; label: string; onDone: () => void }) {
  return <Done><DoneTitle>Done</DoneTitle><Label muted>{label} — final on {NETWORK_NAME}.</Label>
    <Receipt>tx {hash.slice(0, 10)}…{hash.slice(-8)}</Receipt>
    <LinkTap accessibilityRole="link" onPress={() => Linking.openURL(explorer("tx", hash))}><LinkText>View on {EXPLORER_NAME}</LinkText><ExternalGlyph /></LinkTap>
    <Button label="Done" onPress={onDone} />
  </Done>;
}
export { Steps as TransactionProgress };
