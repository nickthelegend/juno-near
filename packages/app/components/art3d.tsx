import React from "react";
import { Platform } from "react-native";

/**
 * Juno's 3D object kit (docs/ART-3D.md): one glossy lilac-and-lime object per
 * image, served from `public/art/3d/` on the web build.
 *
 * Like `BrandImage`, these are plain `<img>` elements so they keep `alt`,
 * `loading`, `decoding` and an intrinsic width and height (no layout shift).
 * Every file is a 640px transparent square. Native builds render nothing, and
 * the screens around them read the same without the object.
 *
 * `float` is the gentle 4px drift defined in the root layout's web CSS
 * (transform only, off under reduced motion).
 */
export const OBJECTS = {
  postCoin: "/art/3d/juno-3d-postcoin.webp",
  envelope: "/art/3d/juno-3d-envelope.webp",
  vault: "/art/3d/juno-3d-vault.webp",
  dice: "/art/3d/juno-3d-dice.webp",
  cap: "/art/3d/juno-3d-cap.webp",
  heartCoin: "/art/3d/juno-3d-heartcoin.webp",
  trophy: "/art/3d/juno-3d-trophy.webp",
  empty: "/art/3d/juno-3d-empty.webp",
  success: "/art/3d/juno-3d-success.webp",
  warning: "/art/3d/juno-3d-warning.webp",
  wallet: "/art/3d/juno-3d-wallet.webp",
  curve: "/art/3d/juno-3d-curve.webp",
  mark: "/art/3d/juno-3d-mark.webp",
} as const;

export type ObjectArt = keyof typeof OBJECTS;

export function Object3D({
  art,
  alt,
  size,
  float = false,
  eager = false,
  style,
}: {
  art: ObjectArt;
  /** Empty string when the object only decorates text that already says it. */
  alt: string;
  /** Rendered width and height in px. */
  size: number;
  float?: boolean;
  eager?: boolean;
  style?: React.CSSProperties;
}) {
  if (Platform.OS !== "web") return null;
  return React.createElement("img", {
    src: OBJECTS[art],
    width: size,
    height: size,
    alt,
    "aria-hidden": alt === "" ? true : undefined,
    loading: eager ? "eager" : "lazy",
    decoding: "async",
    draggable: false,
    className: float ? "juno-float juno-float-soft" : undefined,
    style: { display: "block", width: size, height: size, flexShrink: 0, objectFit: "contain", userSelect: "none", pointerEvents: "none", ...style },
  });
}
