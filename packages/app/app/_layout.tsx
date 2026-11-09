import "../lib/polyfills";

import { Stack, usePathname } from "expo-router";
import { useEffect } from "react";
import { Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { StatusBar } from "expo-status-bar";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { ThemeProvider } from "styled-components/native";

import { FloorGlyph, FloorPanel } from "../components/Floor";
import { BrandImage } from "../components/brand";
import { JunoMark } from "../components/logo";
import { NETWORK_LABEL } from "../lib/chain";
import { WalletProvider } from "../lib/wallet";
import { theme } from "../theme";

/**
 * The app shell.
 *
 * Light throughout and pinned there: `userInterfaceStyle` is "light" in
 * app.json, so a phone in dark mode does not get a half-inverted version of a
 * palette that was validated against a light surface.
 *
 * `GestureHandlerRootView` has to be the outermost view, not a wrapper further
 * down: native gesture recognizers are attached relative to it, and a detector
 * mounted outside its subtree silently never fires.
 */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
    <ThemeProvider theme={theme}>
    <PhoneFrame>
      <SafeAreaProvider>
        <WalletProvider>
          <StatusBar style="dark" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: theme.colors.bg },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="coin/[address]" />
            <Stack.Screen name="trader/[wallet]" />
          </Stack>
        </WalletProvider>
      </SafeAreaProvider>
    </PhoneFrame>
    </ThemeProvider>
    </GestureHandlerRootView>
  );
}

/**
 * On web, the app is a phone-width column in the middle of the window.
 *
 * Juno is a phone app. Opened on a laptop, react-native-web stretched every
 * screen to 1500px: a feed image the size of the monitor and a tab bar with
 * five icons a hand-span apart. A judge's first look is usually a laptop, so
 * the web build keeps the proportions the app was designed at — 480pt at most,
 * centred on the canvas colour, full width on an actual phone. Native builds
 * are untouched.
 */
/**
 * What the browser draws that React Native does not: a visible keyboard focus
 * ring on every control (React Native Web's pressables are focusable divs and
 * otherwise show nothing), and CSS motion switched off under reduced motion.
 * The app's own animations read `useReducedMotion` separately.
 */
const WEB_CSS = `
  :focus { outline: none; }
  :focus-visible { outline: 3px solid ${theme.colors.focus}; outline-offset: 2px; border-radius: 12px; }
  ::selection { background: ${theme.colors.lime}; color: ${theme.colors.ink}; }
  @keyframes juno-bob { 0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); } 50% { transform: translate3d(0, -10px, 0) rotate(-2deg); } }
  @keyframes juno-drift { 0%, 100% { transform: translate3d(0, 0, 0) rotate(0deg); } 50% { transform: translate3d(-6px, -8px, 0) rotate(3deg); } }
  .juno-float { will-change: transform; }
  .juno-float-bob { animation: juno-bob 8s ease-in-out infinite; }
  .juno-float-drift { animation: juno-drift 11s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) {
    .juno-float { animation: none !important; }
    *, *::before, *::after { animation-duration: 0.01ms !important; animation-iteration-count: 1 !important; transition-duration: 0.01ms !important; scroll-behavior: auto !important; }
  }
`;

function useWebCss() {
  useEffect(() => {
    if (Platform.OS !== "web" || typeof document === "undefined") return;
    const tag = document.createElement("style");
    tag.setAttribute("data-juno", "a11y");
    tag.textContent = WEB_CSS;
    document.head.appendChild(tag);
    return () => tag.remove();
  }, []);
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  const { width } = useWindowDimensions();
  const pathname = usePathname();
  useWebCss();
  if (Platform.OS !== "web") return <>{children}</>;
  // The landing at `/` is a full-width web page, not a phone screen.
  if (pathname === "/") return <View style={{ flex: 1 }}>{children}</View>;
  // Wide windows get rails beside the phone column: the live floor panel on
  // the right from 1000px, and how a post works in plain words on the left
  // from 1280px.
  const right = width >= 1000;
  const left = width >= 1280;
  return (
    <View style={frame.canvas}>
      {left ? <AboutRail /> : null}
      <View style={frame.phone}>{children}</View>
      {right ? <FloorRail /> : null}
    </View>
  );
}

