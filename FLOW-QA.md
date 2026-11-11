# Full-flow QA — Juno on NEAR

Date: 2026-11-11. Baseline: `a06a34d`. Production web export, Chrome channel `chrome`, headless, at 1440×900 and 375×812. Preview: `http://127.0.0.1:5381` (port checked with `lsof`; never used 8787). Every browser launch is wrapped in the supplied `withChromeLock`; one automated browser runs at a time.

Continuation completed: all 15 route cases and the remaining interactive trader/creator controls pass at both widths. The interrupted click was a harness locator matching an obscured mounted-tab element; visible hit-tested controls work without a product change.

The existing design is preserved. Changes fix data, errors, validation, session state and factual copy; no colors, fonts, art or layout rules are changed. The whole product is **not an unqualified end-to-end PASS**: human Meteor approval, launch/bid spending, and missing refund/dare UI controls remain blocked as detailed below.

## Ordered user flow

Every screenshot stem below has `-1440-after.png` and `-375-after.png` under this directory unless the evidence appendix says otherwise:

```text
/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/flow-qa/juno-near
```

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
| 9 | Complete Meteor approval | **BLOCKED** | A human must sign in and approve in Meteor. No actual human wallet sign-in is claimed by the harness. | `meteor` |
| 10 | Check the buy request | **PASS** | A display-only account with an ephemeral key opens Meteor testnet/sign. Decoded call: buy quantity 1, SPROUT receiver, kai signer, 100 Tgas, live quote deposit. The pop-up is cancelled. | `buy-wallet-request`, `buy-wallet-cancel` |
| 11 | Execute real testnet actions | **PASS** | The repository wallet-path script buys 1 SPROUT, sells it, and submits an intentionally underpaid buy. All three outcomes are recorded; the token balance returns to 70. | `buy-receipt`, `buy-refused` |
| 12 | Read result and receipt | **PASS** | A harness reply replays the real buy outcome to the browser; the app independently follows the real hash to final, shows Done and a NearBlocks receipt. The failed outcome shows The price moved. Try again. This is response-handling evidence, not a Meteor approval. | `buy-receipt`, `buy-refused` |
| 13 | Review profile positions | **FIXED** | Holdings, Activity and About render live positions. Cost and realised/open profit are separate; NEAR values no longer use dollar signs; percentages are not scaled twice. The existing chart now has observed-fill history and a current valuation. | `profile-holdings`, `profile-activity`, `profile-about` |
| 14 | Compare markets and traders | **FIXED** | Trade -> Posts lists live markets; Traders shows realised profit in NEAR, holding value, open P&L and observed exits. Ranking follows the profit-taken label. | `trade`, `traders`, `nav-trade`, `nav-traders` |
| 15 | Inspect a trader | **FIXED** | Direct reads and profit fixes pass. At both widths the trader list opens Kai, Buy this yourself opens the SPROUT sheet, and the holding row opens its detail. A visible hit-tested locator avoids the obscured label in a mounted tab. | `trader`, `trader-from-board`, `trader-buy`, `trader-holding-detail` |
| 16 | Use following filters | **PASS** | A signed-in account with no follows gets an explicit empty state; Show everyone restores the feed. Likes and follows remain device-local. | `following-empty`, `following-reset` |
| 17 | Browse reels | **FIXED** | Photo posts render without video-player errors. Like, sound toggle and share respond. The misleading Say/Comments action now reads View/Open post and opens the post detail. | `reels`, `reel-liked`, `reel-muted-toggle`, `reel-open-detail` |
| 18 | Open the create chooser | **FIXED** | The existing + chooser offers a photo or dare and routes with the correct format. Its accessibility label now says dare, not reel. | `create-sheet`, `dare-form` |
| 19 | Validate a launch | **FIXED** | Choose art, enter name/caption and choose a dare. A 3 NEAR bond is invalid; 0.5 is valid. Oversized UTF-8 captions are blocked before signing. Launch opens sign-in while signed out. | `dare-invalid-bond`, `dare-valid`, `caption-too-many-bytes`, `launch-signin` |
| 20 | Broadcast a new post or bid | **BLOCKED** | Launching requires at least 3 NEAR; a bid escrows 1 NEAR. Both exceed the entire QA spending cap of 0.3 NEAR. No new launch or bid is broadcast in this pass. | `dare-valid` |
| 21 | Redeem a graduated post | **PASS** | PILE-IN opens the floor redemption quote. Switching to Buy shows the curve-closed blocker. No additional redemption is broadcast; existing deployment evidence already records one. | `graduated-redeem-quote`, `graduated-buy-blocked` |
| 22 | Complete refunds and dare lifecycle in the app | **BLOCKED** | Contract methods exist for claim_refund, submit_proof, vote_proof and finalize_dare, but the approved web screens have no corresponding controls. Adding them changes those screens, so this pass reports the gap under the UI rule. CAP-TOSS is a readable finalized record. | `cap-toss` |
| 23 | Handle empty collections | **PASS** | Explicit empty feed, trader list and reels states are exercised with a labeled empty-posts RPC fixture; these screenshots do not claim the deployed factory is empty. | `empty-feed`, `empty-traders`, `empty-reels` |
| 24 | Handle an empty wallet | **PASS** | The real factory account holds no post coins. A display-only session shows 0 positions and Nothing held yet, with no fabricated trades. | `empty-wallet` |
| 25 | Handle unavailable RPC | **PASS** | Aborted testnet reads show a human-readable error and Try again. Recovery is checked by removing the fixture and retrying the feed. These failures are intentional and recorded separately. | `rpc-error`, `feed-retry` |
| 26 | Handle bad links | **FIXED** | A missing NEAR account now reaches No such coin promptly. Malformed trader addresses and unknown routes show useful exits instead of raw errors. | `unknown-coin`, `unknown-trader`, `404` |
| 27 | Email sign-in | **BLOCKED** | The relayer is not configured in this build. A valid email leaves Send code disabled with Setup required. No email is sent. | `email-unconfigured` |
| 28 | Any-chain quote | **BLOCKED** | No mainnet payout/quote account is configured. The buy sheet states setup is required; no 1Click quote or swap is claimed or sent. | `buy-quote` |
| 29 | Active auction states | **PASS** | Labeled market-state fixtures expose commit, reveal and settle. The requests target SPROUT with commit/reveal/settle and 1/0/0 NEAR deposits. Every pop-up is cancelled; a device-secret fixture exercises reveal without claiming a real bid. | `auction-commit`, `auction-bid-request`, `auction-reveal`, `auction-reveal-with-secret`, `auction-reveal-request`, `auction-settle-request` |
| 30 | Cancel a bid and retry | **FIXED** | Before: cancelling the wallet left a local secret that hid the entry form. After: the form and Place sealed bid button return; a second attempt opens Meteor. Secrets are retained when a submission result is uncertain. | `auction-cancel`, `auction-bid-retry` |
| 31 | Sign out and reload | **FIXED** | Before: cancelling Meteor logout appeared to sign out, then reload restored the account. After: local session records are cleared even if wallet key revocation is cancelled, and reload stays signed out. No on-chain key revocation is claimed. | `logout-wallet`, `logout-closed`, `logout-reload` |
| 32 | Share fallback | **PASS** | Chrome exposes native Web Share, which cannot be completed by this headless run. With Web Share explicitly unavailable, the existing fallback copies the full post URL; both widths are checked. | `share-clipboard` |
| 33 | Low balance | **FIXED** | A labeled zero-balance fixture shows the existing funding hint. It now distinguishes wallet deposits/gas from relayer-funded email calls. | `low-balance` |
| 34 | Restore the feed after a failed read | **PASS** | The feed Try again control reloads live posts after simulated network failure. The desktop rail has a separate retry; the feed control is tested explicitly. | `feed-retry` |
| 35 | Creator fees | **PASS** | The creator-only PILE-IN fee control opens Meteor testnet/sign with withdraw_earnings, zero deposit and 120 Tgas from kai to PILE-IN. Cancelling returns the existing control to idle. No claim is broadcast; actual approval remains a human step. | `creator-fees`, `creator-claim-request`, `creator-claim-cancel` |
| 36 | Hosted release | **BLOCKED** | This pass validates the production export at localhost:5381. It does not push or redeploy the hosted site. The fixes must be republished before the hosted README demo can be treated as this tested revision. | `landing` |

