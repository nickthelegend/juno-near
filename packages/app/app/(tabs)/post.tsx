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

import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from "react-native-svg";

import { Handle } from "../../components/Handle";
import { CheckGlyph } from "../../components/icons";
import { Button, Card } from "../../components/kit";
import { APP_URL, juno } from "../../lib/api";
import { describeTxError, explorer, FACTORY, NETWORK_NAME, RPC_URL } from "../../lib/chain";
import { pickPhoto, type Photo } from "../../lib/photo";
import { feedChanged } from "../../lib/refresh";
import { useTabBarHeight } from "../../lib/tabbar";
import { useWallet, type SendProgress } from "../../lib/wallet";
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
 * upload server: a photo from the camera or the library is shrunk to a JPEG
 * and stored on NEAR itself, as the arguments of one `fs_store` call to the
 * factory's media account (lib/photo.ts); NEARFS serves those bytes by CID,
 * and that URL is what the post records. Juno's own art or any https image
 * URL work too.
 */

/** Juno's own art, served from this app's /art. Square, so it sits in the feed as a photo would. */
const ART = [
  "/art/juno-feature-1.webp",
  "/art/juno-feature-2.webp",
  "/art/juno-feature-3.webp",
  "/art/juno-social-square.webp",
  "/art/juno-mark.webp",
  "/art/juno-object-2.webp",
  "/art/juno-mobile-hero.webp",
  "/art/juno-onboard-1.webp",
  "/art/juno-onboard-2.webp",
];

const KINDS = [
  { id: "plain", label: "Plain post", blurb: "A sealed-bid opening, then the curve. Holders can always redeem against the floor." },
  { id: "dare", label: "Dare post", blurb: "Put NEAR behind a promise. Holders vote on your proof; flake and the bond is split among them." },
] as const;

