import React from "react";
import { Platform } from "react-native";
import { Image as ExpoImage } from "expo-image";

/** Native builds load the same files from the hosted web app (EXPO_PUBLIC_APP_URL). */
const ART_HOST = process.env.EXPO_PUBLIC_APP_URL?.replace(/\/$/, "") || "https://juno-near.vercel.app";

/**
 * The brand illustrations (hero, post card, flame coin, empty slot), served
 * from `public/brand/` on the web build.
 *
 * They are plain `<img>` elements on purpose: react-native-web's `Image`
 * drops `loading`, `decoding`, `alt` and intrinsic `width`/`height`, which is
 * what keeps a below-the-fold illustration from costing the first paint or
 * shifting the layout when it lands. Native builds render nothing here; the
 * screens that use art keep their vector fallbacks there.
 *
 * `float` adds the slow drift defined in the root layout's web CSS (transform
 * only, 6 to 12 s, off under reduced motion).
 */
export const BRAND = {
  hero: { src: "/brand/hero.webp", width: 1200, height: 800 },
  postCard: { src: "/brand/post-card.webp", width: 440, height: 440 },
  flameCoin: { src: "/brand/flame-coin.webp", width: 440, height: 440 },
  empty: { src: "/brand/empty.webp", width: 480, height: 480 },
} as const;

export type BrandArt = keyof typeof BRAND;

export function BrandImage({
  art,
  alt,
  size,
  float,
  eager = false,
  style,
}: {
  art: BrandArt;
  /** Empty string for purely decorative art. */
  alt: string;
  /** Rendered width in px; height follows the asset's ratio. */
  size: number;
  float?: "bob" | "drift";
  eager?: boolean;
  style?: React.CSSProperties;
}) {
  if (Platform.OS !== "web") return <ExpoImage source={{ uri: `${ART_HOST}${BRAND[art].src}` }} style={{ width: size, height: Math.round((size * BRAND[art].height) / BRAND[art].width) }} contentFit="contain" accessible={alt !== ""} accessibilityLabel={alt || undefined} />;
  const asset = BRAND[art];
  const height = Math.round((size * asset.height) / asset.width);
  return React.createElement("img", {
    src: asset.src,
    width: size,
    height,
    alt,
    "aria-hidden": alt === "" ? true : undefined,
    loading: eager ? "eager" : "lazy",
    decoding: "async",
    draggable: false,
    className: float ? `juno-float juno-float-${float}` : undefined,
    style: { display: "block", width: size, height, objectFit: "contain", userSelect: "none", pointerEvents: "none", ...style },
  });
}
