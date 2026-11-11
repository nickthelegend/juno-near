# Testing evidence

CI-equivalent command: `pnpm test` after `pnpm run setup`. Contract tests run the compiled WASM on a real local nearcore 2.14 sandbox through near-workspaces with signed transactions. Contract and live transaction evidence uses real chain responses. Separate UI error/empty-state fixtures used in the November 11 flow pass are labeled in FLOW-QA.md; they are not transaction evidence.

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

The web landing (`/`) was rebuilt as a full-width page and re-checked on 2026-11-09 against the production export: `qa.mjs` passed `/` and `/post` at 390 and 1440, and a full-page pass at 375, 390 and 1440 found no sideways scroll, no page errors, and the live strip reading 4 posts, 9 holders (summed across posts) and 0.7132 NEAR in floors from `juno-awkorp.testnet`. The phone on the landing shows `packages/app/public/landing/feed-390.webp`, a screenshot of `/social` taken from the running app that day.

The live sealed-bid state (feed button **Bidding · 0:42**, coin-page auction card with countdown) was captured during the seed run's commit windows; those windows last one minute, so the final pass shows the settled record instead.

## Web wallet sign-in (2026-11-10)

The web sign-in sheet's **Connect NEAR wallet** (Meteor Wallet on testnet through `@near-wallet-selector/core` 10.1.4) was checked in three parts. What was and was not clicked through is stated per part.

**1. The call path on testnet (`pnpm testnet:wallet-path`, real transactions).** The script runs the web app's own `lib/browser-wallet.web.ts`, `lib/wallet-actions.ts`, `lib/tx-status.ts` and `lib/chain.ts` in Node. The seeded player `kai.juno-awkorp.testnet`'s key (read from gitignored `.near-credentials/seed.json`, never printed) is put in Meteor Wallet's key store in an in-memory localStorage; Wallet Selector restores the session and `sendWithWallet` sends each call. Because that key is a full-access key, Meteor's module signs locally instead of opening its approval pop-up; everything else is the path the hosted app runs. Results on `sprout.juno-awkorp.testnet`, each followed to `FINAL` by `confirmTx` and re-read independently over a second RPC (drpc):