/** The right rail on desktop: the NEAR held in post floors and the newest fills, read live from testnet. */
function FloorRail() {
  return (
    <ScrollView style={frame.rail} contentContainerStyle={frame.railBody} showsVerticalScrollIndicator={false}>
      <FloorPanel />
    </ScrollView>
  );
}

/** The left rail on desktop: what Juno is and how a post's market runs on NEAR, in plain words. Copy, not data. */
function AboutRail() {
  // The onboarding screen already says the headline; the rail keeps the steps.
  const intro = usePathname() !== "/";
  const steps = [
    ["Post", "A photo launches as its own NEAR account, <name>.<factory>, and that account is the coin."],
    ["Bid", "For one minute anyone can place a sealed bid. Everyone pays the same clearing price."],
    ["Trade", "Then the curve opens. 20% of every buy goes into a floor any holder can redeem."],
    ["Graduate", "A full curve graduates. Dares put the creator's bond on the line."],
  ] as const;
  return (
    <ScrollView style={frame.about} contentContainerStyle={frame.aboutBody} showsVerticalScrollIndicator={false}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        <JunoMark size={30} color={theme.colors.text} />
        <Text style={frame.word}>juno</Text>
      </View>
      {intro ? <Text style={frame.headline}>Every post is a market.</Text> : null}
      {intro ? <Text style={frame.lede}>On NEAR, every post opens with a sealed-bid auction and keeps a floor you can always redeem.</Text> : null}
      <View style={frame.aboutArt}>
        <BrandImage art="postCard" alt="" size={176} float="bob" eager />
      </View>
      <View style={frame.steps}>
        {steps.map(([title, body], i) => (
          <View key={title} style={[frame.step, i > 0 ? frame.stepRule : null]}>
            <Text style={frame.stepIndex}>{String(i + 1).padStart(2, "0")}</Text>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={frame.stepTitle}>{title}</Text>
              <Text style={frame.stepBody}>{body}</Text>
            </View>
          </View>
        ))}
      </View>
      <View style={frame.network}>
        <FloorGlyph size={14} />
        <Text style={frame.networkText}>{NETWORK_LABEL}</Text>
      </View>
    </ScrollView>
  );
}

const frame = StyleSheet.create({
  canvas: { flex: 1, flexDirection: "row", justifyContent: "center", gap: 32, backgroundColor: "#C9D6C1" },
  phone: {
    flex: 1,
    width: "100%",
    maxWidth: 480,
    overflow: "hidden",
    backgroundColor: theme.colors.bg,
    boxShadow: "0 0 40px rgba(18,21,14,0.12)",
  },
  rail: { width: 360, flexGrow: 0, flexShrink: 0 },
  railBody: { paddingTop: 24, paddingBottom: 40, gap: 16 },
  railHeading: { color: theme.colors.text, fontSize: theme.type.title.size, fontWeight: "700", letterSpacing: -0.4, marginTop: 8 },
  about: { width: 300, flexGrow: 0, flexShrink: 0 },
  aboutArt: { alignItems: "center", marginVertical: -4 },
  aboutBody: { paddingTop: 28, paddingBottom: 40, gap: 14 },
  word: { color: theme.colors.text, fontSize: 26, fontWeight: "800", letterSpacing: -1 },
  headline: {
    color: theme.colors.text,
    fontSize: theme.type.display.size,
    lineHeight: theme.type.display.height,
    letterSpacing: theme.type.display.tracking,
    fontWeight: "800",
    marginTop: 12,
  },
  lede: { color: theme.colors.muted, fontSize: theme.type.lead.size, lineHeight: theme.type.lead.height },
  steps: { backgroundColor: theme.colors.surface, borderRadius: theme.radius.lg, marginTop: 8 },
  step: { flexDirection: "row", gap: 12, padding: 16 },
  stepRule: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.line },
  stepIndex: { color: theme.colors.faint, fontSize: theme.type.caption.size, fontWeight: "700", fontVariant: ["tabular-nums"], marginTop: 2 },
  stepTitle: { color: theme.colors.text, fontSize: theme.type.body.size, fontWeight: "700" },
  stepBody: { color: theme.colors.muted, fontSize: theme.type.label.size, lineHeight: 20 },
  network: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  networkText: { color: theme.colors.muted, fontSize: theme.type.caption.size },
});
