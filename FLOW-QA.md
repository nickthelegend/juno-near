# Full-flow QA — Juno on NEAR

Date: 2026-11-11. Baseline: `a06a34d`. Production web export, Chrome channel `chrome`, headless, at 1440×900 and 375×812. Preview: `http://127.0.0.1:5381` (port checked with `lsof`; never used 8787). Every browser launch is wrapped in the supplied `withChromeLock`; one automated browser runs at a time.

Continuation completed: all 15 route cases and the remaining interactive trader/creator controls pass at both widths. The interrupted click was a harness locator matching an obscured mounted-tab element; visible hit-tested controls work without a product change.

The existing design is preserved. Changes fix data, errors, validation, session state and factual copy; no colors, fonts, art or layout rules are changed. The QA-signer browser buy/sell flow now passes end to end with real testnet transactions. Launch/bid spending and fresh live lifecycle replay remain blocked as detailed below; R3 adds the four requested lifecycle controls.

## Ordered user flow

Every screenshot stem below has `-1440-after.png` and `-375-after.png` under this directory unless the evidence appendix says otherwise:

`juno-near`

| Step | User flow | Result | Evidence and reason | Screenshot stems |
| ---: | --- | --- | --- | --- |
| 1 | Landing and explanation | **PASS** | Open /, read the product and mechanics, use How it works on desktop or scroll on mobile. Open app reaches /social. | `landing`, `landing-how`, `landing-open` |
| 2 | Browse the feed | **PASS** | /social shows four live post markets. Creator, price, floor and market links read from testnet. | `feed` |
| 3 | Open each post | **PASS** | SPROUT, PILE-IN, CAP-TOSS and BALLOONS resolve directly. PILE-IN shows graduation and CAP-TOSS shows finalized dare evidence. | `sprout`, `pile-in`, `cap-toss`, `balloons` |
| 4 | Inspect a market | **PASS** | Activity, Holders and Details switch; the address copy control copies the exact contract account. | `coin-activity`, `coin-holders`, `coin-details`, `copy-address` |
| 5 | Read chart periods | **FIXED** | Hour/day windows no longer borrow old fills. Quiet periods say No fills in this period; All shows the recorded history. | `chart-hour`, `chart-all` |
| 6 | Quote the main action | **PASS** | Tap Buy, enter 1, inspect fee and floor contribution. Sell and Redeem quote without sending anything. README now includes the amount-entry step. | `buy-quote`, `sell-quote`, `redeem-quote` |
| 7 | Connect a wallet | **PASS** | Profile -> Sign in -> Connect NEAR wallet opens Meteor testnet login for juno-awkorp.testnet, ALL_METHODS. | `signin`, `wallet-open` |
| 8 | Cancel or block wallet connection | **PASS** | Closing the wallet produces the closed-window message. Blocking window.open produces the allow-pop-ups message and a usable retry. | `wallet-closed`, `wallet-blocked` |
| 9 | Approve browser transactions | **PASS** | QA signer connects through the existing sheet and signs real testnet calls in Chrome at both widths. See the QA-signer evidence below. | QA-signer `signin`, `connected-profile` |
| 10 | Check the buy request | **PASS** | A display-only account with an ephemeral key opens Meteor testnet/sign. Decoded call: buy quantity 1, SPROUT receiver, kai signer, 100 Tgas, live quote deposit. The pop-up is cancelled. | `buy-wallet-request`, `buy-wallet-cancel` |
| 11 | Execute real testnet actions | **PASS** | QA signer buys 2 SPROUT then sells 2 in the browser at each width. All four calls reach FINAL; each round trip returns the holding to 76. Earlier underpayment evidence remains in the wallet-path record. | QA-signer `buy-receipt`, `sell-receipt` |
| 12 | Read result and receipt | **PASS** | Real browser calls show Done and a NearBlocks receipt matching each submitted hash. Both the app and an independent Node read confirm FINAL. No receipt replay is used in the QA-signer run. The earlier refused-buy replay remains historical failure-message coverage. | QA-signer `buy-receipt`, `sell-receipt`; historical `buy-refused` |
| 13 | Review profile positions | **FIXED** | Holdings, Activity and About render live positions. Cost and realised/open profit are separate; NEAR values no longer use dollar signs; percentages are not scaled twice. The existing chart now has observed-fill history and a current valuation. Confirmed writes now refresh mounted holdings without reloading; real buy/sell positions match the chain at both widths. | `profile-holdings`, `profile-activity`, `profile-about`; QA-signer `buy-profile`, `sell-profile` |
| 14 | Compare markets and traders | **FIXED** | Trade -> Posts lists live markets; Traders shows realised profit in NEAR, holding value, open P&L and observed exits. Ranking follows the profit-taken label. | `trade`, `traders`, `nav-trade`, `nav-traders` |
| 15 | Inspect a trader | **FIXED** | Direct reads and profit fixes pass. At both widths the trader list opens Kai, Buy this yourself opens the SPROUT sheet, and the holding row opens its detail. A visible hit-tested locator avoids the obscured label in a mounted tab. | `trader`, `trader-from-board`, `trader-buy`, `trader-holding-detail` |
| 16 | Use following filters | **PASS** | A signed-in account with no follows gets an explicit empty state; Show everyone restores the feed. Likes and follows remain device-local. | `following-empty`, `following-reset` |
| 17 | Browse reels | **FIXED** | Photo posts render without video-player errors. Like, sound toggle and share respond. The misleading Say/Comments action now reads View/Open post and opens the post detail. | `reels`, `reel-liked`, `reel-muted-toggle`, `reel-open-detail` |
| 18 | Open the create chooser | **FIXED** | The existing + chooser offers a photo or dare and routes with the correct format. Its accessibility label now says dare, not reel. | `create-sheet`, `dare-form` |
| 19 | Validate a launch | **FIXED** | Choose art, enter name/caption and choose a dare. A 3 NEAR bond is invalid; 0.5 is valid. Oversized UTF-8 captions are blocked before signing. Launch opens sign-in while signed out. | `dare-invalid-bond`, `dare-valid`, `caption-too-many-bytes`, `launch-signin` |
| 20 | Broadcast a new post or bid | **BLOCKED** | Launching requires at least 3 NEAR; a bid escrows 1 NEAR. Both exceed the entire QA spending cap of 0.3 NEAR. No new launch or bid is broadcast in this pass. | `dare-valid` |
| 21 | Redeem a graduated post | **PASS** | PILE-IN opens the floor redemption quote. Switching to Buy shows the curve-closed blocker. No additional redemption is broadcast; existing deployment evidence already records one. | `graduated-redeem-quote`, `graduated-buy-blocked` |
| 22 | Use refunds and dare lifecycle controls | **FIXED** | R3 adds the four eligibility-gated methods in existing components. All app builders pass on a real sandbox. Live QA checks every seeded post/account at both widths; refunds are claimed and CAP-TOSS is final, so there is no eligible testnet action. See R3 below. | `cap-toss`; R3 filenames below |
| 23 | Handle empty collections | **PASS** | Explicit empty feed, trader list and reels states are exercised with a labeled empty-posts RPC fixture; these screenshots do not claim the deployed factory is empty. | `empty-feed`, `empty-traders`, `empty-reels` |
| 24 | Handle an empty wallet | **PASS** | The real factory account holds no post coins. A display-only session shows 0 positions and Nothing held yet, with no fabricated trades. | `empty-wallet` |
| 25 | Handle unavailable RPC | **PASS** | Aborted testnet reads show a human-readable error and Try again. Recovery is checked by removing the fixture and retrying the feed. These failures are intentional and recorded separately. | `rpc-error`, `feed-retry` |
| 26 | Handle bad links | **FIXED** | A missing NEAR account now reaches No such coin promptly. Malformed trader addresses and unknown routes show useful exits instead of raw errors. | `unknown-coin`, `unknown-trader`, `404` |
| 27 | Email sign-in | **BLOCKED** | The relayer is not configured in this build. A valid email leaves Send code disabled with Setup required. No email is sent. | `email-unconfigured` |
| 28 | NEAR mainnet funding | **BLOCKED** | R3 shows Setup required: NEAR_MAINNET_ACCOUNT in the existing buy sheet. No mainnet quote or swap is requested; trades use NEAR testnet. | `buy-quote`; R3 funding captures below |
| 29 | Active auction states | **PASS** | Labeled market-state fixtures expose commit, reveal and settle. The requests target SPROUT with commit/reveal/settle and 1/0/0 NEAR deposits. Every pop-up is cancelled; a device-secret fixture exercises reveal without claiming a real bid. | `auction-commit`, `auction-bid-request`, `auction-reveal`, `auction-reveal-with-secret`, `auction-reveal-request`, `auction-settle-request` |
| 30 | Cancel a bid and retry | **FIXED** | Before: cancelling the wallet left a local secret that hid the entry form. After: the form and Place sealed bid button return; a second attempt opens Meteor. Secrets are retained when a submission result is uncertain. | `auction-cancel`, `auction-bid-retry` |
| 31 | Sign out and reload | **FIXED** | Before: cancelling Meteor logout appeared to sign out, then reload restored the account. After: local session records are cleared even if wallet key revocation is cancelled, and reload stays signed out. No on-chain key revocation is claimed. | `logout-wallet`, `logout-closed`, `logout-reload` |
| 32 | Share fallback | **PASS** | Chrome exposes native Web Share, which cannot be completed by this headless run. With Web Share explicitly unavailable, the existing fallback copies the full post URL; both widths are checked. | `share-clipboard` |
| 33 | Low balance | **FIXED** | A labeled zero-balance fixture shows the existing funding hint. It now distinguishes wallet deposits/gas from relayer-funded email calls. | `low-balance` |
| 34 | Restore the feed after a failed read | **PASS** | The feed Try again control reloads live posts after simulated network failure. The desktop rail has a separate retry; the feed control is tested explicitly. | `feed-retry` |
| 35 | Creator fees | **PASS** | The creator-only PILE-IN fee control opens Meteor testnet/sign with withdraw_earnings, zero deposit and 120 Tgas from kai to PILE-IN. Cancelling returns the existing control to idle. No creator-fee claim is broadcast in this request/cancellation check. | `creator-fees`, `creator-claim-request`, `creator-claim-cancel` |
| 36 | Hosted release | **BLOCKED** | The November 12 hosted art build predates the R3 lifecycle controls and NEAR-only funding state. Nick must redeploy after R3; this task never pushes or redeploys. | `landing` |