| Call | Deposit | Result | Transaction |
| --- | --- | --- | --- |
| `buy {"quantity":"1"}` | live `quote_buy` (0.00027866 NEAR) | success | [Ctgzkkpo…](https://testnet.nearblocks.io/txns/Ctgzkkpom8Vd8EA8tDPDGvCgAMGSw9fi9E91DqWfz7P8) |
| `sell {"quantity":"1"}` | 0 | success | [FJneJpBW…](https://testnet.nearblocks.io/txns/FJneJpBWm9CTHraJTyCW1QRvuACtZSCXr54Qhhqh7Ccu) |
| `buy {"quantity":"1"}` | 1 yocto | refused, `ERR_PAYMENT` → shown as "The price moved. Try again." | [5GMQ5iGk…](https://testnet.nearblocks.io/txns/5GMQ5iGkUT2eJBcBWLEk5kN668MPv7tpojondT6rKQMH) |

An earlier run of the same script that day also landed a buy ([3w2q7cSL…](https://testnet.nearblocks.io/txns/3w2q7cSLoALtb9nWa329bNqPXdr7zWCTPpys1N89499R)), a sell ([2rhPd2Ri…](https://testnet.nearblocks.io/txns/2rhPd2RiBaBbBHFVV1JVWPCLq1evp8QXaCjVq74fQ62s)) and a refused underpaid buy ([GKnEsHTi…](https://testnet.nearblocks.io/txns/GKnEsHTia8kGa9SUFvHV2KSKMa9wJ1ghmXQMzZWfCns4)); that run stopped on the refusal, which led to `sendWithWallet` returning the hash of a landed failure so `confirmTx` reports it. Kai's SPROUT balance was 50 before and after each run.

**2. The browser, against the live export at https://juno-near.vercel.app (headless Chrome, playwright-core).** At 1440×900 and 375×812: `/profile` → **Sign in** opens the sheet with **Connect NEAR wallet** (440×58 and 335×58 px), no sideways scroll, no console errors. Tapping it opens Meteor's pop-up at `wallet.meteorwallet.app/connect/testnet/login`, and the request the app posts into it reads `actionType: login`, `network: testnet`, `contract_id: juno-awkorp.testnet`, `type: ALL_METHODS` with a fresh public key. Closing the pop-up returns the sheet to idle with "The wallet closed before you signed in." A signed-in Meteor session was then injected into localStorage for display only (kai's account id with a throwaway key that is not on chain): `/profile` shows **NEAR wallet · NEAR testnet**, kai's live balance and holdings. On `/coin/sprout…`, **Buy** with quantity 1 opens `wallet.meteorwallet.app/connect/testnet/sign`, and the transaction posted into it decodes to signer `kai.juno-awkorp.testnet`, receiver `sprout.juno-awkorp.testnet`, `buy {"quantity":"1"}`, 100 Tgas, deposit 278655709565404444588 yocto (the live `quote_buy`). Closing it leaves the trade sheet idle with no error (a cancel says nothing, as for email accounts).

**3. A regular browser.** Meteor's site sits behind Cloudflare, which blocks headless Chrome ("Sorry, you have been blocked"), so its screens were not visible in part 2. In the desktop app's browser pane, `wallet.meteorwallet.app/connect/testnet/login` loads normally and asks for a Meteor account ("No Meteor Wallet account found for connecting to an external app"). The same pane blocks pop-ups that were not opened by a person's own click, and the hosted app showed "Your browser blocked the wallet window. Allow pop-ups for this site, then try again." for that case.

**Not clicked through:** Meteor's own sign-in and approval screens with a real Meteor testnet account. That needs a person with a Meteor wallet; a script cannot approve in a wallet.

Other checks: `tsc --noEmit` passes for the app. The web export splits the wallet code into its own chunk (`index-*.js`, 938 KB), loaded only when a sign-in sheet opens or a returning wallet session is restored; the entry bundle stays 2.8 MB. MyNearWallet was tried first and dropped: its testnet pop-up answered "MyNearWallet can't connect to apps anymore". An iOS export needs a `util` shim for a failure that predates this work (BLOCKED.md item 8); with it, the iOS bundle builds and contains no wallet-selector code.

Screenshots: `docs/qa/near-signin-wallet-1440.png`, `docs/qa/near-signin-wallet-375.png`, `docs/qa/near-profile-wallet-375.png` (live site).

## Full-flow QA (2026-11-11)

See [FLOW-QA.md](FLOW-QA.md) for the production export walkthrough at 1440×900 and 375×812, before/after screenshot paths, wallet pop-up checks, receipt replay boundaries and remaining blockers. This pass runs `pnpm --filter app test` (7 pure data tests), `pnpm --filter @juno/sdk test` (8 tests, including one transport test using a local HTTP fixture), and TypeScript checks for the app and SDK. The historical 20-test result above is from November 9; the full contract/sandbox suite was not repeated in this flow pass.

`pnpm testnet:wallet-path` ran three real transactions on November 11, recorded in [deployments/wallet-path-2026-11-11.json](deployments/wallet-path-2026-11-11.json): buy 1 SPROUT, sell 1 SPROUT, and an intentionally underpaid buy rejected with `ERR_PAYMENT`. The conservative spend ceiling, including all attached deposits and all gas without subtracting sale proceeds/refunds, was 0.00111142 testnet NEAR (budget: 0.3). Keys were read only by file path and never printed. Browser sessions for signed-in UI checks use an ephemeral key that is not on chain; Meteor's own approval screens still need a human.

## Real browser QA signer

Run `pnpm test:e2e` from the repo root after `pnpm install`, with Google Chrome installed. The test uses Playwright's `channel: 'chrome'` under the shared Chrome lock. It builds and scans the normal production export, then builds a separate QA export under the temporary screenshot directory and serves it on a free local port between 5383 and 5999. Swap is checked before each export; below 500 MB free, the test waits two minutes.

The QA export sets `EXPO_PUBLIC_QA_SIGNER=1`; Metro substitutes a QA-only adapter for the web wallet. The normal export script forces the flag to 0, even if the caller exported 1. Production builds resolve the normal Meteor adapter and reject QA-module imports. Every JavaScript chunk is scanned for the QA module name, marker, hook names and wallet label. The QA adapter must be present in the QA export and absent in production.

The harness reads the existing `kai` player from `.near-credentials/seed.json` in Node, then passes the key only as an in-memory `page.addInitScript` argument. No key is logged, saved in browser storage, exported as storage state, or copied to another file. Traces, HARs and browser video recording are disabled. The wallet only accepts named `.testnet` accounts, allowlisted testnet RPCs, local preview origins and Juno function calls. It implements `getAccounts`, `signAndSendTransaction` and sequential `signAndSendTransactions`.

At both 1440×900 and 375×812, the test connects through the existing sign-in sheet, buys 2 tokens, sells 1, redeems 1 and checks the app's real final receipt plus the profile position after each call without reloading the page. Successful completion returns the token holding to its starting balance. Launches and 1 NEAR bids are outside the 0.3 NEAR limit and are not sent.

A shared Node budget guard reserves attached deposits plus three times the requested maximum gas charge. It checks the available account balance first and before every call. Below 0.1 available testnet NEAR, the run stops before spending. Reservations and public hashes are saved before broadcast to `deployments/qa-browser-<UTC-date>.json`; uncertain submissions remain reserved. Final chain costs replace reservations. Existing QA-browser evidence across dates is counted toward the same 0.3 NEAR cap, including failed runs. Do not delete that evidence to reset the limit.

Optional configuration: `JUNO_QA_PLAYER` (default `kai`), `JUNO_QA_PLAYER_FILE` (must stay under this repo's `.near-credentials/`), `JUNO_QA_FACTORY`, `JUNO_QA_RPC`, `PLAYWRIGHT_CORE`, and `CHROME_LOCK_MODULE`. The supplied machine's Chrome lock and screenshot path are the defaults. Screenshots, diagnostic build logs and the QA-only export go under `/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/flow-qa/juno-near/qa-signer/`. Servers and browsers close in `finally` blocks. A human Meteor sign-in/approval remains a separate manual integration check.

Implementation checkpoint: adapter policy tests and production exclusion pass; the first real browser transaction run is pending.

Recovered HTTP 408/429/5xx or network failures from the allowlisted testnet RPCs remain in the step diagnostics. They do not fail a step if its UI and real transaction/profile assertions recover; other network errors and JavaScript errors still fail the run. The first probe reached a real final buy receipt and stopped on such a recovered 408, which remains in the deployment ledger.
