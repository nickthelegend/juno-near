import { theme } from "../theme";

const c = theme.colors;

/** A ragged top edge for the paper that tears up into the hero. Fixed points, so it never shifts between renders. */
const TEAR_TOP =
  "polygon(0.0% 65.8%, 1.4% 66.7%, 2.8% 64.3%, 4.2% 62.3%, 5.6% 63.0%, 6.9% 60.2%, 8.3% 59.4%, 9.7% 65.1%, 11.1% 60.8%, 12.5% 61.2%, 13.9% 60.4%, 15.3% 59.0%, 16.7% 55.5%, 18.1% 54.9%, 19.4% 53.9%, 20.8% 52.9%, 22.2% 54.0%, 23.6% 52.6%, 25.0% 49.8%, 26.4% 52.9%, 27.8% 48.4%, 29.2% 47.5%, 30.6% 51.2%, 31.9% 47.7%, 33.3% 47.1%, 34.7% 42.9%, 36.1% 44.6%, 37.5% 41.3%, 38.9% 43.6%, 40.3% 39.7%, 41.7% 42.8%, 43.1% 38.1%, 44.4% 38.3%, 45.8% 42.2%, 47.2% 35.3%, 48.6% 34.8%, 50.0% 36.7%, 51.4% 33.4%, 52.8% 32.2%, 54.2% 33.7%, 55.6% 30.1%, 56.9% 29.7%, 58.3% 30.8%, 59.7% 30.9%, 61.1% 28.4%, 62.5% 27.6%, 63.9% 26.2%, 65.3% 25.5%, 66.7% 26.0%, 68.1% 22.6%, 69.4% 24.1%, 70.8% 21.0%, 72.2% 22.8%, 73.6% 22.0%, 75.0% 19.9%, 76.4% 21.6%, 77.8% 16.8%, 79.2% 16.0%, 80.6% 16.4%, 81.9% 14.0%, 83.3% 12.8%, 84.7% 13.7%, 86.1% 13.0%, 87.5% 13.3%, 88.9% 9.1%, 90.3% 12.7%, 91.7% 8.7%, 93.1% 7.0%, 94.4% 8.9%, 95.8% 7.1%, 97.2% 8.6%, 98.6% 3.1%, 100.0% 4.7%, 100% 100%, 0% 100%)";
const TEAR_EDGE =
  "polygon(0.00% 20%, 1.11% 47%, 2.22% 11%, 3.33% 64%, 4.44% 19%, 5.56% 16%, 6.67% 41%, 7.78% 37%, 8.89% 47%, 10.00% 19%, 11.11% 71%, 12.22% 44%, 13.33% 26%, 14.44% 30%, 15.56% 68%, 16.67% 26%, 17.78% 15%, 18.89% 38%, 20.00% 72%, 21.11% 18%, 22.22% 51%, 23.33% 61%, 24.44% 23%, 25.56% 69%, 26.67% 64%, 27.78% 56%, 28.89% 55%, 30.00% 73%, 31.11% 73%, 32.22% 70%, 33.33% 55%, 34.44% 26%, 35.56% 40%, 36.67% 4%, 37.78% 27%, 38.89% 40%, 40.00% 39%, 41.11% 24%, 42.22% 20%, 43.33% 38%, 44.44% 28%, 45.56% 68%, 46.67% 66%, 47.78% 28%, 48.89% 48%, 50.00% 74%, 51.11% 20%, 52.22% 59%, 53.33% 55%, 54.44% 36%, 55.56% 42%, 56.67% 72%, 57.78% 37%, 58.89% 38%, 60.00% 78%, 61.11% 42%, 62.22% 67%, 63.33% 6%, 64.44% 50%, 65.56% 55%, 66.67% 75%, 67.78% 29%, 68.89% 77%, 70.00% 54%, 71.11% 23%, 72.22% 31%, 73.33% 72%, 74.44% 27%, 75.56% 36%, 76.67% 28%, 77.78% 59%, 78.89% 76%, 80.00% 3%, 81.11% 20%, 82.22% 30%, 83.33% 35%, 84.44% 60%, 85.56% 57%, 86.67% 71%, 87.78% 52%, 88.89% 61%, 90.00% 25%, 91.11% 5%, 92.22% 70%, 93.33% 41%, 94.44% 70%, 95.56% 41%, 96.67% 20%, 97.78% 19%, 98.89% 25%, 100.00% 67%, 100% 100%, 0% 100%)";
