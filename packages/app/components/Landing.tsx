import { useRouter } from "expo-router";
import React, { useEffect, useMemo } from "react";

import type { Coin } from "../lib/api";
import { explorer, FACTORY, NETWORK_NAME } from "../lib/chain";
import { loadMarkets } from "../lib/markets";
import { useApi } from "../lib/useApi";
import { LANDING_CSS } from "./landing-css";

/**
 * The web landing page, `/` on the web build.
 *
 * Plain DOM rather than React Native views: it is a marketing page, it needs
 * real headings, links, `clip-path` paper edges and a CSS grid that reflows at
 * 375px, and none of the app's screens are reused or restyled here. Native
 * builds never render it; `app/index.tsx` keeps the phone onboarding there.
 *
 * Every number on it is read from the factory on NEAR testnet through the
 * same `loadMarkets()` the feed uses. Until the read lands the figures say
 * "Reading testnet", and a failed read says so in words.
 */

const DEPLOY_TX = "HvSXP63tQhyZSPujjj3dVN1eZPFqLXRxTGD19qHMpzxx";
const FONTS = "https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Urbanist:wght@400;500;600;700;800;900&display=swap";

/** The seeded posts' own media; the stickers are those posts. */
const ART = {
  sprout: "/art/juno-feature-1.webp",
  pileIn: "/art/juno-feature-2.webp",
  capToss: "/art/juno-feature-3.webp",
  balloons: "/art/juno-social-square.webp",
  camera: "/art/juno-object-2.webp",
  coin: "/brand/flame-coin.webp",
};

/** A deckled paper edge, the same for a given seed on every render. */
function torn(seed: number, depth = 2.6, steps = 16): string {
  let s = seed * 7919 + 104729;
  const r = () => {
    s = (s * 16807) % 2147483647;
    return (s % 1000) / 1000;
  };
  const pts: string[] = [];
  for (let i = 0; i < steps; i++) pts.push(`${((i / steps) * 100).toFixed(1)}% ${(r() * depth).toFixed(2)}%`);
  for (let i = 0; i < steps; i++) pts.push(`${(100 - r() * depth).toFixed(2)}% ${((i / steps) * 100).toFixed(1)}%`);
  for (let i = 0; i < steps; i++) pts.push(`${(100 - (i / steps) * 100).toFixed(1)}% ${(100 - r() * depth).toFixed(2)}%`);
  for (let i = 0; i < steps; i++) pts.push(`${(r() * depth).toFixed(2)}% ${(100 - (i / steps) * 100).toFixed(1)}%`);
  return `polygon(${pts.join(",")})`;
}

/** 0.05312 → "0.0531"; 0.0000636 → "0.0000636". Four significant figures, never rounded to zero. */
function nearFigure(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (n === 0) return "0";
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString("en-US");
  return Number(n.toPrecision(4)).toString();
}