Screenshots were captured locally during QA and are not committed.

## Evidence boundaries and spending

Live browsing uses the deployed factory `juno-awkorp.testnet`. The original display/request checks use an ephemeral, off-chain key. The wallet-path script and the new `pnpm test:e2e` read the existing seeded testnet player key privately in Node. The new test injects it only in memory through Playwright `addInitScript`; the QA adapter deletes the injection global on connection and keeps the key out of browser storage. No key or `.env` contents are printed or copied to another file. No mainnet action is made.

The original receipt checks replay real QA outcomes as the wallet's reply, then let the app poll the real chain. Those historical checks cover failure mapping. The QA-signer run below supersedes the successful receipt/profile coverage with newly signed browser transactions. Empty-collection, failed-network, low-balance and active-auction fixtures are explicitly labeled in the evidence JSON and are not deployment evidence.

Three real transactions are recorded in [deployments/wallet-path-2026-11-11.json](deployments/wallet-path-2026-11-11.json):

- Buy: `7DTWb6QYTuPp3hEgvBR2VEDKKvwdA3bzZKW2xb7jPaDy`.
- Sell: `DawGThvsCrD9cX9QfSxgAjfVVqbFAj7WpedXoAk8jVig`.
- Underpayment rejected: `aeTacsWbcWXS6FySgutResdjtsfXFh8ZXrQfak6DSVb`.

