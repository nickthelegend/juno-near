import { Image as ExpoImage } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { CurvePreview } from "../../components/CurvePreview";
import { Button, Card, Pill } from "../../components/kit";
import { APP_URL, juno } from "../../lib/api";
import { describeTxError, explorer, FACTORY, NETWORK_NAME } from "../../lib/chain";
import { feedChanged } from "../../lib/refresh";
import { useTabBarHeight } from "../../lib/tabbar";
import { useWallet } from "../../lib/wallet";
import { theme } from "../../theme";

/**
 * Post — which here means launching a real market on NEAR.
 *
 * Publishing calls `create_post` on the Juno factory. The factory creates a
 * named sub-account (`<name>.<factory>`), deploys the market contract to it
 * and initialises it in the same transaction: the post *is* that account.
 * The 3 NEAR attached pays for the account's storage; a dare bond is added on
 * top and held by the post until holders vote on the proof.
 *
 * The new post opens with a one-minute sealed-bid auction, a minute of
 * reveals, then its bonding curve.
 *
 * Media is a URL stored on-chain (300 characters at most). There is no Juno
 * upload server on NEAR, so the picker offers Juno's own art (served by this
 * app) or any https image URL.
 */

/** Juno's own art, served from this app's /art. Square, so it sits in the feed as a photo would. */
const ART = [
  "/art/juno-feature-1.webp",
  "/art/juno-feature-2.webp",
  "/art/juno-feature-3.webp",
  "/art/juno-social-square.webp",
  "/art/juno-mark.webp",
  "/art/juno-object-2.webp",
];

const KINDS = [
  { id: "plain", label: "Plain post", blurb: "A sealed-bid opening, then the curve. Holders can always redeem against the floor." },
  { id: "dare", label: "Dare post", blurb: "Put NEAR behind a promise. Holders vote on your proof; flake and the bond is split among them." },
] as const;

