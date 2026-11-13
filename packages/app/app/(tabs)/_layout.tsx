import React, { useRef, useState } from "react";
import { Tabs, usePathname, useRouter } from "expo-router";
import { Animated, Platform, StyleSheet, View } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import styled from "styled-components/native";

import { CreateSheet } from "../../components/CreateSheet";
import { usePressScale } from "../../components/Press";
import { motion, useReducedMotion, nativeDriver } from "../../lib/motion";
import { TAB_GAP, TAB_PILL, useTabBarHeight } from "../../lib/tabbar";
import { theme } from "../../theme";

/**
 * The bottom bar: five slots, Post raised in the centre.
 *
 * The arrangement is the product in miniature. Social and Trade sit on the
 * left, Reels and Profile on the right, and the thing that *makes* a market
 * sits in the middle where a thumb lands — because Juno's claim is that posting
 * and launching are the same act, and a bar that buried Post in a menu would be
 * arguing the opposite.
 *
 * The active item is a lime pill; inactive ones are bare glyphs. No labels at
 * all — five icons are already legible, the label only ever appeared on the tab
 * you were demonstrably already on, and dropping it lets each slot breathe.
 * `accessibilityLabel` still names every tab for a screen reader.
 *
 * ## Post opens a sheet, it does not navigate
 *
 * It used to push a whole screen, which made picking what to create cost a
 * navigation each way. It now raises a drawer over the feed: the thing behind
 * stays visible, choosing does not feel like leaving, and a wrong tap costs a
 * flick down. The `post` tab still exists and is still where a launch actually
 * happens — the sheet hands off to it with a format already chosen.
 */
export default function TabsLayout() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  // Which tab is active comes from the route, not from the button's
  // `accessibilityState`. That prop is not populated for a custom
  // `tabBarButton`, so reading it left every slot looking inactive — the lime
  // pill never appeared on the tab you were actually on.
  const pathname = usePathname();
  /*
   * Reels are the one dark room in the app. A white bar across the bottom of
   * a full-bleed video is a light left on in a cinema, so on that tab the bar
   * goes to night and its glyphs to white.
   */
  const night = pathname.startsWith("/reels");
  const bar = useTabBarHeight();

  const slot =
    (label: string, Icon: (p: { color: string }) => React.ReactElement, href: string) =>
    () => (
      <Slot
        label={label}
        icon={Icon}
        active={pathname.startsWith(href.replace("/(tabs)", ""))}
        night={night}
        onPress={() => router.push(href as never)}
      />
    );

  return (
    // An explicit filling container, so the sheet's `absoluteFill` has
    // something known to position against rather than whatever box the
    // navigator happens to render its children into.
    <Shell>
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: false,
        // A floating ink pill: inset from the edges, icons only, the active
        // tab marked by a springy lime disc and Post raised out of the bar.
        tabBarStyle: {
          position: "absolute",
          left: 0,
          right: 0,
          marginHorizontal: TAB_GAP,
          bottom: bar.bottom,
          height: TAB_PILL,
          paddingTop: 0,
          paddingBottom: 0,
          paddingHorizontal: 6,
          borderRadius: TAB_PILL / 2,
          borderTopWidth: 0,
          backgroundColor: night ? "rgba(18,21,14,0.92)" : theme.colors.ink,
          overflow: "visible",
          shadowColor: "#12150E",
          shadowOpacity: 0.28,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 10 },
          elevation: 14,
        },
        sceneStyle: { backgroundColor: theme.colors.bg },
      }}
    >
      <Tabs.Screen
        name="social"
        options={{ tabBarButton: slot("Social", HomeIcon, "/(tabs)/social") }}
      />
      <Tabs.Screen
        name="trade"
        options={{ tabBarButton: slot("Trade", TradeIcon, "/(tabs)/trade") }}
      />
      <Tabs.Screen
        name="post"
        options={{
          tabBarButton: () => (
            <PostSlot open={creating} night={night} onPress={() => setCreating((on) => !on)} />
          ),
        }}
      />
      <Tabs.Screen
        name="reels"
        options={{ tabBarButton: slot("Reels", ReelsIcon, "/(tabs)/reels") }}
      />
      <Tabs.Screen
        name="profile"
        options={{ tabBarButton: slot("Profile", ProfileIcon, "/(tabs)/profile") }}
      />
    </Tabs>

    {/* A sibling of `Tabs`, not a child, so the sheet rises over the tab bar
        rather than being clipped by the screen it was opened from. */}
    <CreateSheet
      visible={creating}
      onClose={() => setCreating(false)}
      onLaunch={(format) => router.push(`/(tabs)/post?format=${format}` as never)}
    />
    </Shell>
  );
}

const Shell = styled.View`
  flex: 1;
`;