RPC outcomes report 633071518855700000000 yoctoNEAR gas burnt. Attached deposits total 478348476081531864202 yoctoNEAR. Their sum is a conservative **0.001111419994937232 NEAR** upper bound, below the **0.3 NEAR** budget; sale proceeds and refunds are not subtracted. That original wallet-path run leaves Kai's SPROUT balance at 70. The subsequent QA-signer probes and final browser run are recorded separately below; they are included in the combined cost ceiling.

## RPC and hosting limits

The extended interaction pass against FastNEAR encountered browser CORS failures when its public endpoint throttled. Its existing fallback recovered reads; those console/network diagnostics remain in `interactions-final.json` rather than being hidden. The app default and README local-export command now use the already-supported `https://near-testnet.drpc.org` endpoint, with FastNEAR and the official testnet node retained as fallbacks. The final route/provider passes are recorded separately. Public RPC availability is external and can still change.

The hosted deployment is not republished by this task. Use the README local-export commands to reproduce this revision. The hosted URL needs a new deployment before judging.

## Validation

- Production export succeeds with dotenv loading disabled and explicit public testnet configuration.
- Final route pass: 30 captures (15 cases × 2 widths). Final provider/interaction continuation: 28 captures. Both passes have zero page errors, console errors, failed requests, broken images, suspicious raw text or horizontal overflow.
- All browsers launched for this QA are closed. The preview server on 5381 is stopped after verification.
- App and SDK TypeScript checks pass.
- `pnpm --filter app test`: 7 pure data tests, covering cost accounting, transfers/capped records, observed-fill history and chart windows.
- `pnpm --filter @juno/sdk test`: 8 tests, including a local HTTP transport fixture that preserves missing-account and contract error detail.
- The full Rust/sandbox suite is not repeated; no contract code changes in this pass.
- The design detector reports no findings on changed screen/component files. It is not a visual approval or a replacement for screenshots.