export default function PostScreen() {
  const router = useRouter();
  const wallet = useWallet();
  const [media, setMedia] = useState<string | null>(null);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [mediaUrl, setMediaUrl] = useState("");
  const [caption, setCaption] = useState("");
  const [name, setName] = useState("");
  const { format } = useLocalSearchParams<{ format?: string }>();
  const [kind, setKind] = useState<"plain" | "dare">(format === "dare" ? "dare" : "plain");
  useEffect(() => {
    if (format === "dare" || format === "post") setKind(format === "dare" ? "dare" : "plain");
  }, [format]);
  const [dare, setDare] = useState("");
  const [bond, setBond] = useState("0.2");
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
  // Names are unique on the factory: check before anything is sent (a photo stored for a taken name would be wasted).
  const [taken, setTaken] = useState<string | null>(null);

  const slug = name.trim().toLowerCase();
  const slugOk = /^[a-z0-9-]{2,32}$/.test(slug) && !slug.startsWith("-") && !slug.endsWith("-");
  const captionBytes = new TextEncoder().encode(caption.trim()).length;
  const captionOk = captionBytes <= MAX_CAPTION;
  const bondNear = Number(bond);
  const dareOk = kind === "plain" || (dare.trim().length > 0 && new TextEncoder().encode(dare.trim()).length <= 300 && bondNear > 0 && bondNear <= 2);
  const chosen = photo ? photo.uri : (media ?? (/^https:\/\/\S{6,290}$/.test(mediaUrl.trim()) ? mediaUrl.trim() : null));
  useEffect(() => {
    if (!slugOk || !FACTORY) {
      setTaken(null);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      nameTaken(slug)
        .then((t) => live && setTaken(t ? slug : null))
        .catch(() => undefined);
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [slug, slugOk]);
  const canLaunch = !!chosen && slugOk && taken !== slug && captionOk && dareOk && !busy && !!FACTORY;
  const missing = !FACTORY
    ? "Setup required: EXPO_PUBLIC_JUNO_FACTORY"
    : !chosen
      ? "Choose a photo, pick art or paste an https image URL"
      : !slugOk
        ? "Name it: 2–32 lowercase letters, digits or dashes"
        : taken === slug
          ? "A post with that name already exists. Pick another name."
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
    setPhoto(null);
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
      if (await nameTaken(slug)) {
        setTaken(slug);
        throw new Error("A post with that name already exists. Pick another name.");
      }
      const onProgress = (at: SendProgress) =>
        setStatus(
          at.phase === "checking"
            ? `${at.label}: checking with ${NETWORK_NAME}…`
            : at.phase === "signing"
              ? wallet.via === "email"
                ? `${at.label}: signing on this device…`
                : `${at.label}: approve it in ${wallet.walletName ?? "your wallet"}…`
              : at.phase === "confirming"
                ? `${at.label}: confirming on ${NETWORK_NAME}…`
                : `${at.label}: final`,
        );
      let mediaFor = chosen;
      if (photo) {
        // The photo goes on NEAR first; the post then points at its NEARFS address.
        const stored = await wallet.send([juno.buildStorePhoto(photo.bytes)], { onProgress });
        note({ label: `Photo stored on NEAR (${Math.round(photo.size / 1000)} kB)`, receipt: stored.hashes[0]!, kind: "tx" });
        setStatus("NEARFS is indexing your photo…");
        await servedBy(photo.url);
        note({ label: "Served by NEARFS", receipt: `ipfs://${photo.cid}` });
        mediaFor = photo.url;
      }
      setStatus("Building the launch…");
      const built = juno.buildLaunch({
        slug,
        caption: caption.trim(),
        mediaUrl: mediaFor,
        dare: kind === "dare" ? dare.trim() : "",
        dareBondNear: kind === "dare" ? bondNear : 0,
      });
      const sent = await wallet.send(built.steps, { onProgress });
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

  // The post contract reports its symbol as the name in capitals (ft_metadata), dashes included.
  const ticker = slug.toUpperCase();
  const steps = [
    { label: "Photo", done: !!chosen },
    { label: "Details", done: slugOk && taken !== slug && captionOk },
    { label: "Launch", done: status === "Live" },
  ];

  return (
    <SafeAreaView style={styles.screen} edges={["top"]}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <ScrollView
          ref={scroller}
          contentContainerStyle={[styles.body, { paddingBottom: TAB_H + 24 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>New post</Text>
            <View style={styles.headerChip}>
              <Text style={styles.headerChipText}>Launches its own coin</Text>
            </View>
          </View>

          {/* Where you are: photo, details, launch. */}
          <View style={styles.steps}>
            {steps.map((step, i) => (
              <View key={step.label} style={styles.step}>
                <View style={[styles.stepDot, step.done ? styles.stepDotDone : null]}>
                  {step.done ? <CheckGlyph size={11} color={theme.colors.onLime} /> : <Text style={styles.stepNum}>{i + 1}</Text>}
                </View>
                <Text style={[styles.stepLabel, step.done ? { color: theme.colors.text } : null]}>{step.label}</Text>
              </View>
            ))}
          </View>

          <MediaPicker
            media={chosen}
            photo={photo}
            name={slugOk ? slug : null}
            ticker={slugOk ? ticker : null}
            caption={caption.trim()}
            creator={wallet.address}
            onPick={(path) => {
              setMedia(path);
              if (!path) setPhoto(null);
            }}
            onPhoto={(next) => {
              setError(null);
              setPhoto(next);
            }}
            onError={setError}
            disabled={busy}
          />
          {media || photo ? null : (
            <TextInput
              value={mediaUrl}
              onChangeText={setMediaUrl}
              placeholder="…or paste an https image link"
              placeholderTextColor={theme.colors.faint}
              autoCapitalize="none"
              autoCorrect={false}
              style={styles.input}
              maxLength={300}
            />
          )}

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Details</Text>
            <Field
              label="Name"
              hint={name.length > 0 && !slugOk ? "2–32 lowercase letters, digits or dashes" : undefined}
              note={!slugOk ? undefined : taken === slug ? { text: "That name is taken. Pick another.", tone: "neg" } : { text: "Available · names are unique on Juno", tone: "pos" }}
            >
              <View style={styles.nameRow}>
                <TextInput
                  value={name}
                  onChangeText={(next) => setName(next.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                  placeholder="night-market"
                  placeholderTextColor={theme.colors.faint}
                  autoCapitalize="none"
                  style={styles.nameInput}
                  maxLength={32}
                />
                <View style={[styles.ticker, slugOk ? styles.tickerOn : null]}>
                  <Text style={styles.tickerText} numberOfLines={1}>{slugOk ? `$${ticker}` : "$TICKER"}</Text>
                </View>
              </View>
            </Field>

            <Field label="Caption" counter={`${captionBytes}/${MAX_CAPTION}`} hint={!captionOk ? `${captionBytes - MAX_CAPTION} bytes over the limit` : undefined}>
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
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Launch settings</Text>
            <View style={styles.kinds}>
              {KINDS.map((option) => {
                const on = kind === option.id;
                return (
                  <Pressable key={option.id} onPress={() => setKind(option.id)} style={[styles.kind, on ? styles.kindOn : null]} accessibilityRole="radio" accessibilityState={{ checked: on }}>
                    <Text style={[styles.kindText, on ? styles.kindTextOn : null]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <Text style={styles.kindBlurb}>{KINDS.find((option) => option.id === kind)!.blurb}</Text>

            {kind === "dare" ? (
              <View style={{ gap: 10 }}>
                <TextInput
                  value={dare}
                  onChangeText={setDare}
                  placeholder="I will post the sunrise from the summit by Friday"
                  placeholderTextColor={theme.colors.faint}
                  style={styles.input}
                  maxLength={300}
                />
                <View style={styles.nameRow}>
                  <TextInput
                    value={bond}
                    onChangeText={(next) => setBond(next.replace(/[^0-9.]/g, ""))}
                    placeholder="0.02"
                    placeholderTextColor={theme.colors.faint}
                    keyboardType="decimal-pad"
                    style={styles.nameInput}
                    maxLength={6}
                  />
                  <View style={styles.ticker}>
                    <Text style={styles.tickerText}>NEAR bond</Text>
                  </View>
                </View>
              </View>
            ) : null}

            {/* What happens after Launch, in the order it happens. */}
            <View style={styles.plan}>
              <PlanRow at="0:00" title="Sealed bids open" detail="1 minute · 200 tokens · 1 NEAR escrow per bid" now />
              <PlanRow at="1:00" title="Bidders reveal" detail="1 minute · unrevealed bids refunded minus 1%" />
              <PlanRow at="2:00" title="Settle at one price, then the curve" detail="Every winner pays the same price · then 800 tokens on a NEAR curve, 20% of every buy into the floor" last={kind !== "dare"} />
              {kind === "dare" ? <PlanRow at="5:00" title="Holders vote on your proof" detail="Accepted: your bond comes back · rejected: holders split it" last /> : null}
            </View>
            <View style={styles.cost}>
              <Text style={styles.costLabel}>You pay</Text>
              <Text style={styles.costValue}>{kind === "dare" && bondNear > 0 ? `3 NEAR + ${bondNear} NEAR bond` : "3 NEAR for the post account"}</Text>
            </View>
          </View>

          {error && (
            <Card style={styles.errorCard}>
              <Text style={styles.errorText}>{error}</Text>
            </Card>
          )}

          {log.length > 0 ? <LaunchLog entries={log} /> : null}

          <Button
            label={status ?? `Launch post · ${kind === "dare" && bondNear > 0 ? +(3 + bondNear).toFixed(4) : 3} NEAR`}
            tall
            onPress={launch}
            loading={busy}
            disabled={!canLaunch}
          />
          {!busy && missing ? <Text style={styles.missing}>{missing}</Text> : null}
          {busy && status ? <Text style={styles.missing}>{status}</Text> : null}
          <Text style={styles.footnote}>
            {photo ? "Two approvals: your photo goes on NEAR, then the launch." : "One approval."} The 3 NEAR funds the post account&apos;s storage; its own contract holds every bid, buy and floor from then on.
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const MAX_CAPTION = 400;

/** Whether `<slug>.<factory>` already exists on NEAR testnet (a post is that account, so names are unique). */
async function nameTaken(slug: string): Promise<boolean> {
  if (!FACTORY) return false;
  const response = await fetch(RPC_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "query", params: { request_type: "view_account", finality: "optimistic", account_id: `${slug}.${FACTORY}` } }),
  });
  const body = (await response.json()) as { result?: unknown; error?: { cause?: { name?: string } } };
  if (body.result) return true;
  if (body.error?.cause?.name === "UNKNOWN_ACCOUNT") return false;
  throw new Error("Could not check the name on NEAR testnet. Try again.");
}

/** Waits (up to ~40 s) until NEARFS serves the stored photo, so the new post shows it straight away. */
async function servedBy(url: string): Promise<void> {
  for (let i = 0; i < 20; i++) {
    const ok = await fetch(url, { method: "HEAD" }).then((r) => r.ok).catch(() => false);
    if (ok) return;
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
}

function PlanRow({ at, title, detail, now, last }: { at: string; title: string; detail: string; now?: boolean; last?: boolean }) {
  return (
    <View style={styles.planRow}>
      <View style={styles.planRail}>
        <View style={[styles.planDot, now ? styles.planDotNow : null]} />
        {last ? null : <View style={styles.planLine} />}
      </View>
      <Text style={styles.planAt}>{at}</Text>
      <View style={{ flex: 1, minWidth: 0, gap: 1, paddingBottom: last ? 0 : 12 }}>
        <Text style={styles.planTitle}>{title}</Text>
        <Text style={styles.planDetail}>{detail}</Text>
      </View>
    </View>
  );
}

function CameraGlyph({ size = 28, color = theme.colors.onLime }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M4 8.5A2 2 0 0 1 6 6.5h1.8l1.4-2h5.6l1.4 2H18a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
      <Circle cx={12} cy={12.5} r={3.4} stroke={color} strokeWidth={1.9} />
    </Svg>
  );
}

function LibraryGlyph({ size = 20, color = theme.colors.onLime }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={4.5} width={17} height={15} rx={2.5} stroke={color} strokeWidth={1.9} />
      <Circle cx={9} cy={9.5} r={1.6} fill={color} />
      <Path d="m4.5 17 4.5-4.5 3.5 3.5 2.5-2.5 4.5 4.5" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
    </Svg>
  );
}

/**
 * The photo: take one or choose one (or use Juno's art), then see it as the
 * feed will show it — the picture with its name, ticker and caption over it.
 */
function MediaPicker({
  media,
  photo,
  name,
  ticker,
  caption,
  creator,
  onPick,
  onPhoto,
  onError,
  disabled,
}: {
  media: string | null;
  photo: Photo | null;
  name: string | null;
  ticker: string | null;
  caption: string;
  creator: string | null;
  onPick: (path: string | null) => void;
  onPhoto: (photo: Photo) => void;
  onError: (message: string) => void;
  disabled: boolean;
}) {
  const [picking, setPicking] = useState<"library" | "camera" | null>(null);
  const choose = async (from: "library" | "camera") => {
    setPicking(from);
    try {
      const next = await pickPhoto(from);
      if (next) onPhoto(next);
    } catch (caught) {
      onError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPicking(null);
    }
  };
  if (!media) {
    return (
      <View style={styles.drop}>
        <View style={styles.dropDisc}>
          <CameraGlyph size={30} />
        </View>
        <Text style={styles.dropTitle}>Add your photo</Text>
        <Text style={styles.dropBlurb}>It is stored on NEAR itself. No upload server.</Text>
        <View style={styles.photoRow}>
          <Pressable onPress={() => void choose("camera")} disabled={disabled || !!picking} style={[styles.source, styles.sourceInk]} accessibilityRole="button" accessibilityLabel="Take photo">
            <CameraGlyph size={20} color={theme.colors.lime} />
            <Text style={[styles.sourceText, { color: theme.colors.onInk }]}>{picking === "camera" ? "Opening…" : "Take photo"}</Text>
          </Pressable>
          <Pressable onPress={() => void choose("library")} disabled={disabled || !!picking} style={[styles.source, styles.sourceLime]} accessibilityRole="button" accessibilityLabel="Choose photo">
            <LibraryGlyph />
            <Text style={styles.sourceText}>{picking === "library" ? "Opening…" : "Choose photo"}</Text>
          </Pressable>
        </View>
        <View style={styles.orRow}>
          <View style={styles.orRule} />
          <Text style={styles.orText}>or use Juno&apos;s art</Text>
          <View style={styles.orRule} />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.artStrip}>
          {ART.map((path) => (
            <Pressable key={path} onPress={() => onPick(path)} disabled={disabled} accessibilityRole="button" accessibilityLabel={`Use ${path}`} style={styles.artCell}>
              <ExpoImage source={{ uri: `${APP_URL}${path}` }} style={StyleSheet.absoluteFill} contentFit="cover" />
            </Pressable>
          ))}
        </ScrollView>
      </View>
    );
  }
  return (
    <View style={styles.preview}>
      <ExpoImage source={{ uri: photo ? photo.uri : (juno.media(media) ?? undefined) }} style={StyleSheet.absoluteFill} contentFit="cover" />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%" preserveAspectRatio="none" viewBox="0 0 100 100" pointerEvents="none">
        <Defs>
          <LinearGradient id="shade" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0.45" stopColor="#07080A" stopOpacity="0" />
            <Stop offset="1" stopColor="#07080A" stopOpacity="0.82" />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={100} height={100} fill="url(#shade)" />
      </Svg>
      <View style={styles.previewTop}>
        <View style={styles.photoTag}>
          <Text style={styles.changeText}>{photo ? `${Math.round(photo.size / 1000)} kB · goes on NEAR at launch` : "Preview · how the feed shows it"}</Text>
        </View>
        <Pressable onPress={() => onPick(null)} disabled={disabled} style={styles.change} accessibilityRole="button">
          <Text style={styles.changeText}>Change</Text>
        </Pressable>
      </View>
      <View style={styles.previewFoot} pointerEvents="none">
        <View style={styles.previewNameRow}>
          <Text style={styles.previewName} numberOfLines={1}>{name ? name.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()) : "Your post"}</Text>
          {ticker ? (
            <View style={styles.previewTicker}>
              <Text style={styles.previewTickerText}>${ticker}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.previewCaption} numberOfLines={2}>
          {caption || "Your caption shows here."}
        </Text>
        <View style={styles.previewChip}>
          <Text style={styles.previewChipText}>Sealed-bid opening · 1:00</Text>
        </View>
        {creator ? <Text style={styles.previewBy}>by <Handle wallet={creator} /></Text> : null}
      </View>
    </View>
  );
}

function Field({ label, hint, note, counter, children }: { label: string; hint?: string; note?: { text: string; tone: "pos" | "neg" }; counter?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Text style={styles.fieldLabel}>{label}</Text>
        {counter ? <Text style={styles.fieldCounter}>{counter}</Text> : null}
      </View>
      {children}
      {hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
      {note ? <Text style={[styles.fieldNote, { color: note.tone === "pos" ? theme.colors.pos : theme.colors.neg }]} numberOfLines={1}>{note.tone === "pos" ? "✓ " : ""}{note.text}</Text> : null}
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

const c = theme.colors;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.bg },
  body: { paddingHorizontal: 16, paddingBottom: 140, gap: 14 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 8 },
  title: { fontSize: theme.type.screen.size, lineHeight: theme.type.screen.height, letterSpacing: theme.type.screen.tracking, fontWeight: "800", color: c.ink },
  headerChip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, backgroundColor: c.ink },
  headerChipText: { fontSize: theme.type.caption.size, fontWeight: "700", color: c.lime },
  steps: { flexDirection: "row", gap: 8 },
  step: { flex: 1, flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 999, backgroundColor: "rgba(18,21,14,0.06)" },
  stepDot: { width: 20, height: 20, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: c.surface },
  stepDotDone: { backgroundColor: c.lime },
  stepNum: { fontSize: theme.type.micro.size, fontWeight: "800", color: c.muted },
  stepLabel: { fontSize: theme.type.caption.size, fontWeight: "700", color: c.muted },
  card: { backgroundColor: c.surface, borderRadius: theme.radius.lg, padding: 16, gap: 14, ...theme.shadow.card },
  cardTitle: { fontSize: theme.type.title.size, fontWeight: "800", color: c.text, letterSpacing: -0.4 },
  fieldLabel: { fontSize: theme.type.label.size, fontWeight: "600", color: c.muted },
  fieldCounter: { fontSize: theme.type.micro.size, fontWeight: "600", color: c.faint, fontVariant: ["tabular-nums"] },
  fieldHint: { fontSize: theme.type.micro.size, fontWeight: "500", color: c.neg },
  fieldNote: { fontSize: theme.type.caption.size, fontWeight: "700" },
  input: {
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: c.surfaceAlt,
    paddingHorizontal: 16,
    fontSize: theme.type.body.size,
    color: c.text,
  },
  nameRow: { flexDirection: "row", alignItems: "center", height: 52, borderRadius: theme.radius.md, backgroundColor: c.surfaceAlt, paddingLeft: 16, paddingRight: 6 },
  nameInput: { flex: 1, minWidth: 0, fontSize: theme.type.body.size, fontWeight: "700", color: c.text, height: 52 },
  ticker: { maxWidth: 150, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: c.surface },
  tickerOn: { backgroundColor: c.lime },
  tickerText: { fontSize: theme.type.caption.size, fontWeight: "800", color: c.text },
  caption: { height: 88, paddingTop: 12, textAlignVertical: "top" },
  kinds: { flexDirection: "row", padding: 4, borderRadius: 999, backgroundColor: c.surfaceAlt, gap: 4 },
  kind: { flex: 1, height: 40, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  kindOn: { backgroundColor: c.ink },
  kindText: { fontSize: theme.type.label.size, fontWeight: "700", color: c.muted },
  kindTextOn: { color: c.lime },
  kindBlurb: { fontSize: theme.type.label.size, fontWeight: "500", color: c.muted, lineHeight: 19, marginTop: -4 },
  plan: { padding: 14, borderRadius: theme.radius.md, backgroundColor: c.surfaceAlt },
  planRow: { flexDirection: "row", gap: 10 },
  planRail: { width: 12, alignItems: "center" },
  planDot: { width: 10, height: 10, borderRadius: 5, marginTop: 4, backgroundColor: c.lineStrong },
  planDotNow: { backgroundColor: c.lime, borderWidth: 2, borderColor: c.ink },
  planLine: { flex: 1, width: 2, marginTop: 2, backgroundColor: c.lineStrong },
  planAt: { width: 38, fontSize: theme.type.caption.size, fontWeight: "800", color: c.text, marginTop: 1, fontVariant: ["tabular-nums"] },
  planTitle: { fontSize: theme.type.label.size, fontWeight: "800", color: c.text },
  planDetail: { fontSize: theme.type.caption.size, fontWeight: "500", color: c.muted, lineHeight: 16 },
  cost: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingTop: 2 },
  costLabel: { fontSize: theme.type.label.size, fontWeight: "600", color: c.muted },
  costValue: { fontSize: theme.type.label.size, fontWeight: "800", color: c.text },
  errorCard: { backgroundColor: "rgba(217,45,32,0.08)" },
  errorText: { fontSize: theme.type.body.size, color: c.neg, lineHeight: 21 },
  log: { backgroundColor: c.ink, borderRadius: 16, paddingVertical: 6, paddingHorizontal: 14 },
  logRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  logTick: { color: c.lime, fontSize: 14, fontWeight: "900" },
  logLabel: { color: c.onInk, fontSize: 14, fontWeight: "700" },
  logReceipt: { color: "#9FB09A", fontSize: 12, fontFamily: MONO, marginTop: 2 },
  logTime: { color: "#9FB09A", fontSize: 12, fontFamily: MONO },
  missing: { fontSize: theme.type.label.size, fontWeight: "600", color: c.muted, textAlign: "center" },
  drop: {
    width: "100%",
    borderRadius: theme.radius.xl,
    borderWidth: 2,
    borderStyle: "dashed",
    borderColor: c.lineStrong,
    backgroundColor: c.surface,
    alignItems: "center",
    paddingTop: 26,
    paddingBottom: 16,
    gap: 8,
  },
  dropDisc: { width: 68, height: 68, borderRadius: 34, alignItems: "center", justifyContent: "center", backgroundColor: c.lime, marginBottom: 4 },
  dropTitle: { fontSize: theme.type.title.size, fontWeight: "800", color: c.text, letterSpacing: -0.4 },
  dropBlurb: { fontSize: theme.type.label.size, color: c.muted },
  photoRow: { flexDirection: "row", gap: 10, alignSelf: "stretch", paddingHorizontal: 16, marginTop: 10 },
  source: { flex: 1, height: 54, borderRadius: 999, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  sourceInk: { backgroundColor: c.ink },
  sourceLime: { backgroundColor: c.lime },
  sourceText: { fontSize: theme.type.body.size, fontWeight: "700", color: c.onLime },
  orRow: { flexDirection: "row", alignItems: "center", gap: 10, alignSelf: "stretch", paddingHorizontal: 16, marginTop: 10 },
  orRule: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: c.lineStrong },
  orText: { fontSize: theme.type.caption.size, fontWeight: "700", color: c.faint },
  artStrip: { gap: 8, paddingHorizontal: 16 },
  artCell: { width: 76, height: 76, borderRadius: 14, overflow: "hidden", backgroundColor: c.surfaceAlt },
  preview: { width: "100%", aspectRatio: 1, borderRadius: theme.radius.xl, overflow: "hidden", backgroundColor: c.ink },
  previewTop: { position: "absolute", left: 12, right: 12, top: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  photoTag: { flexShrink: 1, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)" },
  change: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: "rgba(0,0,0,0.6)" },
  changeText: { fontSize: 13, fontWeight: "700", color: "#FFFFFF" },
  previewFoot: { position: "absolute", left: 16, right: 16, bottom: 16, gap: 6 },
  previewNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  previewName: { flexShrink: 1, fontSize: theme.type.title.size, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.4 },
  previewTicker: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 999, backgroundColor: c.lime },
  previewTickerText: { fontSize: theme.type.caption.size, fontWeight: "800", color: c.onLime },
  previewCaption: { fontSize: theme.type.label.size, lineHeight: 19, color: "rgba(255,255,255,0.86)" },
  previewChip: { alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(214,255,61,0.18)", marginTop: 2 },
  previewChipText: { fontSize: theme.type.caption.size, fontWeight: "800", color: c.lime },
  previewBy: { fontSize: theme.type.caption.size, fontWeight: "600", color: "rgba(255,255,255,0.72)" },
  footnote: { fontSize: theme.type.micro.size, fontWeight: "500", color: c.faint, lineHeight: 16, marginTop: 4, textAlign: "center" },
});