## Evidence boundaries and spending

Live browsing uses the deployed factory `juno-awkorp.testnet`. Signed-in display/request checks use an ephemeral, off-chain key, never a user's real browser wallet key. Only `pnpm testnet:wallet-path` reads the seeded player key by file path; no key or `.env` contents are printed. No mainnet action is made.

The receipt checks replay real QA outcomes as the wallet's reply, then let the app poll the real chain. They verify the result/receipt UI and failure mapping, not a human Meteor sign-in or approval. Empty-collection, failed-network, low-balance and active-auction fixtures are explicitly labeled in the evidence JSON and are not deployment evidence.

Three real transactions are recorded in [deployments/wallet-path-2026-11-11.json](deployments/wallet-path-2026-11-11.json):

- Buy: `7DTWb6QYTuPp3hEgvBR2VEDKKvwdA3bzZKW2xb7jPaDy`.
- Sell: `DawGThvsCrD9cX9QfSxgAjfVVqbFAj7WpedXoAk8jVig`.
- Underpayment rejected: `aeTacsWbcWXS6FySgutResdjtsfXFh8ZXrQfak6DSVb`.

RPC outcomes report 633071518855700000000 yoctoNEAR gas burnt. Attached deposits total 478348476081531864202 yoctoNEAR. Their sum is a conservative **0.001111419994937232 NEAR** upper bound, below the **0.3 NEAR** budget; sale proceeds and refunds are not subtracted. There are no other broadcast transactions in this QA. Kai's SPROUT balance is 70 before and after.

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