## Screenshot and diagnostic index

`initial.json` and `interactions.json` contain the before pass. `routes-final.json` contains the final production route pass. `interactions-final.json` contains the broad interaction confirmation pass. `edges-before.json` / `edges-after.json` cover auction, share, follow and low-balance branches; `logout-before.json` / `logout-after.json` cover session persistence and feed retry. `provider-final.json` contains 28 completed captures across both widths: final-provider wallet requests, profile history, real-outcome receipt replay and explorer link, tab/list/trader navigation, creator-fee request/cancellation and sign-out persistence. The interrupted partial record is preserved as `provider-incomplete-checkpoint.json`. Diagnostic rows retain visible text, console/page errors, failed requests, overflow and screenshot filenames. Deliberately aborted RPC calls and Meteor's headless Cloudflare page are separated from ordinary app requests. Some early harness attempts are marked script failures (the mobile How it works link is intentionally hidden, and an initial transaction-decoder import was corrected, and a later locator selected a label behind the active tab); they are not product crashes.

Before/after screenshots use the same approved components and viewport sizes. Each UI fix has both widths in the matching evidence:

| Fix | Before stems | After stems |
| --- | --- | --- |
| RPC missing-account handling | `unknown-coin` | `unknown-coin` |
| Trader profit and currency | `traders`, `trader` | `traders`, `trader` |
| Profile cost, percentages and history | `profile-holdings` | `profile-holdings` |
| Chart time windows | `pile-in`, `cap-toss`, `chart-hour` | `pile-in`, `cap-toss`, `chart-hour` |
| Launch UTF-8 validation | `post`, `dare-valid` | `post`, `caption-too-many-bytes` |
| Factual funding/floor/action copy | `landing`, `feed`, `post`, `reels`, `create-sheet` | same stems |
| Cancelled bid retry | `auction-cancel` | `auction-cancel`, `auction-bid-retry` |
| Sign-out persistence | `logout-reload` | `logout-reload` |
| Low-balance and refund copy | `low-balance`, `auction-settle` | same stems |

The `before` files are local QA evidence only. The old route proof under `docs/qa` is unchanged. No QA screenshots are added to the repository.

Before/after attachments: `screenshot-index.html`. It links the original PNGs at both widths for each UI fix.

Screenshots were captured locally during QA and are not committed.

## Remaining mobile readability observation

**BLOCKED by the approved-UI rule (minor):** at 375 px the opening-auction tile ellipsizes the clearing-price text (`0.000…`). The complete price is available under **Details → Auction cleared**. Evidence: `creator-claim-cancel-375-after.png` beside `creator-claim-cancel-1440-after.png` in the screenshot directory above. Showing the full value in that tile would require changing its font sizing or wrapping, so no further visual change was made.

