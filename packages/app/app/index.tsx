import { useRouter } from "expo-router";
import { Platform, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import styled from "styled-components/native";

import { OnboardingArt } from "../components/art";
import { BrandImage } from "../components/brand";
import { loadMarkets } from "../lib/markets";
import { useApi } from "../lib/useApi";
import { Body, Button, Display } from "../components/kit";
import { NETWORK_NAME } from "../lib/chain";
import { amountOf } from "../lib/format";
import Landing from "../components/Landing";

/**
 * Onboarding.
 *
 * One screen, one action. Get Started drops straight into the feed — it does
 * not ask for an account, because a social feed behind a login is dead on
 * arrival and the first thing anyone sees should be the product working. A
 * wallet is created later, at the moment someone actually needs one.
 */
export default function Index() {
  // The web build opens on the marketing landing; a phone opens on onboarding.
  return Platform.OS === "web" ? <Landing /> : <Onboarding />;
}

function Onboarding() {
  const router = useRouter();
  const markets = useApi(() => loadMarkets(), []);
  const posts = markets.data?.posts ?? null;
  // Three live figures read from the factory on NEAR testnet; dashes until it answers.
  const stats: [string, string][] = [
    [posts ? String(posts.length) : "—", "posts"],
    [posts ? String(posts.reduce((n, c) => n + c.near.sealedBids, 0)) : "—", "sealed bids"],
    [posts ? amountOf(posts.reduce((n, c) => n + c.near.floorVault, 0), "NEAR") : "—", "in floors"],
  ];

  return (
    <Page edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
        {Platform.OS === "web" ? (
          <Hero>
            <HeroFrame>
              <BrandImage
                art="hero"
                alt="Post cards rising like a staircase toward a glowing token"
                size={432}
                eager
                style={{ width: "100%", height: "auto", aspectRatio: "3 / 2", objectFit: "cover" }}
              />
            </HeroFrame>
            <Coin pointerEvents="none">
              <BrandImage art="flameCoin" alt="" size={92} float="drift" eager />
            </Coin>
          </Hero>
        ) : (
          <Art>
            <OnboardingArt size={320} />
          </Art>
        )}

        {/* What it is, in the first five seconds: one line, one subline, and
            that a fork build is not real money. */}
        <Copy>
          <Network>
            <Dot />
            <NetworkText>{`${NETWORK_NAME} · test NEAR, no real money`}</NetworkText>
          </Network>
          <Display>Every post{"\n"}is a market.</Display>
          <Body muted>
            Post a photo and it launches as its own NEAR account with a sealed-bid opening, a bonding curve and a floor you can always redeem.
          </Body>
        </Copy>

        <Stats accessibilityLabel="Live figures from NEAR testnet">
          {stats.map(([value, label], i) => (
            <StatCell key={label} $first={i === 0}>
              <StatValue numberOfLines={1} adjustsFontSizeToFit>{value}</StatValue>
              <StatLabel>{label}</StatLabel>
            </StatCell>
          ))}
        </Stats>

        <Cta>
          <Button label="Get Started" tall onPress={() => router.replace("/(tabs)/social")} />
        </Cta>
      </ScrollView>
    </Page>
  );
}

const Page = styled(SafeAreaView)`
  flex: 1;
  background-color: ${(p) => p.theme.colors.bg};
  padding-horizontal: ${(p) => p.theme.space(6)}px;
  padding-bottom: ${(p) => p.theme.space(4)}px;
`;

const Art = styled.View`
  flex: 1;
  align-items: center;
  justify-content: center;
`;

const Hero = styled.View`
  padding-top: ${(p) => p.theme.space(4)}px;
  padding-bottom: ${(p) => p.theme.space(6)}px;
`;

const HeroFrame = styled.View`
  border-radius: ${(p) => p.theme.radius.xl}px;
  overflow: hidden;
  background-color: ${(p) => p.theme.colors.ink};
`;

const Coin = styled.View`
  position: absolute;
  right: -6px;
  bottom: 4px;
`;

const Copy = styled.View`
  gap: ${(p) => p.theme.space(3)}px;
  padding-bottom: ${(p) => p.theme.space(6)}px;
`;

const Stats = styled.View`
  flex-direction: row;
  background-color: ${(p) => p.theme.colors.surface};
  border-radius: ${(p) => p.theme.radius.lg}px;
  padding-vertical: ${(p) => p.theme.space(4)}px;
  margin-bottom: ${(p) => p.theme.space(6)}px;
`;

const Cta = styled.View`
  margin-top: auto;
`;

const StatCell = styled.View<{ $first?: boolean }>`
  flex: 1;
  padding-horizontal: ${(p) => p.theme.space(3)}px;
  gap: 2px;
  border-left-width: ${(p) => (p.$first ? 0 : 1)}px;
  border-left-color: ${(p) => p.theme.colors.line};
`;

const StatValue = styled.Text`
  font-size: 17px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: ${(p) => p.theme.colors.text};
  font-variant: tabular-nums;
`;

const StatLabel = styled.Text`
  font-size: ${(p) => p.theme.type.caption.size}px;
  color: ${(p) => p.theme.colors.muted};
`;

const Network = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 999px;
  background-color: ${(p) => p.theme.colors.surface};
`;

const Dot = styled.View`
  width: 6px;
  height: 6px;
  border-radius: 3px;
  background-color: ${(p) => p.theme.colors.pos};
`;

const NetworkText = styled.Text`
  font-size: ${(p) => p.theme.type.caption.size}px;
  font-weight: 700;
  color: ${(p) => p.theme.colors.muted};
`;
