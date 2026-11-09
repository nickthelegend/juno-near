import { useRouter } from "expo-router";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BurnList, BurnPanel, useBurns } from "../components/Burn";
import { ChevronLeft } from "../components/kit";
import { Tappable } from "../components/Press";
import { theme } from "../theme";

/**
 * Every burn: the factory's all-time counter and the newest `WifBurned`
 * logs, each with its transaction. The flywheel, as a record.
 */
export default function BurnsScreen() {
  const router = useRouter();
  const burns = useBurns(50);

  return (
    <SafeAreaView edges={["top"]} style={s.page}>
      <View style={s.nav}>
        <Tappable
          onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/social" as never))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={s.back}
        >
          <ChevronLeft />
        </Tappable>
        <Text style={s.title} accessibilityRole="header">
          Burns
        </Text>
      </View>
      <ScrollView
        contentContainerStyle={s.body}
        refreshControl={<RefreshControl refreshing={burns.refreshing} onRefresh={burns.refresh} />}
      >
        <BurnPanel burns={burns} />
        <Text style={s.how}>
          Three ways WIF leaves supply: half of every post trade fee, 10% of a reserve at graduation, and tracker
          fees anyone can flush into a burn.
        </Text>
        <BurnList burns={burns} />
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: theme.colors.bg },
  nav: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  back: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    color: theme.colors.text,
    fontSize: theme.type.screen.size,
    lineHeight: theme.type.screen.height,
    letterSpacing: theme.type.screen.tracking,
    fontWeight: "800",
  },
  body: { paddingHorizontal: 16, paddingBottom: 48, gap: 16 },
  how: { color: theme.colors.muted, fontSize: theme.type.label.size, lineHeight: 21 },
});