export default function PostScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const [media, setMedia] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [name, setName] = useState("");
  const { format } = useLocalSearchParams<{ format?: string }>();
  const [kind, setKind] = useState<"plain" | "dare">(format === "dare" ? "dare" : "plain");
  useEffect(() => {
    if (format === "dare" || format === "post") setKind(format === "dare" ? "dare" : "plain");
  }, [format]);
  const [dare, setDare] = useState("");
  const [bond, setBond] = useState("0.5");
  const [status, setStatus] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const note = (entry: Omit<LogEntry, "at">) => setLog((current) => [...current, { ...entry, at: new Date() }]);
  const scroller = useRef<ScrollView>(null);
  const TAB_H = useTabBarHeight().height;
  useEffect(() => {
    if (log.length > 0) setTimeout(() => scroller.current?.scrollToEnd({ animated: true }), 60);
  }, [log.length]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const slug = name.trim().toLowerCase();
  const slugOk = /^[a-z0-9-]{2,32}$/.test(slug) && !slug.startsWith("-") && !slug.endsWith("-");
  const captionBytes = new TextEncoder().encode(caption.trim()).length;
  const captionOk = captionBytes <= MAX_CAPTION;
  const bondNear = Number(bond);
  const dareOk = kind === "plain" || (dare.trim().length > 0 && new TextEncoder().encode(dare.trim()).length <= 300 && bondNear > 0 && bondNear <= 2);
  const chosen = media ?? (/^https:\/\/\S{6,290}$/.test(mediaUrl.trim()) ? mediaUrl.trim() : null);
  const canLaunch = !!chosen && slugOk && captionOk && dareOk && !busy && !!FACTORY;
  const missing = !FACTORY
    ? "Setup required: EXPO_PUBLIC_JUNO_FACTORY"
    : !chosen
      ? "Pick art or paste an https image URL"
      : !slugOk
        ? "Name it: 2–32 lowercase letters, digits or dashes"
        : !captionOk
          ? "Caption is too long"
          : !dareOk
            ? "A dare needs its promise and a bond up to 2 NEAR"
            : null;

  async function finish(account: string) {
    setStatus("Live");
    feedChanged();
    await new Promise((resolve) => setTimeout(resolve, 3500));
    setStatus(null);
    setMedia(null);
    setMediaUrl("");
    setName("");
    setCaption("");
    setDare("");
    setKind("plain");
    router.push(`/coin/${account}`);
  }

  async function launch() {
    if (!chosen) return;
    setBusy(true);
    setError(null);
    setLog([]);
    try {
      await (wallet.address ? Promise.resolve(wallet.address) : wallet.connect());
      setStatus("Building the launch…");
      const built = juno.buildLaunch({
        slug,
        caption: caption.trim(),
        mediaUrl: chosen,
        dare: kind === "dare" ? dare.trim() : "",
        dareBondNear: kind === "dare" ? bondNear : 0,
      });
      const sent = await wallet.send(built.steps, {
        onProgress: (at) =>
          setStatus(
            at.phase === "signing"
              ? wallet.via === "wallet"
                ? `${at.label}: approve it in your wallet…`
                : `${at.label}: signing on this device…`
              : at.phase === "confirming"
                ? wallet.via === "wallet"
                  ? `${at.label}: confirming on ${NETWORK_NAME}…`
                  : `${at.label}: relaying to ${NETWORK_NAME}…`
                : `${at.label}: final`,
          ),
      });
      const launchHash = sent.hashes[sent.hashes.length - 1]!;
      note({ label: "create_post final on NEAR testnet", receipt: launchHash, kind: "tx" });
      note({ label: "Post account created", receipt: built.account, kind: "address" });
      await finish(built.account);
    } catch (caught) {
      const failure = describeTxError(caught);
      setError(failure.cancelled ? null : failure.message || "Launch failed");
      setStatus(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scroller}
          contentContainerStyle={[styles.body, { paddingBottom: TAB_H + 24 }]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Post a photo</Text>
          <Text style={styles.lede}>
            Publishing creates this post&apos;s own NEAR account with its market inside: a sealed-bid opening, a bonding
            curve priced in NEAR, and a floor every holder can redeem. The post is the market.
          </Text>

          <MediaPicker media={chosen} onPick={setMedia} disabled={busy} />
          {media ? null : (
            <TextInput
              value={mediaUrl}
              onChangeText={setMediaUrl}
              placeholder="…or paste an https image URL"
              placeholderTextColor={theme.colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              maxLength={300}
            />
          )}

          <Card style={styles.form}>
            <Field
              label="Name"
              hint={name.length > 0 && !slugOk ? "2–32 lowercase letters, digits or dashes" : undefined}
              note={slugOk && FACTORY ? `${slug}.${FACTORY} · ticker $${slug.toUpperCase()}` : undefined}
            >
              <TextInput
                value={name}
                onChangeText={(next) => setName(next.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                placeholder="night-market"
                placeholderTextColor={theme.colors.faint}
                autoCapitalize="none"
                style={styles.input}
                maxLength={32}
              />
            </Field>

            <Field label="Caption" hint={!captionOk ? `${captionBytes - MAX_CAPTION} bytes over the limit` : undefined}>
              <TextInput
                value={caption}
                onChangeText={setCaption}
                placeholder="Say what this is"
                placeholderTextColor={theme.colors.faint}
                multiline
                style={[styles.input, styles.caption]}
                maxLength={MAX_CAPTION + 20}
              />
            </Field>
          </Card>

          <Text style={styles.sectionTitle}>Kind</Text>
          <Text style={styles.sectionLede}>
            Every post uses the same sixteen-segment weighted curve, priced in NEAR. 20% of every buy goes into the floor.
          </Text>

          <View style={styles.presets}>
            {KINDS.map((option) => {
              const on = kind === option.id;
              return (
                <Pressable key={option.id} onPress={() => setKind(option.id)}>
                  <Card style={[styles.preset, on && styles.presetOn]}>
                    <View style={styles.presetRow}>
                      <View style={styles.presetText}>
                        <View style={styles.presetHead}>
                          <Text style={styles.presetLabel}>{option.label}</Text>
                          {on && <Pill label="Selected" tone="lime" />}
                        </View>
                        <Text style={styles.presetBlurb}>{option.blurb}</Text>
                      </View>
                      <CurvePreview preset="content" active={on} />
                    </View>
                    {on && option.id === "dare" ? (
                      <View style={{ gap: 10, marginTop: 8 }}>
                        <TextInput
                          value={dare}
                          onChangeText={setDare}
                          placeholder="I will post the sunrise from the summit by Friday"
                          placeholderTextColor={theme.colors.faint}
                          style={styles.input}
                          maxLength={300}
                        />
                        <TextInput
                          value={bond}
                          onChangeText={(next) => setBond(next.replace(/[^0-9.]/g, ""))}
                          placeholder="Bond in NEAR"
                          placeholderTextColor={theme.colors.faint}
                          keyboardType="decimal-pad"
                          style={styles.input}
                          maxLength={6}
                        />
                      </View>
                    ) : null}
                  </Card>
                </Pressable>
              );
            })}
          </View>

          {error && (
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          )}

          {log.length > 0 ? <LaunchLog entries={log} /> : null}

          <Button
            label={status ?? `Launch post · ${kind === "dare" && bondNear > 0 ? 3 + bondNear : 3} NEAR`}
            tall
            onPress={launch}
            loading={busy}
            disabled={!canLaunch}
          />
          {!busy && missing ? <Text style={styles.missing}>{missing}</Text> : null}
          {busy && status ? <Text style={styles.missing}>{status}</Text> : null}
          <Text style={styles.footnote}>
            {wallet.via === "wallet"
              ? "One approval in your wallet: your account pays the gas and the 3 NEAR that funds the post account's storage. Bids, buys and redemptions all land on that account."
              : "One signature, relayed as a NEP-366 meta transaction: the relayer pays the gas, your account pays the 3 NEAR that funds the post account's storage. Bids, buys and redemptions all land on that account."}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const MAX_CAPTION = 400;

/** Juno's art as a grid to pick from, then the pick previewed at its own shape. */
function MediaPicker({ media, onPick, disabled }: { media: string | null; onPick: (path: string | null) => void; disabled: boolean }) {
  if (!media) {
    return (
      <View style={[styles.drop, { paddingVertical: 18 }]}>
        <Text style={styles.dropTitle}>Pick the art</Text>
        <View style={styles.grid}>
          {ART.map((path) => (
            <Pressable key={path} onPress={() => onPick(path)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Use ${path}`} style={styles.cell}>
              <ExpoImage source={{ uri: `${APP_URL}${path}` }} style={StyleSheet.absoluteFill} contentFit="cover" />
            </Pressable>
          ))}
        </View>
        <Text style={styles.dropBlurb}>Square works best.</Text>
      </View>
    );
  }
  return (
    <View style={[styles.preview, { aspectRatio: 1 }]}>
      <ExpoImage source={{ uri: juno.media(media) ?? undefined }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <Pressable onPress={() => onPick(null)} disabled={disabled} style={styles.change} accessibilityRole="button">
        <Text style={styles.changeText}>Change</Text>
      </Pressable>
    </View>
  );
}

function Field({ label, hint, note, children }: { label: string; hint?: string; note?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      {note ? <Text style={styles.fieldNote} numberOfLines={1}>{note}</Text> : null}
    </View>
  );
}

const MONO = Platform.select({ ios: "Menlo", default: "monospace" });

type LogEntry = { label: string; receipt: string; kind?: "tx" | "address"; at: Date };

function shorten(value: string): string {
  const bare = value.replace(/^ipfs:\/\//, "");
  return bare.length > 14 ? `${bare.slice(0, 6)}…${bare.slice(-6)}` : bare;
}

/** The launch, step by step, with each receipt and the second it landed. */
function LaunchLog({ entries }: { entries: LogEntry[] }) {
  return (
    <View style={styles.log}>
      {entries.map((entry, index) => (
        <Pressable
          key={`${entry.label}-${index}`}
          disabled={!entry.kind}
          onPress={() => (entry.kind ? void Linking.openURL(explorer(entry.kind, entry.receipt)) : undefined)}
          style={styles.logRow}
          accessibilityRole={entry.kind ? "link" : undefined}
        >
          <Text style={styles.logTick}>✓</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.logLabel}>{entry.label}</Text>
            <Text style={styles.logReceipt} numberOfLines={1}>
              {entry.kind === "tx" ? "tx " : entry.receipt.startsWith("ipfs://") ? "ipfs " : ""}
              {shorten(entry.receipt)}
            </Text>
          </View>
          <Text style={styles.logTime}>
            {entry.at.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.bg },
  body: { paddingHorizontal: 16, paddingBottom: 140, gap: 12 },
  title: { fontSize: theme.type.screen.size, fontWeight: "800", color: theme.colors.ink },
  lede: { fontSize: theme.type.body.size, color: theme.colors.muted, lineHeight: 21 },
  form: { gap: 16 },
  fieldLabel: { fontSize: theme.type.label.size, fontWeight: "500", color: theme.colors.muted },
  fieldHint: { fontSize: theme.type.micro.size, fontWeight: "500", color: theme.colors.neg },
  fieldNote: { fontSize: theme.type.micro.size, fontWeight: "600", color: theme.colors.muted },
  grid: { alignSelf: "stretch", flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 14, justifyContent: "center" },
  cell: { width: "31%", aspectRatio: 1, borderRadius: 14, overflow: "hidden", backgroundColor: theme.colors.surfaceAlt },
  input: {
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surfaceAlt,
    paddingHorizontal: 16,
    fontSize: theme.type.body.size,
    color: theme.colors.text,
  },
  sectionTitle: { fontSize: theme.type.title.size, fontWeight: "700", color: theme.colors.text, marginTop: 8 },
  sectionLede: { fontSize: theme.type.label.size, fontWeight: "500", color: theme.colors.muted, lineHeight: 19 },
  presets: { gap: 8 },
  preset: { gap: 6, padding: 16 },
  presetOn: { borderWidth: 2, borderColor: theme.colors.lime },
  presetRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  presetText: { flex: 1, gap: 6 },
  presetHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  presetLabel: { fontSize: theme.type.body.size, fontWeight: "600", color: theme.colors.ink },
  presetBlurb: { fontSize: theme.type.label.size, fontWeight: "500", color: theme.colors.muted, lineHeight: 19 },
  errorCard: { backgroundColor: "rgba(217,45,32,0.08)" },
  errorText: { fontSize: theme.type.body.size, color: theme.colors.neg, lineHeight: 21 },
  caption: { height: 88, paddingTop: 12, textAlignVertical: "top" },
  log: {
    backgroundColor: theme.colors.ink,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  logRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  logTick: { color: theme.colors.lime, fontSize: 14, fontWeight: "900" },
  logLabel: { color: theme.colors.onInk, fontSize: 14, fontWeight: "700" },
  logReceipt: { color: "#9FB09A", fontSize: 12, fontFamily: MONO, marginTop: 2 },
  logTime: { color: "#9FB09A", fontSize: 12, fontFamily: MONO },
  missing: { fontSize: theme.type.label.size, fontWeight: "600", color: theme.colors.muted, textAlign: "center" },
  drop: {
    width: "100%",
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.line,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  dropDisc: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.lime,
  },
  dropPlus: { fontSize: 30, fontWeight: "600", color: theme.colors.onLime, marginTop: -3 },
  dropTitle: { fontSize: theme.type.body.size, fontWeight: "800", color: theme.colors.text },
  dropBlurb: { fontSize: theme.type.label.size, color: theme.colors.muted },
  preview: {
    width: "100%",
    borderRadius: theme.radius.lg,
    overflow: "hidden",
    backgroundColor: theme.colors.ink,
  },
  change: {
    position: "absolute",
    right: 12,
    bottom: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  changeText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  footnote: { fontSize: theme.type.micro.size, fontWeight: "500", color: theme.colors.faint, lineHeight: 16, marginTop: 8 },
});
