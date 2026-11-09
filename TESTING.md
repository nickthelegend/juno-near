# Testing evidence

CI-equivalent command: `pnpm test` after `pnpm run setup`. Contract tests run the compiled WASM on a real local nearcore 2.14 sandbox through near-workspaces with signed transactions. No RPC or chain response is substituted anywhere.

| Suite | Passed | Failed | Skipped | What it checks |
| --- | ---: | ---: | ---: | --- |
| Rust curve unit | 1 | 0 | 0 | 16-segment table, monotonic prices, round-trip rounding |
| NEAR sandbox integration | 7 | 0 | 0 | Factory, named post account, sealed auction, uniform clearing and refunds, altered/duplicate/late reveal rejection, sniper parity, hidden-bid penalty, fee split, floor maths, cycle resistance, floor-clamped sells, graduation lock, dare bond, failed NEP-141 receiver refund, and the `trades()` log order and totals plus `holders()` |
| NEP-366 local sandbox | 1 | 0 | 0 | Player signs a delegated sealed bid, a separate relayer submits it, finalized RPC confirms the bid count |
| TypeScript SDK | 7 | 0 | 0 | Curve arithmetic matching the contract, buy fee, floor clamp, commitment binding, sell/redeem/spot quotes |
| MCP stdio integration | 1 | 0 | 0 | Tool discovery and explicit setup state over real stdio JSON-RPC |
| Relayer policy | 3 | 0 | 0 | Signed delegate receiver/method/gas/deposit limits |
| **Total** | **20** | **0** | **0** | |

`pnpm test` on 2026-11-09 also ran `pnpm -r build`, which includes `tsc --noEmit` for the app (`packages/app`), the SDK, the relayer and the MCP server.

## Live NEAR testnet run

`pnpm testnet:seed` (waves 1 and 2, then `--finalize-dare`) on 2026-11-09 produced 46 transactions against factory `juno-awkorp.testnet`, recorded in `deployments/testnet-2026-11-09.json` and the README table. 45 succeeded. One was rejected by the contract on purpose of the data, not hidden: `balloons_refund_oto` panicked `ERR_NO_BID` because that bid had never been placed (its commit window closed while the script was being re-run). In wave 2 the two `cap-toss` bids were committed but the reveal window passed before they could be revealed, so that auction settled with no fills and each bidder lost the 1% hidden-bid penalty to the creator, as the contract specifies. A relayed NEP-366 bid was attempted and refused before submission because the relayer account could not front the 1 NEAR the delegate action attaches (`LackBalanceForState`); it has no hash and is listed in BLOCKED.md.

## Web render proof

`pnpm web:export` (Expo SDK 57, `expo export --platform web`) passed. `pnpm web:serve` served `packages/app/dist` on port 8091 and `packages/app/scripts/qa.mjs` opened each route in headless Chrome (playwright-core, `channel: 'chrome'`) at 390×844 and 1440×900, against the live testnet factory. A route fails if the root is empty, a page error is thrown, or the page scrolls sideways.

| Route | 390 | 1440 |
| --- | --- | --- |
| `/` landing | pass | pass |
| `/social` feed | pass | pass |
| `/trade` | pass | pass |
| `/reels` | pass | pass |
| `/post` | pass | pass |
| `/profile` (signed out) | pass | pass |
| `/coin/sprout…` (curve) | pass | pass |
| `/coin/pile-in…` (graduated) | pass | pass |
| `/coin/cap-toss…` (dare) | pass | pass |

Screenshots: `docs/qa/near-<route>-<width>.png`. `docs/qa/near-compare-feed.png` sets the NEAR feed at 390 beside the original Juno `juno-wif/docs/qa/02-feed.png`. Two earlier QA findings were fixed before the final pass: the reels screen built a video player for photo posts (`NotSupportedError`), and a burst of public-RPC reads occasionally failed a coin page (reads now retry twice).

The live sealed-bid state (feed button **Bidding · 0:42**, coin-page auction card with countdown) was captured during the seed run's commit windows; those windows last one minute, so the final pass shows the settled record instead.
