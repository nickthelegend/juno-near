/**
 * Give the exported web build a title, a description and a link preview.
 *
 * `expo export --platform web` writes an index.html titled "Juno" with no
 * description and no Open Graph tags, so the demo link pasted anywhere — a
 * submission form, a DM to a judge — unfurled as a bare URL. This runs after
 * the export and adds them. The image is the app's own share card,
 * `public/brand/og.webp`, made absolute with EXPO_PUBLIC_APP_URL when set.
 */
import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../dist/index.html", import.meta.url);
const app = process.env.EXPO_PUBLIC_APP_URL ?? "";
const title = "Juno on NEAR — every post is a market";
const description =
  "Post a photo and it launches as its own NEAR account: a one-minute sealed-bid opening auction, a bonding curve priced in NEAR, a floor every holder can redeem, and dare bonds. NEAR testnet.";
const image = `${app.replace(/\/$/, "")}/brand/og.webp`;

const tags = [
  `<meta name="description" content="${description}" />`,
  `<meta name="theme-color" content="#DCE7D5" />`,
  `<meta property="og:type" content="website" />`,
  app ? `<meta property="og:url" content="${app}" />` : "",
  `<meta property="og:title" content="${title}" />`,
  `<meta property="og:description" content="${description}" />`,
  `<meta property="og:image" content="${image}" />`,
  `<meta property="og:image:width" content="1200" />`,
  `<meta property="og:image:height" content="800" />`,
  `<meta property="og:image:alt" content="Post cards rising like a staircase toward a glowing token" />`,
  `<meta name="twitter:card" content="summary_large_image" />`,
  `<meta name="twitter:title" content="${title}" />`,
  `<meta name="twitter:description" content="${description}" />`,
  `<meta name="twitter:image" content="${image}" />`,
].filter(Boolean).join("\n    ");

let html = readFileSync(file, "utf8");
html = html.replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`);
if (!html.includes('property="og:title"')) html = html.replace("</head>", `    ${tags}\n  </head>`);
writeFileSync(file, html);
console.log("web meta written");
