import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/**
 * The floating tab bar: a 64pt ink pill inset 14pt from the sides and from the
 * bottom (plus the system's home-indicator inset). `height` is the space it
 * takes from the bottom of the screen, for anything that has to sit above it
 * (the reel dock, the comment composer, a screen's last row).
 */
export const TAB_PILL = 64;
export const TAB_GAP = 14;
export function useTabBarHeight(): { height: number; paddingBottom: number; bottom: number } {
  const insets = useSafeAreaInsets();
  const bottom = TAB_GAP + (Platform.OS === "ios" ? Math.max(insets.bottom - 10, 0) : insets.bottom);
  return { height: TAB_PILL + bottom + 8, paddingBottom: 0, bottom };
}