const TAPE = "polygon(2% 8%, 0% 30%, 3% 52%, 0% 78%, 3% 100%, 97% 92%, 100% 70%, 97% 48%, 100% 24%, 98% 0%)";

/**
 * The landing's styles, scoped under `.jl` so nothing leaks into the app's
 * screens. Juno's own palette from `theme`: ink stage, sage paper, one lime.
 * Urbanist for display and UI, Space Mono for labels and figures.
 */
export const LANDING_CSS = `
.jl {
  --ink: ${c.ink}; --ink2: ${c.inkSoft}; --on-ink: ${c.onInk}; --on-ink-mute: rgba(243,247,238,.62); --ink-line: rgba(243,247,238,.12);
  --sage: ${c.bg}; --sage-deep: #C9D6C1; --surface: ${c.surface}; --alt: ${c.surfaceAlt};
  --text: ${c.text}; --muted: ${c.muted}; --faint: ${c.faint}; --line: ${c.line}; --line2: ${c.lineStrong};
  --lime: ${c.lime}; --lime-press: ${c.limePress}; --pos: ${c.pos}; --paper: #FBFCF6;
  --sans: "Urbanist", ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  --mono: "Space Mono", ui-monospace, "SF Mono", Menlo, monospace;
  --ease: cubic-bezier(.22, 1, .36, 1);
  --gut: clamp(16px, 4vw, 48px);
  flex: 1; min-height: 0; height: 100%; width: 100%;
  overflow-y: auto; overflow-x: hidden; scroll-behavior: smooth;
  background: var(--ink); color: var(--on-ink);
  font-family: var(--sans); font-size: 16px; line-height: 1.5;
  -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility;
}
.jl *, .jl *::before, .jl *::after { box-sizing: border-box; }
.jl h1, .jl h2, .jl h3, .jl p, .jl ol, .jl ul, .jl dl, .jl dd, .jl figure { margin: 0; padding: 0; }
.jl ul, .jl ol { list-style: none; }
.jl :where(a) { color: inherit; }
.jl img { display: block; max-width: 100%; }
.jl code { font-family: var(--mono); font-size: .84em; background: var(--alt); color: var(--text); padding: 1px 6px; border-radius: 6px; overflow-wrap: anywhere; }
.jl-wrap { max-width: 1200px; margin: 0 auto; padding: 0 var(--gut); }
.jl-visually-hidden { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* faq */
.jl-faq { display: grid; gap: 12px; max-width: 920px; margin-top: 48px; padding-bottom: 128px; }
.jl-faq details { background: var(--surface); border-radius: 22px; padding: 0 26px; box-shadow: 0 1px 0 rgba(42,51,38,.04), 0 10px 30px -22px rgba(42,51,38,.3); }
.jl-faq summary { list-style: none; cursor: pointer; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 76px; font-weight: 800; font-size: 20px; letter-spacing: -.03em; }
.jl-faq summary::-webkit-details-marker { display: none; }
.jl-faq summary::after { content: "+"; flex: none; display: grid; place-items: center; width: 34px; height: 34px; border-radius: 50%; background: var(--ink); color: var(--lime); font-size: 20px; font-weight: 700; transition: rotate .25s var(--ease); }
.jl-faq details[open] summary::after { rotate: 45deg; }
.jl-faq details p { color: var(--muted); font-size: 16px; line-height: 1.55; padding: 0 0 24px; max-width: 70ch; }
@media (max-width: 640px) { .jl-faq summary { font-size: 17px; min-height: 64px; } .jl-faq details { padding: 0 18px; } }

/* nav */
.jl-nav { position: sticky; z-index: 20; top: 0; height: 88px; margin-bottom: -88px; display: flex; align-items: center; justify-content: space-between; padding: 0 var(--gut); background: rgba(18,21,14,.78); -webkit-backdrop-filter: blur(14px) saturate(1.2); backdrop-filter: blur(14px) saturate(1.2); border-bottom: 1px solid rgba(243,247,238,.06); }
.jl-brand { display: inline-flex; align-items: center; gap: 8px; color: var(--lime); text-decoration: none; min-height: 44px; }
.jl-brand span { color: var(--on-ink); font-weight: 800; font-size: 27px; letter-spacing: -.05em; line-height: 1; padding-bottom: 3px; }
.jl-nav nav { display: flex; align-items: center; gap: 22px; }
.jl-link { text-decoration: none; font-weight: 500; font-size: 15px; color: var(--on-ink-mute); min-height: 44px; display: inline-flex; align-items: center; transition: color .2s var(--ease); }
.jl-link:hover { color: var(--on-ink); }

/* pills */
.jl-pill { display: inline-flex; align-items: center; justify-content: center; min-height: 44px; padding: 0 20px; border-radius: 999px; text-decoration: none; font-weight: 700; font-size: 15px; letter-spacing: -.01em; transition: transform .25s var(--ease), background-color .2s var(--ease), box-shadow .25s var(--ease); }
.jl-pill:hover { transform: translateY(-1px); }
.jl-pill:active { transform: translateY(0) scale(.98); }
.jl-pill-white { background: var(--on-ink); color: var(--ink); }
.jl-pill-lime { background: var(--lime); color: var(--ink); box-shadow: 0 10px 30px -10px rgba(214,255,61,.55); }
.jl-pill-lime:hover { background: var(--lime-press); box-shadow: 0 14px 36px -10px rgba(214,255,61,.7); }
.jl-pill-xl { min-height: 60px; padding: 0 34px; font-size: 18px; }

/* hero */
.jl-hero { position: relative; min-height: max(720px, min(100svh, 940px)); display: grid; place-items: center; padding: 120px var(--gut) 150px; isolation: isolate; overflow: hidden;
  background: radial-gradient(60% 50% at 50% 46%, #1E2418 0%, var(--ink) 70%); }
.jl-hero::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 14px; background: var(--sage); clip-path: ${TEAR_EDGE}; z-index: 3; }
.jl-hero-copy { position: relative; z-index: 4; display: grid; justify-items: center; text-align: center; gap: 30px; }
.jl-hero h1 { font-weight: 800; font-size: clamp(56px, 9.4vw, 148px); line-height: .9; letter-spacing: -.058em; color: var(--on-ink); padding-bottom: .04em; text-wrap: balance; }
.jl-dot { color: var(--lime); }
.jl-sub { max-width: 40ch; font-size: 15px; line-height: 1.55; color: var(--on-ink-mute); }

/* stickers */
.jl-stickers { position: absolute; inset: 0; z-index: 2; pointer-events: none; }
.jl-st { position: absolute; }
.jl-card { filter: drop-shadow(0 18px 24px rgba(0,0,0,.5)) drop-shadow(0 2px 3px rgba(0,0,0,.35)); }
.jl-paper { background: var(--paper); padding: 7% 7% 0; }
.jl-paper img { width: 100%; aspect-ratio: 1; object-fit: cover; }
.jl-cap { display: flex; align-items: center; justify-content: space-between; gap: 6px; min-height: 2.6em; padding: .55em 0 .7em; font-family: var(--mono); font-size: clamp(9px, .74vw, 11.5px); color: var(--text); line-height: 1.1; white-space: nowrap; }
.jl-cap b { font-weight: 700; overflow: hidden; text-overflow: ellipsis; }
.jl-cap i { font-style: normal; color: var(--muted); }
.jl-tape { position: absolute; left: 50%; top: -11px; width: 46%; height: 24px; translate: -50% 0; rotate: -4deg; background: rgba(214,255,61,.82); clip-path: ${TAPE}; mix-blend-mode: normal; }
.jl-stamp { position: absolute; left: 10%; top: 38%; rotate: -12deg; padding: 4px 10px; border: 2.5px solid var(--pos); border-radius: 6px; color: var(--pos); background: rgba(251,252,246,.9); font-family: var(--mono); font-weight: 700; font-size: clamp(10px, .9vw, 13px); letter-spacing: .14em; text-transform: uppercase; }
.jl-die { width: 100%; height: auto; filter: drop-shadow(2px 0 0 #fff) drop-shadow(-2px 0 0 #fff) drop-shadow(0 2px 0 #fff) drop-shadow(0 -2px 0 #fff) drop-shadow(0 16px 20px rgba(0,0,0,.45)); }

.st-sprout { width: clamp(150px, 12.6vw, 196px); left: 9%; top: 15%; rotate: -8deg; }
.st-coin { width: clamp(92px, 8vw, 128px); left: 3.4%; top: 49%; rotate: 8deg; }
.st-cap-wrap { width: clamp(160px, 13.6vw, 212px); left: 11%; bottom: 9%; rotate: 4deg; }
.st-cap-wrap .jl-st { position: relative; }
.jl-date { position: absolute; left: -10%; bottom: -16px; padding: 4px 10px; background: var(--lime); color: var(--ink); font-family: var(--mono); font-size: 12px; letter-spacing: .04em; rotate: -5deg; box-shadow: 0 6px 14px rgba(0,0,0,.35); }
.jl-marktag { position: absolute; right: -20%; top: -16%; width: 32%; aspect-ratio: 1; display: grid; place-items: center; background: var(--sage); color: var(--ink); rotate: 6deg; box-shadow: 0 8px 18px rgba(0,0,0,.35); }
.jl-marktag svg { width: 58%; height: 58%; }
.st-camera { width: clamp(96px, 8.4vw, 132px); right: 25%; top: 10%; rotate: 9deg; }
.st-balloons { width: clamp(150px, 12.4vw, 190px); right: 7%; top: 21%; rotate: 6deg; }
.st-pile { width: clamp(160px, 13.4vw, 206px); right: 15%; bottom: 8%; rotate: -5deg; z-index: 2; }
.jl-torn { position: absolute; right: -6%; bottom: -70px; width: 52%; height: 330px; z-index: 1;
  background-color: var(--sage); background-image: radial-gradient(rgba(18,21,14,.16) 1.1px, transparent 1.6px); background-size: 7px 7px;
  rotate: -10deg; transform-origin: right bottom; clip-path: ${TEAR_TOP}; }

@media (prefers-reduced-motion: no-preference) {
  .jl-st, .jl-torn { animation: jl-settle .8s var(--ease) both; }
  .st-coin { animation-delay: .05s; } .st-cap-wrap { animation-delay: .1s; } .st-camera { animation-delay: .14s; }
  .st-balloons { animation-delay: .08s; } .st-pile { animation-delay: .22s; } .jl-torn { animation-delay: .02s; }
  .jl-hero-copy { animation: jl-rise .7s var(--ease) both; }
  .jl-chip, .jl-beats > li, .jl-tech article { transition: transform .3s var(--ease), box-shadow .3s var(--ease); }
}
@keyframes jl-settle { from { opacity: 0; translate: 0 22px; scale: .92; } }
@keyframes jl-rise { from { opacity: 0; translate: 0 16px; } }
@keyframes jl-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(14,159,110,.45); } 50% { box-shadow: 0 0 0 6px rgba(14,159,110,0); } }

/* shared light sections */
.jl-live, .jl-sec { background: var(--sage); color: var(--text); }
.jl-lbl { display: inline-flex; align-items: center; gap: 10px; font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--muted); }
.jl-lbl-dark { color: var(--on-ink-mute); }
.jl-pulse { width: 8px; height: 8px; border-radius: 50%; background: var(--pos); animation: jl-pulse 2.4s ease-in-out infinite; }
.jl-pulse.is-off { background: ${c.neg}; animation: none; }

/* live strip */
.jl-live { padding: 56px 0 0; }
.jl-live-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 8px 24px; padding-bottom: 20px; border-bottom: 1px solid var(--line2); }
.jl-acct { display: inline-flex; align-items: center; gap: 6px; font-family: var(--mono); font-size: 13px; color: var(--text); text-decoration: none; min-height: 44px; overflow-wrap: anywhere; }
a.jl-acct:hover { text-decoration: underline; text-underline-offset: 3px; }
.jl-stats { display: grid; grid-template-columns: repeat(3, 1fr); }
.jl-stats > div { display: grid; gap: 4px; padding: 28px 0 32px 28px; border-left: 1px solid var(--line2); }
.jl-stats > div:first-child { padding-left: 0; border-left: 0; }
.jl-stats dt { font-family: var(--mono); font-size: 12px; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
.jl-stats dd { font-weight: 800; font-size: clamp(44px, 6.4vw, 92px); line-height: .95; letter-spacing: -.05em; font-variant-numeric: tabular-nums; color: var(--text); white-space: nowrap; }
.jl-stats dd small { font-size: .3em; font-weight: 700; letter-spacing: -.01em; margin-left: .3em; color: var(--muted); vertical-align: .9em; }
.jl-stats span { font-size: 14px; color: var(--muted); }
.jl-tape-row { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.jl-chip { display: flex; align-items: center; gap: 12px; padding: 10px 14px 10px 10px; min-height: 76px; border-radius: 22px; background: var(--surface); text-decoration: none; color: var(--text); box-shadow: 0 1px 0 rgba(42,51,38,.04), 0 6px 18px -8px rgba(42,51,38,.18); }
.jl-chip:hover { transform: translateY(-2px); box-shadow: 0 1px 0 rgba(42,51,38,.04), 0 14px 28px -12px rgba(42,51,38,.3); }
.jl-chip img { width: 56px; height: 56px; border-radius: 14px; object-fit: cover; flex: none; }
.jl-chip-body { display: grid; gap: 2px; min-width: 0; flex: 1; }
.jl-chip-body b { font-weight: 800; font-size: 16px; letter-spacing: -.02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jl-chip-body span { font-size: 13px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.jl-chip-fig { display: grid; justify-items: end; text-align: right; flex: none; }
.jl-chip-fig b { font-family: var(--mono); font-size: 14px; font-weight: 700; }
.jl-chip-fig span { font-family: var(--mono); font-size: 10.5px; color: var(--muted); letter-spacing: .02em; }
.jl-skel { background: linear-gradient(90deg, rgba(255,255,255,.55), rgba(255,255,255,.9), rgba(255,255,255,.55)); background-size: 200% 100%; animation: jl-shimmer 1.4s linear infinite; box-shadow: none; }
@keyframes jl-shimmer { to { background-position: -200% 0; } }
.jl-empty { grid-column: 1 / -1; padding: 22px; border-radius: 22px; background: var(--surface); color: var(--muted); }
.jl-err { padding: 18px 20px; border-radius: 18px; background: ${c.negSoft}; color: ${c.neg}; font-weight: 600; overflow-wrap: anywhere; }
.jl-empty, .jl-err { display: flex; align-items: center; gap: 16px; }
.jl-obj { flex: none; width: 64px; height: 64px; object-fit: contain; user-select: none; pointer-events: none; }

/* sections */
.jl-sec { padding: 128px 0 0; }
.jl-head { display: grid; gap: 18px; margin-bottom: 48px; }
.jl-head h2, .jl-phone-copy h2, .jl-end h2 { font-weight: 800; font-size: clamp(40px, 5.4vw, 76px); line-height: .96; letter-spacing: -.05em; max-width: 15ch; text-wrap: balance; }

/* beats */
.jl-beats { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; counter-reset: beat; }
.jl-beats > li { display: flex; flex-direction: column; gap: 12px; padding: 14px 14px 26px; border-radius: 30px; background: var(--surface); box-shadow: 0 1px 0 rgba(42,51,38,.04), 0 10px 30px -18px rgba(42,51,38,.3); }
.jl-beats > li:hover { transform: translateY(-3px); }
.jl-beats > li > :not(.jl-beat-art) { margin: 0 14px; }
.jl-beat-art { position: relative; height: 230px; margin-bottom: 10px; border-radius: 22px; background: var(--sage); background-image: radial-gradient(rgba(18,21,14,.1) 1px, transparent 1.4px); background-size: 7px 7px; display: grid; place-items: center; overflow: hidden; }
.jl-beat-art .beat-card { position: relative; width: 150px; rotate: -6deg; }
.beat-coin { width: 150px; rotate: 8deg; }
.jl-beat-n { font-family: var(--mono); font-size: 12px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
.jl-beats h3 { font-weight: 800; font-size: 25px; line-height: 1.1; letter-spacing: -.035em; text-wrap: balance; }
.jl-beats p { color: var(--muted); font-size: 16px; }
.jl-fig { margin-top: auto !important; padding-top: 16px; border-top: 1px solid var(--line); display: grid; gap: 2px; }
.jl-fig b { font-family: var(--mono); font-size: 13.5px; font-weight: 700; color: var(--text); overflow-wrap: anywhere; }
.jl-fig span { font-size: 13px; color: var(--faint); }
.jl-seal { perspective: 600px; }
.jl-env { position: absolute; width: 168px; height: 108px; border-radius: 16px; background: var(--ink); box-shadow: 0 16px 28px -12px rgba(0,0,0,.5); overflow: hidden; }
.jl-env::before { content: ""; position: absolute; inset: 0; background: linear-gradient(155deg, transparent 49.5%, rgba(243,247,238,.08) 50%, transparent 51%), linear-gradient(25deg, transparent 49.5%, rgba(243,247,238,.08) 50%, transparent 51%); }
.jl-env.e1 { rotate: -12deg; translate: -34px 10px; background: var(--ink2); }
.jl-env.e2 { rotate: 7deg; translate: 30px -2px; background: var(--ink2); }
.jl-env.e3 { rotate: -2deg; display: grid; place-items: center; }
.jl-env.e3::after { content: ""; position: absolute; width: 38px; height: 38px; border-radius: 50%; background: var(--lime); box-shadow: inset 0 0 0 5px rgba(18,21,14,.12); }
.jl-env.e3 i { position: absolute; bottom: 10px; left: 14px; font-style: normal; font-family: var(--mono); font-size: 10.5px; color: rgba(243,247,238,.55); letter-spacing: .06em; }

/* phone */
.jl-sec#how { padding-bottom: 136px; }
.jl-phone-sec { padding: 104px 0 120px; background: var(--ink); color: var(--on-ink); position: relative; }
.jl-phone-sec::before { content: ""; position: absolute; left: 0; right: 0; top: -1px; height: 14px; background: var(--sage); clip-path: ${TEAR_EDGE}; rotate: 180deg; }
.jl-phone-sec::after { content: ""; position: absolute; left: 0; right: 0; bottom: -1px; height: 14px; background: var(--sage); clip-path: ${TEAR_EDGE}; scale: -1 1; }
.jl-phone-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 64px; align-items: center; }
.jl-phone-copy { display: grid; gap: 22px; justify-items: start; }
.jl-phone-copy > p:not(.jl-lbl) { color: var(--on-ink-mute); font-size: 18px; max-width: 44ch; }
.jl-points { display: grid; width: 100%; max-width: 480px; }
.jl-points li { display: grid; grid-template-columns: 120px 1fr; gap: 16px; padding: 14px 0; border-top: 1px solid var(--ink-line); }
.jl-points li:last-child { border-bottom: 1px solid var(--ink-line); }
.jl-points b { font-weight: 700; }
.jl-points span { color: var(--on-ink-mute); font-size: 15px; }
.jl-points code { background: rgba(243,247,238,.08); color: var(--on-ink); }
.jl-more { display: inline-flex; align-items: center; gap: 8px; min-height: 44px; color: var(--lime); font-weight: 700; text-decoration: none; }
.jl-more svg { transition: translate .25s var(--ease); }
.jl-more:hover svg { translate: 3px 0; }
.jl-phone-fig { position: relative; display: grid; justify-items: center; gap: 22px; }
.jl-phone { position: relative; width: min(330px, 82vw); padding: 11px; border-radius: 54px; background: #0A0C08; box-shadow: inset 0 0 0 1.5px rgba(243,247,238,.14), 0 40px 80px -30px rgba(0,0,0,.8), 0 0 0 1px #000; rotate: 3deg; }
.jl-phone img { width: 100%; height: auto; border-radius: 43px; }
.jl-island { position: absolute; z-index: 1; top: 21px; left: 50%; translate: -50% 0; width: 96px; height: 28px; border-radius: 20px; background: #0A0C08; }
.st-phone-coin { width: clamp(90px, 9vw, 124px); left: max(0px, calc(50% - 250px)); top: 34%; rotate: -10deg; z-index: 2; }
.jl-phone-fig figcaption { font-family: var(--mono); font-size: 12px; color: var(--on-ink-mute); text-align: center; }

/* tech */
#tech { padding-top: 112px; padding-bottom: 128px; }
.jl-tech { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; }
.jl-tech article { display: grid; align-content: start; gap: 10px; padding: 28px; border-radius: 26px; background: var(--surface); box-shadow: 0 1px 0 rgba(42,51,38,.04), 0 10px 30px -20px rgba(42,51,38,.3); }
.jl-tech article:hover { transform: translateY(-2px); }
.jl-tech h3 { font-weight: 800; font-size: 21px; letter-spacing: -.03em; line-height: 1.15; }
.jl-tech p { color: var(--muted); font-size: 15.5px; }
.jl-tech a { color: var(--text); font-weight: 600; text-decoration: underline; text-decoration-color: var(--line2); text-underline-offset: 3px; overflow-wrap: anywhere; }
.jl-tech a:hover { text-decoration-color: var(--text); }

/* end + footer */
.jl-end { background: var(--ink); padding: 120px 0 40px; position: relative; }
.jl-end::before { content: ""; position: absolute; left: 0; right: 0; top: -1px; height: 14px; background: var(--sage); clip-path: ${TEAR_EDGE}; rotate: 180deg; }
.jl-end-in { display: grid; justify-items: center; text-align: center; gap: 34px; }
.jl-end h2 { max-width: none; font-size: clamp(44px, 7vw, 104px); }
.jl-foot { background: var(--ink); color: var(--on-ink-mute); overflow: hidden; padding-top: 72px; }
.jl-foot-row { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px 28px; padding-bottom: 24px; border-bottom: 1px solid var(--ink-line); }
.jl-foot-row p { font-size: 14px; flex: 1 1 280px; }
.jl-foot-row .jl-brand span { font-size: 22px; }
.jl-foot-link { display: inline-flex; align-items: center; gap: 6px; min-height: 44px; font-size: 14px; text-decoration: none; color: var(--on-ink); }
.jl-foot-link:hover { text-decoration: underline; text-underline-offset: 3px; }
.jl-word { font-weight: 900; font-size: clamp(120px, 31vw, 460px); line-height: .74; letter-spacing: -.07em; color: var(--ink2); text-align: center; margin-top: 24px !important; translate: 0 .08em; user-select: none; }

.jl a:focus-visible { outline: 3px solid ${c.focus}; outline-offset: 3px; border-radius: 12px; }
.jl-hero a:focus-visible, .jl-phone-sec a:focus-visible, .jl-end a:focus-visible, .jl-foot a:focus-visible, .jl-nav a:focus-visible { outline-color: var(--lime); }

/* tablet */
@media (max-width: 1080px) {
  .jl-tape-row { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .jl-tech { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .st-camera { right: 30%; top: 9%; }
}
@media (max-width: 860px) {
  .jl-beats { grid-template-columns: 1fr; }
  .jl-phone-grid { grid-template-columns: 1fr; gap: 56px; }
}

/* phone */
@media (max-width: 640px) {
  .jl-nav { height: 72px; margin-bottom: -72px; }
  .jl-link { display: none; }
  .jl-hero { min-height: 780px; padding: 96px 16px 120px; }
  .jl-hero-copy { gap: 24px; translate: 0 6px; }
  .jl-hero h1 { font-size: clamp(50px, 14.6vw, 64px); }
  .jl-sub { max-width: 30ch; font-size: 14px; }
  .jl-pill-xl { min-height: 56px; padding: 0 30px; font-size: 17px; }
  .st-sprout { width: 112px; left: 4%; top: 92px; rotate: -7deg; }
  .st-coin { width: 70px; left: auto; right: 30%; top: 108px; }
  .st-balloons { width: 104px; right: 4%; top: 104px; }
  .st-camera { display: none; }
  .st-cap-wrap { width: 118px; left: 5%; bottom: 52px; }
  .jl-marktag { right: auto; left: 74%; top: -22%; width: 34%; }
  .jl-date { font-size: 10px; padding: 3px 8px; }
  .st-pile { width: 120px; right: 5%; bottom: 66px; }
  .jl-torn { width: 92%; height: 200px; right: -14%; bottom: -46px; }
  .jl-cap { font-size: 9px; justify-content: flex-start; }
  .jl-cap i { display: none; }
  .jl-date { bottom: -24px; left: -4%; }
  .jl-stamp { font-size: 8.5px; padding: 2px 6px; border-width: 2px; }
  .jl-live { padding-top: 40px; }
  .jl-stats { grid-template-columns: 1fr 1fr; }
  .jl-stats > div { padding: 22px 0 24px 18px; }
  .jl-stats > div:nth-child(3) { grid-column: 1 / -1; padding-left: 0; border-left: 0; border-top: 1px solid var(--line2); }
  .jl-stats dd { font-size: 52px; }
  .jl-tape-row { grid-template-columns: 1fr; }
  .jl-sec { padding-top: 96px; }
  .jl-head { margin-bottom: 32px; }
  .jl-beat-art { height: 200px; }
  .jl-sec#how { padding-bottom: 104px; }
  .jl-phone-sec { padding: 80px 0 88px; }
  .jl-phone-copy > p:not(.jl-lbl) { font-size: 16px; }
  .jl-points li { grid-template-columns: 1fr; gap: 2px; }
  .st-phone-coin { display: none; }
  .jl-tech { grid-template-columns: 1fr; }
  .jl-tech article { padding: 22px; }
  #tech { padding-top: 88px; padding-bottom: 104px; }
  .jl-end { padding-top: 96px; }
}
`;
