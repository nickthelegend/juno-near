/**
 * Render proof for the exported web build, in a real headless Chrome.
 *
 *   node scripts/qa.mjs http://127.0.0.1:8091 [outDir] [route=name ...]
 *
 * Opens each route at 390×844 and 1440×900, waits for live NEAR reads, and
 * writes <outDir>/near-<name>-<width>.png. Fails (exit 1) when the root is
 * empty, a page error is thrown, or the page scrolls sideways.
 *
 * playwright-core is not a dependency of this repo; point PLAYWRIGHT_CORE at
 * an installed copy (the default is the one on Nick's machine).
 */
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE ?? "/Volumes/Extreme SSD/Projects/tasteprobe/node_modules/playwright-core");

const [base = "http://127.0.0.1:8091", outDir = "../../docs/qa", ...pairs] = process.argv.slice(2);
const routes = pairs.length
  ? pairs.map((pair) => pair.split("="))
  : [["/", "landing"], ["/social", "feed"], ["/trade", "trade"], ["/reels", "reels"], ["/post", "post"], ["/profile", "profile"]].map(([r, n]) => [r, n]);
const wait = Number(process.env.QA_WAIT_MS ?? 9000);

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({ channel: "chrome", headless: true });
let failed = false;
for (const [route, name] of routes) {
  for (const [width, height] of [[390, 844], [1440, 900]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 2 });
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.goto(`${base}${route}`, { waitUntil: "networkidle" }).catch((e) => errors.push(String(e)));
    await page.waitForTimeout(wait);
    const check = await page.evaluate(() => ({
      text: (document.getElementById("root")?.innerText ?? "").trim().length,
      overflow: document.documentElement.scrollWidth - window.innerWidth,
    }));
    const file = `${outDir}/near-${name}-${width}.png`;
    await page.screenshot({ path: file });
    const ok = check.text > 0 && errors.length === 0 && check.overflow <= 0;
    if (!ok) failed = true;
    console.log(JSON.stringify({ route, width, ok, rootText: check.text, overflow: check.overflow, errors: errors.slice(0, 3), file }));
    await page.close();
  }
}
await browser.close();
process.exit(failed ? 1 : 0);