## QA signer — real browser results

**PASS — `pnpm test:e2e`, 2026-11-11.** Tested source: `53f58ae`. Run: `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1`. Chrome channel `chrome`, headless, under the shared lock, on local port 5383. Swap free was 1401.44 MB before both exports. Browser and preview server closed after completion.

The normal export forces `EXPO_PUBLIC_QA_SIGNER=0`. Metro selects the QA adapter only for the flagged web export and rejects QA imports in production. All 5 production JavaScript chunks were scanned: no QA module name, marker, injection hook, session key or wallet label was found. The separate QA export contains the adapter. Bundle fingerprints are in [the public transaction ledger](deployments/qa-browser-2026-11-11.json). App TypeScript and all 10 data/policy tests pass, including mainnet/RPC/action rejection and the shared spending limit.

The real key is read in Node from the existing gitignored testnet file and passed to the browser only in memory. Playwright debug logging is disabled; no trace, HAR, browser video or storage-state file is produced. The QA wallet requires localhost/127.0.0.1 on ports 5300–5999, named `.testnet` accounts, an allowlisted testnet RPC and Juno function calls. A Node guard checks available balance before spending and reserves deposits plus three times maximum gas. Public hashes are persisted before broadcast; uncertain calls retain their reservation. The 0.3 NEAR cap includes failed QA-browser runs across dates.

Manual integration note: Meteor's own human sign-in/approval remains untested. The QA signer proves the app's transaction, confirmation, receipt and position flow; it does not prove Meteor's account grant or key revocation screens.

### Ordered real browser flow

Each step passed at **1440×900 and 375×812**:

1. Open `/`, read the landing page, then Open app → `/social`.
2. Profile → Sign in → Connect NEAR wallet. QA signer connects `kai.juno-awkorp.testnet`; the injection global is removed and no key is stored in localStorage.
3. Read the 76-SPROUT starting position. Mount Trade → Traders, then return to Profile.
4. Social → Sprout → Buy → quantity 2 → Buy. The browser signs and sends to `sprout.juno-awkorp.testnet`.
5. Wait for FINAL and Done. Match the on-screen receipt hash to the submitted hash; independently verify the successful chain outcome and balance 78.
6. Done → back to Social → Profile. The existing mounted position shows 78 SPROUT without a page reload.
7. Social → Sprout → Buy → Sell → quantity 2 → Sell. Wait for FINAL and the matching receipt; independently verify balance 76.
8. Return to Profile without reload. The position shows 76 SPROUT again. About → Sign out shows No wallet yet.