function Slot({
  label,
  icon: Icon,
  active,
  night = false,
  onPress,
}: {
  label: string;
  icon: (props: { color: string }) => React.ReactElement;
  active: boolean;
  night?: boolean;
  onPress: () => void;
}) {
  const reduced = useReducedMotion();
  const on = useRef(new Animated.Value(active ? 1 : 0)).current;
  React.useEffect(() => {
    if (reduced) { on.setValue(active ? 1 : 0); return; }
    Animated.spring(on, { toValue: active ? 1 : 0, damping: 11, stiffness: 260, mass: 0.7, useNativeDriver: nativeDriver }).start();
  }, [active, reduced, on]);
  const { scale, onPressIn, onPressOut } = usePressScale(0.88);
  return (
    <SlotBox
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="tab"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
    >
      <Animated.View style={{ transform: [{ scale }], alignItems: "center", justifyContent: "center", width: 48, height: 48 }}>
        <Animated.View
          pointerEvents="none"
          style={[StyleSheet.absoluteFill, { borderRadius: 24, backgroundColor: theme.colors.lime, opacity: on, transform: [{ scale: on.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] }) }] }]}
        />
        <View style={{ zIndex: 1 }}>
          <Icon color={active ? theme.colors.onLime : night ? theme.colors.onNightMuted : "rgba(243,247,238,0.62)"} />
        </View>
        <Animated.View
          pointerEvents="none"
          style={{ position: "absolute", bottom: -7, width: 5, height: 5, borderRadius: 3, backgroundColor: theme.colors.lime, opacity: on, transform: [{ scale: on }] }}
        />
      </Animated.View>
    </SlotBox>
  );
}

/**
 * The raised centre button, and the one place in the bar that animates.
 *
 * The plus rotates 45° into a close mark while the sheet is up. It is the same
 * two strokes throughout — nothing appears or disappears, the glyph turns —
 * which is what makes one control read as having two states rather than two
 * controls swapping places. It also means the button that opened the sheet is
 * the button that closes it, and looks like it.
 *
 * 45° over 220ms with the drawer curve, so it turns at roughly the pace the
 * sheet travels; the two read as one gesture rather than two animations that
 * happened to start together.
 */
function PostSlot({ open, night = false, onPress }: { open: boolean; night?: boolean; onPress: () => void }) {
  const reduced = useReducedMotion();
  const { scale, onPressIn, onPressOut } = usePressScale(0.9);
  const turn = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    Animated.timing(turn, {
      toValue: open ? 1 : 0,
      duration: reduced ? 0 : motion.swap,
      easing: motion.easeDrawer,
      useNativeDriver: nativeDriver,
    }).start();
  }, [open, reduced, turn]);

  const rotate = turn.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "45deg"] });

  return (
    <PostBox
      onPress={onPress}
      onPressIn={onPressIn}
      onPressOut={onPressOut}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={open ? "Close" : "Create — a photo or a dare"}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        <PostDisc $night={night}>
          <Animated.View style={{ transform: [{ rotate }] }}>
            <Svg width={26} height={26} viewBox="0 0 24 24">
              <Path
                d="M12 5v14M5 12h14"
                stroke={theme.colors.ink}
                strokeWidth={2.8}
                strokeLinecap="round"
              />
            </Svg>
          </Animated.View>
        </PostDisc>
      </Animated.View>
    </PostBox>
  );
}

const SlotBox = styled.Pressable`
  flex: 1;
  align-items: center;
  justify-content: center;
  height: 64px;
`;

/* The same flex as every other slot. It was a fixed 62pt while the four
   around it shared the rest, and the navigator does not centre a fixed-width
   button in its cell — so the + sat left of the bar's centre. */
const PostBox = styled.Pressable`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

/* Raised out of the pill: a lime disc ringed in the canvas colour, so it reads
   as sitting on top of the bar rather than inside it. */
const PostDisc = styled.View<{ $night: boolean }>`
  width: 62px;
  height: 62px;
  margin-top: -26px;
  border-radius: 31px;
  border-width: 5px;
  border-color: ${(p) => (p.$night ? p.theme.colors.night : p.theme.colors.bg)};
  background-color: ${(p) => p.theme.colors.lime};
  align-items: center;
  justify-content: center;
  shadow-color: #3b4a1a;
  shadow-opacity: 0.35;
  shadow-radius: 12px;
  shadow-offset: 0px 6px;
`;

/* Juno's own glyphs, drawn for a dark bar: a stack of post cards (the feed),
   a podium (the leaderboard), a reel frame, and a person. Inline SVG at the
   theme's stroke weight; five glyphs do not justify an icon font. */

function HomeIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={6.5} y={2.8} width={13} height={15.5} rx={3.2} stroke={color} strokeWidth={1.9} opacity={0.55} />
      <Rect x={3.5} y={6} width={13} height={15.2} rx={3.2} stroke={color} strokeWidth={1.9} />
      <Circle cx={10} cy={13.6} r={2.2} fill={color} />
    </Svg>
  );
}

function TradeIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Path d="M9 9.5h6V21H9z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
      <Path d="M3 14h6v7H3zM15 12h6v9h-6z" stroke={color} strokeWidth={1.9} strokeLinejoin="round" />
      <Path d="M12 2.6l1.1 2.2 2.4.35-1.75 1.7.41 2.4L12 8.1l-2.16 1.15.41-2.4L8.5 5.15l2.4-.35z" fill={color} />
    </Svg>
  );
}

function ReelsIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Rect x={4} y={3} width={16} height={18} rx={4.2} stroke={color} strokeWidth={1.9} />
      <Path d="M10 9.2v5.6l4.8-2.8z" fill={color} />
    </Svg>
  );
}

function ProfileIcon({ color }: { color: string }) {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.9} />
      <Circle cx={12} cy={10} r={3} fill={color} />
      <Path d="M6.6 18.2c1.3-2 3.2-3 5.4-3s4.1 1 5.4 3" stroke={color} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}
