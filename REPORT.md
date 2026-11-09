# Juno on NEAR — build report (2026-11-09)

## What changed

- **The UI is the original Juno app.** `packages/app` is the Juno Expo app from `juno-wif/app`, imported verbatim (commit `00251dd`) and switched to NEAR in its chain layer only. Feed cards, reels, trade sheet, coin pages with their charts, the tab bar with the lime home pill and black +, sign-in sheet, theme, logo, icons and art keep their look. The Vite `packages/web` was deleted.
- **NEAR-only features inside Juno's components:** sealed-bid opening state with a live countdown and "N sealed bids" (feed button and coin-page card), a "Floor X NEAR" chip and floor row, a Redeem side in the trade sheet, a graduation card linking the post account, a dare card, and a 1Click `dry: true` quote line in the trade sheet. Robinhood-only parts (WIF burn, USDG stock trackers, Uniswap, Privy, server comments/watchlists/plans) are gone.
- **Contract:** a capped on-chain fill log (`trades()`, with NEP-297 style events) and `holders()`, so charts and holder lists come from the chain with no indexer.
- **Live on NEAR testnet:** factory `juno-awkorp.testnet` (created via the `testnet` registrar), players `mira`/`kai`/`oto`, posts `sprout`, `pile-in` (graduated), `cap-toss` (dare, finalised) and `balloons`. 46 transactions in `deployments/testnet-2026-11-09.json` and the README table.

## Test counts

`pnpm test`: **20 passed, 0 failed, 0 skipped** (1 Rust unit, 7 sandbox integration, 1 NEP-366 sandbox, 7 SDK, 1 MCP, 3 relayer policy), plus TypeScript checks of every package including the app. The web export renders at 390 and 1440 in headless Chrome on every route (TESTING.md, `docs/qa/`).

## Honest gaps

- No transaction has been signed from the UI yet: email sign-in needs the relayer's Resend key (BLOCKED.md #2).
- Live NEP-366 on testnet is not done: the relayer fronts the delegate action's deposit and had no spare NEAR (BLOCKED.md #3). It passes on the local sandbox.
- In wave 2 the `cap-toss` bids were committed but not revealed in time, so that auction settled with no fills (penalty applied, as designed), and `balloons` opened with no bids. Wave 1 shows full auctions with clearing prices.
- Likes and follows are device-local (there is no Juno server on NEAR); comments were removed.
- FastNEAR's free RPC throttles bursts with a 429 that has no CORS header; the app falls back to other public testnet RPCs for reads.

## Demo commands

```bash
pnpm run setup && pnpm test
cp packages/app/.env.example packages/app/.env.local   # EXPO_PUBLIC_JUNO_FACTORY=juno-awkorp.testnet
pnpm web:export && pnpm web:serve                      # http://127.0.0.1:8091
pnpm qa:web                                            # screenshots into docs/qa
```

Stop `pnpm web:serve` (and `pnpm relayer` if started) afterwards.