Before/after attachments: [open the screenshot comparison gallery](/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad/flow-qa/juno-near/screenshot-index.html). It links the original PNGs at both widths for each UI fix.

## Remaining mobile readability observation

**BLOCKED by the approved-UI rule (minor):** at 375 px the opening-auction tile ellipsizes the clearing-price text (`0.000…`). The complete price is available under **Details → Auction cleared**. Evidence: `creator-claim-cancel-375-after.png` beside `creator-claim-cancel-1440-after.png` in the screenshot directory above. Showing the full value in that tile would require changing its font sizing or wrapping, so no further visual change was made.

## QA signer — implementation checkpoint

A QA-only web wallet is selected by Metro only when `EXPO_PUBLIC_QA_SIGNER=1`. Normal web exports use the existing Meteor adapter. The first production export was checked across every JavaScript chunk: no `qa-signer`, `JUNO_QA_SIGNER_BUILD_ONLY`, injection hook or QA wallet label is present. App TypeScript checks and 10 pure data/policy tests pass. The policy rejects non-`.testnet` accounts, non-testnet RPCs, other factories, non-function-call actions and spending beyond 0.3 NEAR.

The real browser transaction run is still pending at this checkpoint. Existing receipt-replay results above remain historical evidence until that run completes. Production sign-in baselines at both widths are saved under the screenshot directory's `qa-signer/before-signin-{1440,375}.png`. No approved screen's styling is changed.

First real browser transaction: buy 2 SPROUT, hash `4yhGYB6dCYjeFySb9GeXicrQXdV1tn1H9gcnn4SbrJdS`, reached FINAL and the app showed its receipt. The harness stopped on a recovered public-RPC HTTP 408 diagnostic before checking the profile; it is retained in `deployments/qa-browser-2026-11-11.json`. The runner now retains recovered testnet RPC transport diagnostics as warnings while still failing page errors, raw error text, broken assets and unrecovered request errors. No wallet response is replayed in this run.

Real-profile checkpoint: a second browser buy, `FjKHepKSxM15DqmNEfYqRiJTnH6zBwziiYz7khRaqYi8`, finalized at 1440 px and changed the on-chain holding from 72 to 74. The existing mounted Profile tab still showed its prior holding. Its stale-state screenshot and the real receipt are in the QA-browser ledger; this is a functional cache/subscription defect, not a wallet approval blocker. A 375 px reproduction is pending before the refresh fix.

Refresh-fix checkpoint: confirmed wallet writes now invalidate market/read caches and notify mounted Profile, Wallet, Trade, Trader and Coin readers. Coin detail retains its existing content while refreshing so the transaction receipt is not unmounted. No styles or layout rules change. App TypeScript and all 10 data/policy tests pass; the mobile before run still holds the pre-fix export while waiting for the shared Chrome lock. Real-browser confirmation of the fix remains pending.
