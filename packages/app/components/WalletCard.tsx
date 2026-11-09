import * as Clipboard from "expo-clipboard";
import { useState } from "react";
import { Linking, StyleSheet, Text, View } from "react-native";

import { Tappable } from "./Press";
import { Button } from "./kit";
import { juno } from "../lib/api";
import { displayAddress, explorer, NETWORK_NAME } from "../lib/chain";
import { useApi } from "../lib/useApi";
import { theme } from "../theme";

/**
 * The account itself: its NEAR name, what it holds, and how to fund it.
 *
 * On NEAR the account is the name (mira.juno-k3x9.testnet), so there is no
 * separate profile name to claim. The card shows the NEAR balance and how
 * many posts this account holds, read from testnet, and links to the public
 * testnet faucet for more test NEAR.
 *
 * Balances are shown as a dash when the read fails, never as zero.
 */
const FAUCET_URL = "https://near-faucet.io/";

export function WalletCard({ address }: { address: string }) {
  const balances = useApi(() => juno.balances(address), [address]);
  const held = useApi(() => juno.portfolio(address).then((p) => p.positions.filter((x) => x.balance > 0).length), [address]);
  const [copied, setCopied] = useState(false);
  const shown = displayAddress(address);

  const copy = async () => {
    await Clipboard.setStringAsync(shown);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  };

  const figure = (value: number | null | undefined) =>
    balances.loading
      ? "…"
      : value === null || value === undefined || balances.error
        ? "—"
        : value.toFixed(value === 0 ? 2 : value < 1 ? 4 : 2);

  const empty = balances.data?.near !== null && balances.data?.near !== undefined && balances.data.near < 0.05;

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <Text style={styles.label}>Account · {NETWORK_NAME}</Text>
        <Tappable onPress={() => void copy()} to={0.95} accessibilityRole="button" accessibilityLabel="Copy account">
          <View style={styles.copy}>
            <Text style={styles.copyText}>{copied ? "Copied" : "Copy account"}</Text>
          </View>
        </Tappable>
      </View>
      <Text
        style={styles.address}
        selectable
        numberOfLines={1}
        ellipsizeMode="middle"
        onPress={() => void Linking.openURL(explorer("address", address))}
      >
        {shown}
      </Text>

      <View style={styles.balances}>
        <View style={styles.balance}>
          <Text style={styles.amount}>{figure(balances.data?.near)}</Text>
          <Text style={styles.unit}>NEAR</Text>
        </View>
        <View style={styles.rule} />
        <View style={styles.balance}>
          <Text style={styles.amount}>{held.loading ? "…" : held.data === null ? "—" : String(held.data)}</Text>
          <Text style={styles.unit}>posts held</Text>
        </View>
      </View>

      {empty ? (
        <Text style={styles.hint}>Bids, buys and launches spend NEAR (the relayer pays the gas). Fund this account to start.</Text>
      ) : null}

      <Button
        label="Get test NEAR"
        variant={empty ? "lime" : "quiet"}
        onPress={() => void Linking.openURL(FAUCET_URL)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    padding: 16,
    gap: 12,
    ...theme.shadow.card,
  },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  label: { fontSize: 12, fontWeight: "700", color: theme.colors.muted, letterSpacing: 0.2 },
  copy: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: theme.colors.surfaceAlt },
  copyText: { fontSize: 12, fontWeight: "700", color: theme.colors.text },
  address: { fontSize: 13, fontWeight: "600", color: theme.colors.text, fontVariant: ["tabular-nums"] },
  balances: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  balance: { flex: 1, flexDirection: "row", alignItems: "baseline", gap: 6 },
  amount: { fontSize: 20, fontWeight: "800", color: theme.colors.text, fontVariant: ["tabular-nums"] },
  unit: { fontSize: 12, fontWeight: "700", color: theme.colors.muted },
  rule: { width: StyleSheet.hairlineWidth, alignSelf: "stretch", backgroundColor: theme.colors.lineStrong, marginHorizontal: 12 },
  hint: { fontSize: 13, lineHeight: 18, color: theme.colors.muted },
  message: { fontSize: 13, lineHeight: 18 },
  link: { fontWeight: "800", color: theme.colors.focus },
  name: { fontSize: 17, fontWeight: "800", color: theme.colors.text, marginTop: 2 },
  choose: { backgroundColor: theme.colors.lime },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    paddingHorizontal: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
  },
  at: { fontSize: 16, fontWeight: "800", color: theme.colors.muted, marginRight: 2 },
  nameInput: { flex: 1, fontSize: 16, fontWeight: "700", color: theme.colors.text },
});