function dayTag(iso: string | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${String(d.getUTCDate()).padStart(2, "0")} ${d.toLocaleDateString("en-US", { month: "short", timeZone: "UTC" }).toUpperCase()} ${d.getUTCFullYear()}`;
}

function byArt(posts: Coin[] | null, src: string): Coin | undefined {
  return posts?.find((c) => c.media.url.endsWith(src));
}

/** A post printed as a photo card: deckled paper, the post's own image, and its live ticker once the chain answers. */
function PhotoCard({ src, coin, seed, className, tape }: { src: string; coin?: Coin; seed: number; className: string; tape?: boolean }) {
  const clip = useMemo(() => torn(seed), [seed]);
  return (
    <div className={`jl-st ${className}`} aria-hidden="true">
      <div className="jl-card">
        <div className="jl-paper" style={{ clipPath: clip }}>
          <img src={src} alt="" decoding="async" draggable={false} />
          <span className="jl-cap">{coin ? <><b>${coin.symbol}</b><i>{nearFigure(coin.marketCapQuote ?? coin.marketCap)} NEAR</i></> : <b className="jl-cap-wait">&nbsp;</b>}</span>
        </div>
      </div>
      {tape ? <span className="jl-tape" /> : null}
      {coin?.curve.graduated ? <span className="jl-stamp">Graduated</span> : null}
    </div>
  );
}

/** A die-cut sticker: transparent art with a white kiss-cut outline. */
function DieCut({ src, className }: { src: string; className: string }) {
  return (
    <div className={`jl-st ${className}`} aria-hidden="true">
      <img className="jl-die" src={src} alt="" decoding="async" draggable={false} />
    </div>
  );
}

function Mark({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M9 38.5C9 38.5 18 36.5 24 30C29 24.6 30.5 18.5 30.5 18.5" stroke="currentColor" strokeWidth={5} strokeLinecap="round" />
      <circle cx={36.5} cy={10.5} r={4.8} fill="currentColor" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function External() {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <path d="M4.5 2.5h5v5M9.5 2.5 3 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function Landing() {
  const router = useRouter();
  const markets = useApi(() => loadMarkets(), []);
  const posts = markets.data?.posts ?? null;

  useEffect(() => {
    if (typeof document === "undefined" || document.querySelector('link[data-juno="fonts"]')) return;
    const pre = document.createElement("link");
    pre.rel = "preconnect";
    pre.href = "https://fonts.gstatic.com";
    pre.crossOrigin = "anonymous";
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = FONTS;
    link.setAttribute("data-juno", "fonts");
    document.head.append(pre, link);
  }, []);

  const go = (path: string) => (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    router.push(path as never);
  };

  const jump = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  };

  const failed = !!markets.error && !posts;
  const stat = (value: string | number | undefined) => (failed ? "—" : value === undefined ? "…" : String(value));
  const holders = posts?.reduce((n, c) => n + (c.holders ?? 0), 0);
  const floors = posts?.reduce((n, c) => n + c.near.floorVault, 0);
  const bids = posts?.reduce((n, c) => n + c.near.sealedBids, 0);
  const graduated = posts?.filter((c) => c.curve.graduated).length;
  const settled = posts?.filter((c) => c.near.clearingPrice > 0).sort((a, b) => b.near.sealedBids - a.near.sealedBids)[0];
  const deepest = posts ? [...posts].sort((a, b) => b.near.floorVault - a.near.floorVault)[0] : undefined;
  const sprout = byArt(posts, ART.sprout);
  const tag = dayTag(posts?.[0]?.createdAt);

  return (
    <div className="jl" id="top">
      <style>{LANDING_CSS}</style>

      <header className="jl-nav">
        <a href="/" className="jl-brand" aria-label="Juno home"><Mark size={26} /><span>juno</span></a>
        <nav aria-label="Primary">
          <a href="#how" onClick={jump("how")} className="jl-link">How it works</a>
          <a href="/social" onClick={go("/(tabs)/social")} className="jl-pill jl-pill-white">Open app</a>
        </nav>
      </header>

      <main>
        <section className="jl-hero" aria-labelledby="jl-title">
          <div className="jl-stickers">
            <PhotoCard src={ART.sprout} coin={sprout} seed={3} className="st-sprout" tape />
            <DieCut src={ART.coin} className="st-coin" />
            <div className="jl-st st-cap-wrap" aria-hidden="true">
              <PhotoCard src={ART.capToss} coin={byArt(posts, ART.capToss)} seed={7} className="st-cap" />
              {tag ? <span className="jl-date">{tag}</span> : null}
              <span className="jl-marktag"><Mark size={30} /></span>
            </div>
            <DieCut src={ART.camera} className="st-camera" />
            <PhotoCard src={ART.balloons} coin={byArt(posts, ART.balloons)} seed={11} className="st-balloons" />
            <div className="jl-torn" aria-hidden="true" />
            <PhotoCard src={ART.pileIn} coin={byArt(posts, ART.pileIn)} seed={17} className="st-pile" tape />
          </div>

          <div className="jl-hero-copy">
            <h1 id="jl-title">Every post<br />is a coin<span className="jl-dot">.</span></h1>
            <a href="/social" onClick={go("/(tabs)/social")} className="jl-pill jl-pill-lime jl-pill-xl">Open Juno</a>
            <p className="jl-sub">
              {posts
                ? <>Live on {NETWORK_NAME}. {posts.length} posts trading, each its own NEAR account, with test NEAR only.</>
                : failed
                  ? <>Live on {NETWORK_NAME}, with test NEAR only.</>
                  : <>A social feed on {NETWORK_NAME}, with test NEAR only.</>}
            </p>
          </div>
        </section>

        <section className="jl-live" aria-labelledby="jl-live-title">
          <div className="jl-wrap">
            <div className="jl-live-head">
              <p className="jl-lbl"><i className={`jl-pulse ${failed ? "is-off" : ""}`} />{failed ? "Testnet unreadable" : posts ? "Live from the factory" : "Reading testnet"}</p>
              <h2 id="jl-live-title" className="jl-visually-hidden">Live figures</h2>
              {FACTORY ? (
                <a className="jl-acct" href={explorer("address", FACTORY)} target="_blank" rel="noreferrer">{FACTORY} <External /></a>
              ) : (
                <span className="jl-acct">Setup required: EXPO_PUBLIC_JUNO_FACTORY</span>
              )}
            </div>
            <dl className="jl-stats">
              <div><dt>Posts</dt><dd>{stat(posts?.length)}</dd><span>{graduated !== undefined ? `${graduated} graduated` : " "}</span></div>
              <div><dt>Holders</dt><dd>{stat(holders)}</dd><span>summed across posts</span></div>
              <div><dt>In floors</dt><dd>{stat(floors !== undefined ? nearFigure(floors) : undefined)}<small>NEAR</small></dd><span>redeemable by holders</span></div>
            </dl>
            {failed ? (
              <p className="jl-err" role="alert"><img className="jl-obj" src="/art/3d/juno-3d-warning.webp" width={64} height={64} alt="" aria-hidden="true" decoding="async" draggable={false} /><span>Could not read {FACTORY ?? "the factory"} on NEAR testnet: {markets.error}</span></p>
            ) : (
              <ul className="jl-tape-row" aria-label="Posts on the factory">
                {(posts ?? []).map((c) => (
                  <li key={c.address}>
                    <a href={`/coin/${c.address}`} onClick={go(`/coin/${c.address}`)} className="jl-chip">
                      <img src={c.media.url} alt="" loading="lazy" decoding="async" />
                      <span className="jl-chip-body">
                        <b>${c.symbol}</b>
                        <span>{c.curve.graduated ? "Graduated" : c.near.phase === "curve" ? "On the curve" : c.near.phase === "commit" ? "Sealed bids open" : c.near.phase === "reveal" ? "Revealing" : "Settling"}</span>
                        <span>{c.holders ?? 0} {c.holders === 1 ? "holder" : "holders"}</span>
                      </span>
                      <span className="jl-chip-fig"><b>{nearFigure(c.near.floorVault)}</b><span>NEAR floor</span></span>
                    </a>
                  </li>
                ))}
                {!posts ? [0, 1, 2, 3].map((i) => <li key={i}><span className="jl-chip jl-skel" /></li>) : null}
                {posts && posts.length === 0 ? <li className="jl-empty"><img className="jl-obj" src="/art/3d/juno-3d-empty.webp" width={64} height={64} alt="" aria-hidden="true" decoding="async" draggable={false} /><span>No posts on the factory yet. The first photo posted opens here.</span></li> : null}
              </ul>
            )}
          </div>
        </section>

        <section className="jl-sec" id="how" aria-labelledby="jl-how-title">
          <div className="jl-wrap">
            <header className="jl-head">
              <p className="jl-lbl">How it works</p>
              <h2 id="jl-how-title">Three beats, all on chain.</h2>
            </header>
            <ol className="jl-beats">
              <li>
                <div className="jl-beat-art"><PhotoCard src={ART.sprout} seed={21} className="beat-card" /></div>
                <span className="jl-beat-n">01 · Post</span>
                <h3>Post a photo. It becomes a coin.</h3>
                <p>Posting creates a NEAR account named after it, <code>{"<name>."}{FACTORY ?? "<factory>"}</code>. That account is the token, the auction and the vault.</p>
                <p className="jl-fig">{sprout ? <><b>{sprout.address}</b><span>a live post account</span></> : <span>{failed ? "Testnet unreadable" : "Reading testnet…"}</span>}</p>
              </li>
              <li>
                <div className="jl-beat-art jl-seal" aria-hidden="true">
                  <span className="jl-env e1" /><span className="jl-env e2" /><span className="jl-env e3"><i>sha256</i></span>
                </div>
                <span className="jl-beat-n">02 · Sealed opening</span>
                <h3>One minute of sealed bids. One price for all.</h3>
                <p>Every bidder escrows exactly 1 NEAR and posts only a hash. After the reveal, every winner pays the same clearing price, so being first buys nothing.</p>
                <p className="jl-fig">{settled ? <><b>{settled.near.sealedBids} sealed bids · {nearFigure(settled.near.clearingPrice)} NEAR</b><span>${settled.symbol} cleared at one price</span></> : bids !== undefined ? <><b>{bids} sealed bids</b><span>across every post</span></> : <span>{failed ? "Testnet unreadable" : "Reading testnet…"}</span>}</p>
              </li>
              <li>
                <div className="jl-beat-art"><img className="jl-die beat-coin" src={ART.coin} alt="" aria-hidden="true" /></div>
                <span className="jl-beat-n">03 · Floor</span>
                <h3>A floor you can always redeem.</h3>
                <p>20% of every curve buy and half the auction raise go into the post's vault. Any holder can burn tokens and take their share of it, at any time.</p>
                <p className="jl-fig">{deepest ? <><b>{nearFigure(deepest.near.floorVault)} NEAR</b><span>in ${deepest.symbol}'s floor vault</span></> : <span>{failed ? "Testnet unreadable" : "Reading testnet…"}</span>}</p>
              </li>
            </ol>
          </div>
        </section>

        <section className="jl-phone-sec" aria-labelledby="jl-phone-title">
          <div className="jl-wrap jl-phone-grid">
            <div className="jl-phone-copy">
              <p className="jl-lbl jl-lbl-dark">The app</p>
              <h2 id="jl-phone-title">A feed first. The market comes with it.</h2>
              <p>Scroll, like, and tap Buy. Every card reads its post's contract on NEAR testnet: the price in NEAR, who bought, how far to graduation, and the floor.</p>
              <ul className="jl-points">
                <li><b>Floor chip</b><span>the NEAR each token can redeem right now</span></li>
                <li><b>Bought by</b><span>names from the contract's own fill log</span></li>
                <li><b>Buy</b><span>quotes from <code>quote_buy</code> on the post account</span></li>
              </ul>
              <a href="/social" onClick={go("/(tabs)/social")} className="jl-more">Scroll the feed <Arrow /></a>
            </div>
            <figure className="jl-phone-fig">
              <div className="jl-phone">
                <span className="jl-island" aria-hidden="true" />
                <img src="/landing/feed-390.webp" width={390} height={844} alt="Juno's feed: the Balloons post with its price in NEAR, Bought by kai and 1 other, 11% to graduation and its floor in NEAR" loading="lazy" decoding="async" />
              </div>
              <DieCut src={ART.coin} className="st-phone-coin" />
              <figcaption>Screenshot of /social on NEAR testnet, 9 Nov 2026</figcaption>
            </figure>
          </div>
        </section>

        <section className="jl-sec" id="tech" aria-labelledby="jl-tech-title">
          <div className="jl-wrap">
            <header className="jl-head">
              <p className="jl-lbl">The NEAR tech</p>
              <h2 id="jl-tech-title">What runs where, plainly.</h2>
            </header>
            <div className="jl-tech">
              <article>
                <h3>A post is an account</h3>
                <p><code>create_post</code> on the factory creates <code>{"<slug>."}{FACTORY ?? "<factory>"}</code> and deploys the locked token code to it in one transaction. No pool, no registry: the account is the market.</p>
              </article>
              <article>
                <h3>Commit, reveal, settle</h3>
                <p>Bids are <code>sha256(account, amount, max price, salt)</code> with identical 1 NEAR escrows. Reveal is open for 60 s; a bid left hidden forfeits 1% to the creator.</p>
              </article>
              <article>
                <h3>Curve and floor vault</h3>
                <p>800 tokens sell on a 16-segment curve priced in yoctoNEAR integers. <code>redeem</code> burns tokens for up to 99% of the holder's pro-rata vault share.</p>
              </article>
              <article>
                <h3>NEP-141 and NEP-148</h3>
                <p>Each post coin is a whole-unit fungible token with metadata, <code>ft_transfer</code> and <code>ft_transfer_call</code>, so wallets read it like any NEAR token.</p>
              </article>
              <article>
                <h3>NEP-366 meta transactions</h3>
                <p>Email calls use a device-signed delegate action. The relayer checks receiver, method, gas and deposit caps and fronts the deposit. Web wallets sign and pay directly.</p>
              </article>
              <article>
                <h3>Accounts</h3>
                <p>
                  Factory {FACTORY ? <a href={explorer("address", FACTORY)} target="_blank" rel="noreferrer">{FACTORY}</a> : "Setup required"}, deployed in{" "}
                  <a href={explorer("tx", DEPLOY_TX)} target="_blank" rel="noreferrer">{DEPLOY_TX.slice(0, 6)}…{DEPLOY_TX.slice(-4)}</a>. Charts and holder lists come from the contract's <code>trades()</code> and <code>holders()</code> views, with no indexer.
                </p>
              </article>
            </div>
          </div>
        </section>

        <section className="jl-end" aria-label="Open Juno">
          <div className="jl-wrap jl-end-in">
            <h2>Post something.<br />Watch it trade.</h2>
            <a href="/social" onClick={go("/(tabs)/social")} className="jl-pill jl-pill-lime jl-pill-xl">Open Juno</a>
          </div>
        </section>
      </main>

      <footer className="jl-foot">
        <div className="jl-wrap jl-foot-row">
          <a href="#top" onClick={jump("top")} className="jl-brand" aria-label="Back to top"><Mark size={22} /><span>juno</span></a>
          <p>A social feed where every post is a coin, on NEAR testnet. MIT · © 2026 Nivesh Gajengi</p>
          {FACTORY ? <a className="jl-foot-link" href={explorer("address", FACTORY)} target="_blank" rel="noreferrer">Factory on NearBlocks <External /></a> : null}
        </div>
        <p className="jl-word" aria-hidden="true">juno</p>
      </footer>
    </div>
  );
}
