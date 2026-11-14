import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { Tappable } from "./Press";
import { Button } from "./kit";
import { juno } from "../lib/api";
import { displayAddress, NETWORK_NAME } from "../lib/chain";
import { money, useApi } from "../lib/useApi";
import { useFeedRevision } from "../lib/refresh";
import { theme } from "../theme";

/**
 * The account, as one ink statement: what it is worth, what that is made of,
 * and how to fund it.
 *
 * Total value is the NEAR in the account plus its post coins at their spot
 * price on the curve, both read from NEAR testnet. If either read is missing
 * the total is a dash, never a partial sum shown as if it were whole: a total
 * that left out the coins would read as a loss nobody took.
 *
 * More test NEAR comes from the public testnet faucet.
 */
const FAUCET_URL = "https://near-faucet.io/";
export function WalletCard({
  address,
  holdings,
  pnl,
  pnlPct,
  loading,
}: {
  address: string;
  /** The post coins at spot, in NEAR. Null when the read failed or did not finish. */
  holdings: number | null | undefined;
  pnl: number | null;
  pnlPct: number | null | undefined;
  loading: boolean;
}) {
  const revision = useFeedRevision();
  const balances = useApi(() => juno.balances(address), [address, revision]);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(displayAddress(address));
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const avax = balances.error ? null : (balances.data?.near ?? null);
  const total = avax !== null && holdings !== null && holdings !== undefined ? avax + holdings : null;
  const figure = (value: number | null, busy: boolean) => (busy ? "…" : value === null ? "—" : fixed(value));
  const empty = avax !== null && avax < 0.05;
  const up = pnlPct !== null && pnlPct !== undefined && Number.isFinite(pnlPct) ? pnlPct >= 0 : null;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.kicker}>Total value</Text>
        <View style={styles.live}>
          <View style={styles.liveDot} />
          <Text style={styles.liveText}>{NETWORK_NAME}</Text>
        </View>
      </View>

      <View style={styles.totalRow}>
        <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit>
          {figure(total, balances.loading || loading)}
        </Text>
        <Text style={styles.totalUnit}>NEAR</Text>
      </View>

      <View style={styles.pnlRow}>
        {up === null ? (
          <Text style={styles.pnlNone}>No P&amp;L yet: it starts with your first buy</Text>
        ) : (
          <>
            <View style={[styles.pnlBadge, { backgroundColor: up ? "rgba(214,255,61,0.16)" : "rgba(217,45,32,0.22)" }]}>
              <Text style={[styles.pnlBadgeText, { color: up ? theme.colors.lime : "#FF8A80" }]}>
                {up ? "▲ +" : "▼ "}
                {((pnlPct ?? 0) * 100).toFixed(1)}%
              </Text>
            </View>
            <Text style={styles.pnlNote}>{pnl === null ? "on your coins" : `${pnl >= 0 ? "+" : ""}${money(pnl, "NEAR")} on your coins`}</Text>
          </>
        )}
      </View>

      <View style={styles.split}>
        <View style={styles.cell}>
          <Text style={styles.cellLabel}>NEAR balance</Text>
          <Text style={styles.cellValue}>{figure(avax, balances.loading)}</Text>
        </View>
        <View style={styles.rule} />
        <View style={styles.cell}>
          <Text style={styles.cellLabel}>In post coins</Text>
          <Text style={styles.cellValue}>{figure(holdings ?? null, loading)}</Text>
        </View>
      </View>

      {empty ? <Text style={styles.hint}>A sealed bid escrows 1 NEAR, a launch attaches 3 NEAR for the post account, and every call needs a little gas.</Text> : null}

      <View style={styles.actions}>
        <Button label="Add test NEAR" variant="lime" onPress={() => void Linking.openURL(FAUCET_URL)} style={styles.action} />
        <Tappable onPress={() => void copy()} to={0.95} accessibilityRole="button" accessibilityLabel="Copy account">
          <View style={styles.ghost}>
            <Text style={styles.ghostText}>{copied ? "Copied" : "Copy account"}</Text>
          </View>
        </Tappable>
      </View>
    </View>
  );
}

function fixed(value: number): string {
  if (value === 0) return "0.00";
  return value < 1 ? value.toFixed(4) : value.toFixed(3);
}

const ON_INK_MUTED = "#A9B3A2";

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.xl,
    backgroundColor: theme.colors.ink,
    padding: 20,
    gap: 10,
    ...theme.shadow.raised,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  kicker: { fontSize: theme.type.label.size, fontWeight: "600", color: ON_INK_MUTED },
  live: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: theme.colors.inkSoft },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.lime },
  liveText: { fontSize: theme.type.micro.size, fontWeight: "700", color: ON_INK_MUTED },
  totalRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  total: {
    flexShrink: 1,
    fontSize: theme.type.display.size,
    lineHeight: theme.type.display.height + 4,
    letterSpacing: theme.type.display.tracking,
    fontWeight: "800",
    color: theme.colors.lime,
    fontVariant: ["tabular-nums"],
  },
  totalUnit: { fontSize: theme.type.title.size, fontWeight: "700", color: theme.colors.onInk },
  pnlRow: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 24 },
  pnlBadge: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999 },
  pnlBadgeText: { fontSize: theme.type.caption.size, fontWeight: "800", fontVariant: ["tabular-nums"] },
  pnlNote: { fontSize: theme.type.caption.size, fontWeight: "600", color: ON_INK_MUTED, fontVariant: ["tabular-nums"] },
  pnlNone: { fontSize: theme.type.caption.size, fontWeight: "600", color: ON_INK_MUTED },
  split: {
    flexDirection: "row",
    marginTop: 4,
    paddingTop: 14,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(243,247,238,0.16)",
  },
  cell: { flex: 1, gap: 3 },
  cellLabel: { fontSize: theme.type.caption.size, fontWeight: "600", color: ON_INK_MUTED },
  cellValue: { fontSize: theme.type.title.size, fontWeight: "800", color: theme.colors.onInk, letterSpacing: -0.3, fontVariant: ["tabular-nums"] },
  rule: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: "rgba(243,247,238,0.16)", marginHorizontal: 14 },
  hint: { fontSize: 13, lineHeight: 18, color: ON_INK_MUTED },
  error: { fontSize: 13, lineHeight: 18, color: "#FF8A80" },
  link: { fontWeight: "800", color: theme.colors.lime },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 6 },
  action: { flex: 1 },
  ghost: {
    height: 48,
    paddingHorizontal: 18,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(243,247,238,0.22)",
  },
  ghostText: { fontSize: theme.type.label.size, fontWeight: "700", color: theme.colors.onInk },
});