| Width | Call | Transaction | SPROUT after | Result |
| --- | --- | --- | --- | --- |
| 1440 | buy 2 | [DAgLdhrvwdq4aKEtt36UoQrVi3uvtAVv7Cgw7qKUvyHd](https://testnet.nearblocks.io/txns/DAgLdhrvwdq4aKEtt36UoQrVi3uvtAVv7Cgw7qKUvyHd) | 78 | FINAL; receipt and Profile verified |
| 1440 | sell 2 | [775gGv4FQatKb5obQDwvpj13Wm7FekRV1a9kP76CkSbr](https://testnet.nearblocks.io/txns/775gGv4FQatKb5obQDwvpj13Wm7FekRV1a9kP76CkSbr) | 76 | FINAL; receipt and Profile verified |
| 375 | buy 2 | [Bua9DtCuRvzJeR8eaitxjdgibG9NyPuAJxbkWf8vrPDh](https://testnet.nearblocks.io/txns/Bua9DtCuRvzJeR8eaitxjdgibG9NyPuAJxbkWf8vrPDh) | 78 | FINAL; receipt and Profile verified |
| 375 | sell 2 | [CHL87VxkMns5jcnV3NmrMR2HvpPSufHDn3qwXCg3H4Tg](https://testnet.nearblocks.io/txns/CHL87VxkMns5jcnV3NmrMR2HvpPSufHDn3qwXCg3H4Tg) | 76 | FINAL; receipt and Profile verified |

All 22 captured steps have no page errors, horizontal overflow, broken images or raw error text. Four public dRPC HTTP 408 responses (one per receipt step) recovered; their console/network diagnostics remain in the ledger. Real finality, receipts and profile assertions still passed. Other request errors and JavaScript errors fail the test.

### Functional fix and probe accounting

Two pre-fix browser buys reached FINAL but left the mounted Profile tab stale: `FjKHepKSxM15DqmNEfYqRiJTnH6zBwziiYz7khRaqYi8` at 1440 and `B4QW7rFDTK3mXMfHG2qgsAu3QyrZYPby5cXcamFRzTdj` at 375. Fix `d848a8d` invalidates shared caches and notifies mounted Profile, Wallet, Trade, Trader and Coin readers after confirmed writes. Coin content stays mounted during the refresh so the receipt sheet survives. Styles, layout, colors, fonts and art are unchanged.

The first probe, `4yhGYB6dCYjeFySb9GeXicrQXdV1tn1H9gcnn4SbrJdS`, reached a real receipt but the harness stopped on a recovered HTTP 408. The three probe buys remain real purchases: they increased Kai's holding from 70 to 76. They were not rolled back or replayed. The successful final run starts and ends at 76 at each width.

All seven QA-browser transactions, including failed probes: **6664799550672602701431 yoctoNEAR**, below **0.006665 NEAR**, conservatively counting attached deposits and all receipt gas without subtracting sale proceeds/refunds. Combined with the earlier wallet-path run, the full November 11 QA ceiling is below **0.007777 NEAR**, within 0.3. No launch or bid is broadcast.

### Screenshot attachments

`screenshot-index.html` includes the original sign-in baselines, stale pre-fix Profile captures, final receipts and refreshed positions. Profile position captures scroll to the holding row. No screenshots are committed to the repo.

The QA-signer screenshots use the following exact paths, rather than the earlier `-after.png` naming convention:

| Width | Step | Screenshot |
| --- | --- | --- |
| 1440 | landing | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-landing-1440.png` |
| 1440 | signin | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-signin-1440.png` |
| 1440 | connected-profile | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-connected-profile-1440.png` |
| 1440 | connected-traders | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-connected-traders-1440.png` |
| 1440 | buy-quote | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-buy-quote-1440.png` |
| 1440 | buy-receipt | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-buy-receipt-1440.png` |
| 1440 | buy-profile | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-buy-profile-1440.png` |
| 1440 | sell-quote | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-sell-quote-1440.png` |
| 1440 | sell-receipt | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-sell-receipt-1440.png` |
| 1440 | sell-profile | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-sell-profile-1440.png` |
| 1440 | signed-out | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-signed-out-1440.png` |
| 375 | landing | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-landing-375.png` |
| 375 | signin | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-signin-375.png` |
| 375 | connected-profile | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-connected-profile-375.png` |
| 375 | connected-traders | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-connected-traders-375.png` |
| 375 | buy-quote | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-buy-quote-375.png` |
| 375 | buy-receipt | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-buy-receipt-375.png` |
| 375 | buy-profile | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-buy-profile-375.png` |
| 375 | sell-quote | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-sell-quote-375.png` |
| 375 | sell-receipt | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-sell-receipt-375.png` |
| 375 | sell-profile | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-sell-profile-375.png` |
| 375 | signed-out | `3a3dd6c0-6797-4e8b-aa05-4e5a42dd3fe1-signed-out-375.png` |

Screenshots were captured locally during QA and are not committed.

## Judging R3 — November 12

**PASS:** `pnpm test:lifecycle`, app/SDK TypeScript, 12 app data/policy tests and 8 SDK tests. The local sandbox executes all four exact app call builders against the existing WASM; it records 12 local transactions including setup. The method hashes below belong to the local sandbox and have no public explorer link. Three earlier local-only harness attempts stopped on fast-forward/finality handling; the corrected run passed. No public testnet transaction was made by those attempts.

| App builder | Sandbox result | Local transaction hash | Live testnet |
| --- | --- | --- | --- |
| `claim_refund` | PASS | `5FJN3kxfRNpmSbAW5YC4GUW7yewBBUX1zRonsPAAJBo` | No eligible seeded state |
| `submit_proof` | PASS | `FNkwbTDYmF6HCjfoDqZg9dn7e5arp2h6TM2jsb5xAx9q` | No eligible seeded state |
| `vote_proof` | PASS | `F3WGqizJbSy9usatGjd1p3ja4PgSxvkZQxSBkK9cBsHc` | No eligible seeded state |
| `finalize_dare` | PASS | `82K3RZ92wLDsUHmYrNDdFtrCPQixEtKTNpedFST6tWMq` | No eligible seeded state |

**PASS:** `pnpm test:r3` on source `2187385`. QA signer connects kai, mira and oto to `juno-awkorp.testnet` in Chrome at 1440×900 and 375×812. Four posts × three accounts × two widths gives 24 browser account/post checks. The 70 screenshots cover each refund reason, the three CAP-TOSS dare reasons, no-dare posts, and the NEAR-only funding line. The chain inventory also has 12 initial read-only checks.

The public `STATE` decoder reads refund amounts, holding balances, recorded votes and the dare deadline at a final block. These fields are not exposed by the deployed contract's `market` view. Its output was cross-checked against `market` and the real local contract. No contract deployment or upgrade is needed. The app re-reads eligibility before signing, validates proof length in UTF-8 bytes, sends zero-deposit calls through the same wallet path as buy/sell, and uses the existing pending/final receipt and NearBlocks components. No style definitions, fonts, colors or art changed.

**BLOCKED — fresh live lifecycle execution:** all seeded auction refunds for the demo accounts are already claimed. CAP-TOSS's proof/vote window is closed and its dare is finalized; the other three posts have no dare. No post/account is eligible, so no testnet lifecycle transaction was sent or invented. A new launch costs 3 NEAR and a bid 1 NEAR, both outside the 0.3 NEAR cap. Failed-dare payout claiming (`claim_dare`) remains contract-only and is outside these four actions.

R3 testnet spend: **0 NEAR**, zero testnet hashes. The 12 sandbox hashes are separate from public testnet evidence. The append-only run history, full eligibility inventory, screenshots and any transaction reservations/hashes are in [deployments/r3-2026-11-12.json](deployments/r3-2026-11-12.json). The export-resolution harness failure is retained; the successful functional pass and image-decoding confirmation pass remain separate runs.

The final capture pass waits for visible images to decode. All 70 captures have zero page errors, raw error text, broken images and horizontal overflow. 13 public-RPC transport diagnostics recovered through the existing fallback and remain recorded; they are not described as a zero-console-error pass. Both normal production export and the flagged QA export succeed. The production scan finds no QA signer in its 5 JavaScript chunks; the QA adapter is present only in the separate QA export. Browsers, the local sandbox and preview port 5384 are stopped.

The dead-link acceptance grep prints nothing. Screenshot links to local machines were replaced with plain filenames without changing the historical result rows. `r3-screenshot-index.html` compares before/after captures at 1440 and 375. The remaining 70 filenames and diagnostics are in the R3 ledger.

Screenshots were captured locally during QA and are not committed.

| Width | State | Screenshot filename |
| --- | --- | --- |
| 1440 | Funding setup | `after-1794480019158-signed-out-buy-quote-1440.png` |
| 1440 | Dare reasons | `after-1794480019158-signed-out-dare-1440.png` |
| 1440 | Claimed refund | `after-1794480019158-kai-sprout-claim_refund-reason-1440.png` |
| 1440 | Non-bidder refund | `after-1794480019158-kai-pile-in-claim_refund-reason-1440.png` |
| 1440 | No dare | `after-1794480019158-kai-balloons-no-dare-1440.png` |
| 375 | Funding setup | `after-1794480019158-signed-out-buy-quote-375.png` |
| 375 | Dare reasons | `after-1794480019158-signed-out-dare-375.png` |
| 375 | Claimed refund | `after-1794480019158-kai-sprout-claim_refund-reason-375.png` |
| 375 | Non-bidder refund | `after-1794480019158-kai-pile-in-claim_refund-reason-375.png` |
| 375 | No dare | `after-1794480019158-kai-balloons-no-dare-375.png` |

**BLOCKED — hosted release:** the hosted November 12 art build predates these lifecycle controls and the NEAR-only setup state. Nick must redeploy; this task did not redeploy.
