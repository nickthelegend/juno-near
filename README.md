# Juno on NEAR

Juno turns photo posts into NEAR tokens with a sealed-bid launch, trading curve and redeemable NEAR floor.

Meme coin launches reward whoever gets the first transaction in. Holders can also be left with no buyer when they want to exit. Juno opens each post market at one auction clearing price and lets holders burn tokens for a share of its NEAR floor vault.

## Try it

1. Open [the hosted feed](https://juno-near.vercel.app/social) - see four seeded posts with prices and floor balances read from NEAR testnet. Browsing needs no sign-in.
2. Open [PILE-IN](https://juno-near.vercel.app/coin/pile-in.juno-awkorp.testnet) - see its trade chart, holders, graduation escrow and **Redeem against the floor** button.
3. Open [CAP-TOSS](https://juno-near.vercel.app/coin/cap-toss.juno-awkorp.testnet) - see the settled opening auction and finalized dare record.
4. Open [SPROUT](https://juno-near.vercel.app/coin/sprout.juno-awkorp.testnet), tap **Buy**, then enter **1** token - see a quote in NEAR, the fee and the amount added to the floor. No transaction is sent by opening the sheet.
5. To trade, open [Profile](https://juno-near.vercel.app/profile), tap **Sign in**, then **Connect NEAR wallet** with a funded Meteor testnet wallet - see the wallet connection request. After signing in, return to SPROUT, tap **Buy**, enter a token quantity and approve the buy in the wallet - the app follows the transaction and shows its explorer link.

The wallet call path has recorded testnet buys and sells. A human click-through of Meteor's own sign-in and approval screens is still pending; see [TESTING.md](TESTING.md#web-wallet-sign-in-2026-11-10). Email sign-in needs a configured relayer. The buy sheet shows **Setup required: NEAR_MAINNET_ACCOUNT**; mainnet funding is not implemented. The local revision adds eligibility-gated auction refunds and dare proof/voting/finalization. The seeded refunds are claimed and CAP-TOSS is final, so those posts show the reason instead of an action. Nick must redeploy the hosted app for these controls and the NEAR-only funding state; see [BLOCKED.md](BLOCKED.md). These limits do not block browsing.

## Live on NEAR testnet

Factory: [`juno-awkorp.testnet`](https://testnet.nearblocks.io/address/juno-awkorp.testnet).

Post contracts: `sprout.juno-awkorp.testnet`, `pile-in.juno-awkorp.testnet`, `cap-toss.juno-awkorp.testnet`, `balloons.juno-awkorp.testnet`.

These transaction links are copied from [the deployment record](deployments/testnet-2026-11-09.json):

| Action | Transaction |
| --- | --- |
| Deploy factory | [HvSXP63tQhyZSPujjj3dVN1eZPFqLXRxTGD19qHMpzxx](https://testnet.nearblocks.io/txns/HvSXP63tQhyZSPujjj3dVN1eZPFqLXRxTGD19qHMpzxx) |
| Settle SPROUT auction | [5TvNxqnEZNnH6DHoTrvqSpuWzQKcJ2DtvwFFtuuzXAPa](https://testnet.nearblocks.io/txns/5TvNxqnEZNnH6DHoTrvqSpuWzQKcJ2DtvwFFtuuzXAPa) |
| Graduate PILE-IN | [8Z7qTNe6vizN6dnAhexaP4TyCYE7FnSaZSm3WJ3JJ4LH](https://testnet.nearblocks.io/txns/8Z7qTNe6vizN6dnAhexaP4TyCYE7FnSaZSm3WJ3JJ4LH) |
| Redeem PILE-IN against its floor | [3y1Lcx1Xt1KSLAUMTYHxbcLZ5UGkH1czhU84ENCrFgDG](https://testnet.nearblocks.io/txns/3y1Lcx1Xt1KSLAUMTYHxbcLZ5UGkH1czhU84ENCrFgDG) |
| Finalize CAP-TOSS dare | [5rQm2yRzXGTo1FNo6wtdxrx5XUAkqKakMevjLwvkakxz](https://testnet.nearblocks.io/txns/5rQm2yRzXGTo1FNo6wtdxrx5XUAkqKakMevjLwvkakxz) |

The original Juno Expo app is reused from the Robinhood Chain edition. See [Prior work](#prior-work) and [Hackathon disclosures](#hackathon-disclosures).

## Verify it

```bash
pnpm run setup          # packages, Rust 1.95 + cargo-near, NEAR sandbox binary in .tools/
pnpm test               # recorded 20-test suite, including NEAR sandbox tests; see TESTING.md
```

Run the same app locally against testnet (Node.js and pnpm 10.29.2 required):

```bash
pnpm run setup
EXPO_NO_DOTENV=1 EXPO_PUBLIC_JUNO_FACTORY=juno-awkorp.testnet EXPO_PUBLIC_NEAR_RPC_URL=https://near-testnet.drpc.org pnpm web:export
pnpm web:serve
```

Open `http://127.0.0.1:8091/social` - see the live feed. Use the same `/coin/<account>` and `/profile` routes from **Try it** on that local address. Stop the server with Ctrl-C.

The `setup`, `test`, `web:export` and `web:serve` commands are defined in [package.json](package.json). The export command sets public testnet configuration directly and disables dotenv loading. Email sign-in and the mainnet quote remain unconfigured in this local path.

Screenshots of the earlier route pass at 390 and 1440 px are in [docs/qa](docs/qa). The November 11 flow pass, fixes, 375/1440 screenshots and remaining wallet/demo limits are in [FLOW-QA.md](FLOW-QA.md).

## Deployment and evidence

| Network | What | Evidence | Status |
| --- | --- | --- | --- |
| NEAR testnet | Factory `juno-awkorp.testnet`, 3 players, 4 posts: sealed bids, reveals, settlement, refunds, buys, a sell, graduation, floor redemption, hidden-bid penalty, dare proof/vote/finalise | [deployments/testnet-2026-11-09.json](deployments/testnet-2026-11-09.json), table below | **PASS** (46 txs, 45 succeeded, 1 rejected on purpose: `ERR_NO_BID`) |
| Local NEAR sandbox | Factory, named post account, auction, curve, floor, dare, NEP-141 refund, trade log | `pnpm test:contract` | **PASS** (7 integration + 1 unit) |
| Local NEAR sandbox | NEP-366: player signs a sealed bid, a separate relayer submits it | `pnpm test:meta` | **PASS** |
| NEAR testnet | Web wallet path (Meteor Wallet via Wallet Selector): buy, sell, refused underpaid buy | [deployments/wallet-path-2026-11-10.json](deployments/wallet-path-2026-11-10.json), `pnpm testnet:wallet-path` | **PASS** (3 txs: [buy](https://testnet.nearblocks.io/txns/Ctgzkkpom8Vd8EA8tDPDGvCgAMGSw9fi9E91DqWfz7P8), [sell](https://testnet.nearblocks.io/txns/FJneJpBWm9CTHraJTyCW1QRvuACtZSCXr54Qhhqh7Ccu), [`ERR_PAYMENT`](https://testnet.nearblocks.io/txns/5GMQ5iGkUT2eJBcBWLEk5kN668MPv7tpojondT6rKQMH)); the wallet's own approval screen was not clicked through, see TESTING.md |
| NEAR testnet | NEP-366 relayed bid | attempted in `testnet:seed`; the relayer account lacked the 1 NEAR the delegate action attaches | **BLOCKED:** funds, see BLOCKED.md |
| NEAR testnet | Required namespace `<slug>.juno.testnet` | `pnpm testnet:run` | **BLOCKED:** `NEAR_TESTNET_KEY_FILE` for `juno.testnet` |
| NEAR mainnet funding | Setup required: NEAR_MAINNET_ACCOUNT | Trade sheet | **BLOCKED:** mainnet funding is not configured or implemented; trades use NEAR testnet |

Funding: `juno-awkorp.testnet` was created with `create_account` on the `testnet` registrar (8 NEAR) and topped up by transfer from a funded testnet account file read in code only (`JUNO_FUNDER_FILE`).

### Testnet transactions

Factory: [juno-awkorp.testnet](https://testnet.nearblocks.io/address/juno-awkorp.testnet) · players: [mira.juno-awkorp.testnet](https://testnet.nearblocks.io/address/mira.juno-awkorp.testnet), [kai.juno-awkorp.testnet](https://testnet.nearblocks.io/address/kai.juno-awkorp.testnet), [oto.juno-awkorp.testnet](https://testnet.nearblocks.io/address/oto.juno-awkorp.testnet)

| # | Step | Signer | Receiver | Transaction |
| ---: | --- | --- | --- | --- |
| 1 | registrar_create_account | funder | testnet | [DbZNbHe9…](https://testnet.nearblocks.io/txns/DbZNbHe9hBMaMpkY2UAvqXsWx1T2oYajJYQYYGs4eGb8) |
| 2 | top_up_root_from_engye-5d3dc3dd57 | funder | juno-awkorp.testnet | [4sxQQdMU…](https://testnet.nearblocks.io/txns/4sxQQdMU7spZ3Xeh4MEFzFU8xUcVHKqwroS9v6LG7CjZ) |
| 3 | top_up_root_from_engye-4f18d8544b | funder | juno-awkorp.testnet | [9d4izNnb…](https://testnet.nearblocks.io/txns/9d4izNnbCsZyXPsPt2qYQjDKknrLH2c52e3Jb7HmfLxb) |
| 4 | top_up_root_from_engye-90efb5817e | funder | juno-awkorp.testnet | [C9DQf8pW…](https://testnet.nearblocks.io/txns/C9DQf8pWt2pn4eRwJXY3TaFjr45UEH7DuKV4kxBkLZXu) |
| 5 | create_player_mira | juno-awkorp.testnet | mira | [AgsntQno…](https://testnet.nearblocks.io/txns/AgsntQnoaFuTXdaNrZ3BxBcAQi6L4bPB3v9HDyTedCPU) |
| 6 | create_player_kai | juno-awkorp.testnet | kai | [GaCz1D7r…](https://testnet.nearblocks.io/txns/GaCz1D7riGHoac4HBp83bW4R5Wh3hXaWgUXQHeURr7CT) |
| 7 | create_player_oto | juno-awkorp.testnet | oto | [FaaHTMZJ…](https://testnet.nearblocks.io/txns/FaaHTMZJcPM3PeXys9c64PanUVuQayHEsn542ZgWkWFw) |
| 8 | deploy_factory | juno-awkorp.testnet | juno-awkorp.testnet | [HvSXP63t…](https://testnet.nearblocks.io/txns/HvSXP63tQhyZSPujjj3dVN1eZPFqLXRxTGD19qHMpzxx) |
| 9 | upload_token_code | juno-awkorp.testnet | juno-awkorp.testnet | [sweTXR5m…](https://testnet.nearblocks.io/txns/sweTXR5mr7fGuMYUM2mfmyYATuHA9Bag3R3MiRcX5jk) |
| 10 | create_post_sprout | mira | juno-awkorp.testnet | [GnmxDbdg…](https://testnet.nearblocks.io/txns/GnmxDbdgj4wqqakwbiDjKpQZCzryyJ8NeCGdutSdgrT1) |
| 11 | create_post_pile-in | kai | juno-awkorp.testnet | [BcKhu61P…](https://testnet.nearblocks.io/txns/BcKhu61PLii7PWvwwV4EpSBDaRgSAZ15FS74nSZfN8Mx) |
| 12 | sprout_sealed_bid_kai | kai | sprout | [Gm9ccwjN…](https://testnet.nearblocks.io/txns/Gm9ccwjNFe12Nk9zmGS4vXMj9M5DJc21zSzmyxfhfbih) |
| 13 | sprout_sealed_bid_oto | oto | sprout | [9WsPTaa5…](https://testnet.nearblocks.io/txns/9WsPTaa5inciUT8Jkhtjy32DKie9HCcAhxc1StwTggW1) |
| 14 | pile-in_sealed_bid_mira | mira | pile-in | [B3jeRapt…](https://testnet.nearblocks.io/txns/B3jeRaptKc78kK6xm5ypjYJu2u33eUj5f52oRMEF8GLV) |
| 15 | pile-in_sealed_bid_oto | oto | pile-in | [FNHtQKCH…](https://testnet.nearblocks.io/txns/FNHtQKCHvUwrG4RKUvBvVjXcyK2LNmSaxA2LgwX4qmdk) |
| 16 | sprout_reveal_kai | kai | sprout | [2TYV1PHh…](https://testnet.nearblocks.io/txns/2TYV1PHhkUo6JyuumEqSN7CCspfvq7JF7y6X61GrXYxM) |
| 17 | sprout_reveal_oto | oto | sprout | [C4HwyZ5p…](https://testnet.nearblocks.io/txns/C4HwyZ5pCZExLSPLqCLTj9Rs84KJznhmrd8Tu7aJiwj2) |
| 18 | pile-in_reveal_mira | mira | pile-in | [56xkUVAc…](https://testnet.nearblocks.io/txns/56xkUVAco2Zs9wQ73CBUco4kCHB13gSUsCtyU6wQNxpm) |
| 19 | pile-in_reveal_oto | oto | pile-in | [DJRnNC46…](https://testnet.nearblocks.io/txns/DJRnNC46bRjVfLza7T484K2Zn8YAWARCquH5FmMFvAoY) |
| 20 | sprout_settle | mira | sprout | [5TvNxqnE…](https://testnet.nearblocks.io/txns/5TvNxqnEZNnH6DHoTrvqSpuWzQKcJ2DtvwFFtuuzXAPa) |
| 21 | sprout_refund_kai | kai | sprout | [AMS2qEGH…](https://testnet.nearblocks.io/txns/AMS2qEGHLhyFY7yEQguyetJrjkDnpmbW3UMd24hkat1N) |
| 22 | sprout_refund_oto | oto | sprout | [7ddxkpdb…](https://testnet.nearblocks.io/txns/7ddxkpdbXkaFmgdP8g3ujCLRPLix1REeSpSzznMP78Fv) |
| 23 | sprout_buy_25 | oto | sprout | [Gj48SeoZ…](https://testnet.nearblocks.io/txns/Gj48SeoZXw8UBiox193mifE9J8kRnP9xR6KnrmBYrosZ) |
| 24 | sprout_buy_10 | mira | sprout | [2AgeMa4Q…](https://testnet.nearblocks.io/txns/2AgeMa4QCjMAUv7Vszn2eMPSd1B5xER5NvRgdgp9AWky) |
| 25 | sprout_sell_5 | oto | sprout | [AkrBvHGZ…](https://testnet.nearblocks.io/txns/AkrBvHGZkxDHGU2iVyCTMqpppNAE9Qhym87iQEgVnpFj) |
| 26 | pile-in_settle | kai | pile-in | [EK9gCafY…](https://testnet.nearblocks.io/txns/EK9gCafYjaBgYjJ2YhZCHPjiXZVxnRrRhEFitJ5bmdRr) |
| 27 | pile-in_refund_mira | mira | pile-in | [8pt6i3Hs…](https://testnet.nearblocks.io/txns/8pt6i3HsMmtaWwQ4tJNcMiaVppHi3aemG6qCrDeatYRn) |
| 28 | pile-in_refund_oto | oto | pile-in | [3Wungznf…](https://testnet.nearblocks.io/txns/3WungznfVE34GULbSPGXVuHVmySrokscbbmDq2WQmNUQ) |
| 29 | pile_in_buy_800_graduate | kai | pile-in | [8Z7qTNe6…](https://testnet.nearblocks.io/txns/8Z7qTNe6vizN6dnAhexaP4TyCYE7FnSaZSm3WJ3JJ4LH) |
| 30 | pile_in_redeem_20_floor | mira | pile-in | [3y1Lcx1X…](https://testnet.nearblocks.io/txns/3y1Lcx1Xt1KSLAUMTYHxbcLZ5UGkH1czhU84ENCrFgDG) |
| 31 | top_up_root_from_engye-90efb5817e | funder | juno-awkorp.testnet | [55rAQYQM…](https://testnet.nearblocks.io/txns/55rAQYQMJYreeQ5mXxWzkpnHrhefTZrnJqwz7H9HuvLF) |
| 32 | create_post_cap-toss | oto | juno-awkorp.testnet | [HqzVz5KT…](https://testnet.nearblocks.io/txns/HqzVz5KTBEvNHUcaD8G54hiwzX7GLBU5dfAb9rsMNnTv) |
| 33 | create_post_balloons | mira | juno-awkorp.testnet | [Fk7jYkJ7…](https://testnet.nearblocks.io/txns/Fk7jYkJ7AuCrsEcvmj5w7zdY5seFNFWe3wHQWw7wNHJB) |
| 34 | cap-toss_sealed_bid_mira | mira | cap-toss | [C5cZQdsM…](https://testnet.nearblocks.io/txns/C5cZQdsM91R7cSrfBeLmHvPLijMuGvih2g3GRNX1u5oc) |
| 35 | cap-toss_sealed_bid_kai | kai | cap-toss | [JCYYivQC…](https://testnet.nearblocks.io/txns/JCYYivQCdsHcGCYj8iYKZJfJWymVuPKoUWx5QWcTJbGZ) |
| 36 | cap-toss_settle | oto | cap-toss | [DxqPU5gp…](https://testnet.nearblocks.io/txns/DxqPU5gpm1CnD2TadwsJg9US6oLPgCbUQGqcgfAspPto) |
| 37 | cap-toss_refund_mira | mira | cap-toss | [AoaJLDNg…](https://testnet.nearblocks.io/txns/AoaJLDNgcJKZ2RvCJoCgsYqTAYzySSiNSbNHw99Hivwu) |
| 38 | cap-toss_refund_kai | kai | cap-toss | [GndJvZG6…](https://testnet.nearblocks.io/txns/GndJvZG6jDckgMEsHr2sNaC8cWGya8DaXkvnmMd8PxNi) |
| 39 | cap_toss_buy_40 | kai | cap-toss | [6wgZR5Di…](https://testnet.nearblocks.io/txns/6wgZR5DiVCfBDkoueY6W3cBaaGsYbGSi9wm3BMFHpr7D) |
| 40 | cap_toss_submit_proof | oto | cap-toss | [6sWSsRDx…](https://testnet.nearblocks.io/txns/6sWSsRDxfeq5NxopqVwcP9u87RiCGn6hJmJN5CWAjJvE) |
| 41 | cap_toss_vote_yes | kai | cap-toss | [F6CoijdD…](https://testnet.nearblocks.io/txns/F6CoijdDdFc269SEtNxJHwBgfPhruRxNZqnazeUdMwPH) |
| 42 | balloons_settle | mira | balloons | [ESi2b1oL…](https://testnet.nearblocks.io/txns/ESi2b1oL3X3PXGggBYrkSeBCLi164UY5CtybN1Mxo6KD) |
| 43 | balloons_refund_oto_rejected_ERR_NO_BID | oto | balloons | [AWWXogaz…](https://testnet.nearblocks.io/txns/AWWXogazAWUYaLxKVVCLYfekpHkng9kmzqQ8Q89RPedK) |
| 44 | balloons_buy_60 | mira | balloons | [G97kLxSJ…](https://testnet.nearblocks.io/txns/G97kLxSJ6XfcRBRbbUxo7pHUwTfFgb1gKUcQGVHJWWMR) |
| 45 | balloons_buy_30 | kai | balloons | [H6LtScqR…](https://testnet.nearblocks.io/txns/H6LtScqRxoRRsko9PWHEiHqF6poi65Dxe2CWcWGqQv4H) |
| 46 | cap_toss_finalize_dare | oto | cap-toss | [5rQm2yRz…](https://testnet.nearblocks.io/txns/5rQm2yRzXGTo1FNo6wtdxrx5XUAkqKakMevjLwvkakxz) |

## How a market works

1. `create_post` creates `<slug>.<factory>` and deploys the same locked token WASM. The creator supplies a caption, media URL, optional dare, and optional bond.
2. For 60 seconds each bidder escrows **exactly 1 NEAR** and posts `sha256("juno:v1:<account>:<amount>:<max_price>:<salt>")`. Identical public deposits prevent the escrow amount from revealing the bid. The salt stays in the bidder's browser until reveal.
3. The next 60 seconds allow reveal. `settle` orders valid bids by maximum price, allocates 200 whole tokens, and charges every winner the final allocated bid's maximum price. Unused escrow is claimable. A hidden bid forfeits 1% of its escrow to the creator. A t=0 bidder and later bidder pay the same clearing price.
4. The remaining 800 tokens sell on the **content preset** of Juno's 16-segment weighted curve, ported from the earlier Robinhood Chain Rust curve. Prices and rounding use integers in whole token and yoctoNEAR units. Buy gross is at least the current pro-rata floor; buy cost is `gross + floor contribution (20% of gross) + fee (1% of gross)`. The full gross backs curve sells. The fee splits equally between creator earnings and graduation escrow.
5. Half the opening auction raise enters the **NEAR floor vault**; the other half enters graduation escrow. `floor = vault / circulating supply`. Any holder burns tokens with `redeem` and receives at most 99% of their pro-rata vault share. The retained 1% raises the floor for remaining holders when the payout is nonzero. A curve sell below the floor uses the vault and still charges the 1% fee. No BTC or USDC is held in the vault.
6. At 800 curve units sold, `graduated` becomes true and buys close. Graduation funds remain locked on the token account. Rhea testnet pool seeding is not claimed; the escrow is a documented fallback with no withdrawal method.
7. For a dare, the creator posts proof within five minutes; token holders vote once each. After five minutes, a failed or absent proof distributes the bond in proportion to balances at finalization. A successful proof returns the bond to the creator.

The token implements the NEP-141 core methods `ft_total_supply`, `ft_balance_of`, `ft_transfer`, `ft_transfer_call` with failed receiver refund, and NEP-148 `ft_metadata`. It has 0 decimals and 1,000 maximum initial sale units. Each post auction is capped at 64 bidders. The factory locks its uploaded token code after one upload.

The contract also keeps a capped 120-entry fill log (`trades()`, one entry per auction allocation, buy, sell and redemption, each with a NEP-297 style `EVENT_JSON` log) and a `holders()` view, so the app draws charts and holder lists from the chain without an indexer.

## NEAR features used

- **Named sub-accounts:** each post is its own token and vault account under the factory (`sprout.juno-awkorp.testnet`). The intended production namespace is `<slug>.juno.testnet`, which needs the key for the existing `juno.testnet`.
- **NEP-141 / NEP-148:** transferable whole-unit post coins with metadata and transfer callbacks.
- **NEP-366 meta transactions (email accounts):** the app signs calls as delegate actions with a key generated on the device; the relayer checks it against an allowlist (receiver, method, gas, deposit caps) and submits it. Finding from the testnet run: the **relayer fronts both gas and any attached deposit** of the delegated action (a sealed bid attaches 1 NEAR, a launch 3 NEAR), so the policy's deposit caps bound the relayer's exposure.
- **NEAR Wallet Selector (web):** `@near-wallet-selector/core` 10.1.4 with the Meteor Wallet module. Sign-in adds a function-call key for the factory; each Juno call is one `FunctionCall` action with the step's deposit and gas, sent by the wallet from the person's own account, then followed to final over RPC. MyNearWallet was tried first: on 2026-11-10 its testnet pop-up answered "MyNearWallet can't connect to apps anymore" and points users to Meteor.
- **NEAR mainnet funding (unconfigured):** the buy sheet shows **Setup required: NEAR_MAINNET_ACCOUNT**. Trades use NEAR testnet; the app requests no mainnet quote and sends no mainnet swap.

## The app (`packages/app`)

Expo Router app; web via `expo export --platform web`, served by `pnpm web:serve` on port 8091 (`pnpm dev` runs the Expo dev server on the same port).

- `lib/api.ts` reads the factory's `posts`, then each post's `market`, `trades` and `holders` through `@juno/sdk`; buy quotes come from the contract's `quote_buy`, sell and redemption quotes from the SDK's mirror of the contract maths.
- `lib/wallet.tsx` keeps a device key (browser storage on web, secure store on a phone) and sends NEP-366 delegate actions to the relayer. `components/SignInSheet.tsx` keeps Juno's sheet; the relayer sends the email code.
- On web the same sheet offers **Connect NEAR wallet** (`lib/browser-wallet.web.ts`, loaded on first use): then `lib/wallet.tsx` sends each call through the wallet and `lib/tx-status.ts` follows it to final. Native builds resolve `lib/browser-wallet.ts`, a stub, so iOS and Android keep the relayer path and never bundle the selector.
- `components/Floor.tsx` holds the NEAR-only pieces drawn in the app's existing styles: the floor panel, floor chip, sealed-bid auction card with countdown, graduation card and dare card.
- `components/art3d.tsx` serves Juno's 3D object kit (`public/art/3d/`, lilac and lime enamel, kit in [docs/ART-3D.md](docs/ART-3D.md)) on the desktop how-it-works rail, empty and error states, the sign-in sheet, the trade success and the dare card. 3D art generated with ChatGPT.
- Removed from the Robinhood build: the WIF burn counter, USDG stock trackers, Uniswap graduation, Privy, and the server-backed comments, watchlists and savings plans (there is no Juno server on NEAR). Likes and follows are kept on the device only and never shown as anyone else's.

Configuration (`packages/app/.env.local`, gitignored; names in `.env.example`): `EXPO_PUBLIC_JUNO_FACTORY`, `EXPO_PUBLIC_NEAR_RPC_URL`, `EXPO_PUBLIC_RELAYER_URL`, `EXPO_PUBLIC_NEAR_MAINNET_ACCOUNT`, `EXPO_PUBLIC_APP_URL`. A missing value shows **Setup required: NAME** on screen.

## Email and relayer setup

Secrets go only in the gitignored root `.env` or a key file under `.near-credentials/`. Configure `RELAYER_ACCOUNT`, `RELAYER_KEY_FILE`, `JUNO_FACTORY_ACCOUNT`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`, `AUTH_SECRET` (and `WEB_ORIGIN`, default `http://127.0.0.1:8091`), then run `pnpm relayer` and set `EXPO_PUBLIC_RELAYER_URL=http://127.0.0.1:8787` for the app.

The relayer emails a six-digit code (Resend), creates and funds a named testnet player sub-account with the device's public key, and keeps a recovery key in gitignored `.near-credentials/email-users.json`, so **this testnet email mode is custodial**. It binds to localhost and enforces an origin, a per-email request limit and the signed-action allowlist. A production deployment needs shared rate limits and a security review.

## Prior work

Juno predates this hackathon. Earlier editions by the same team, checked against GitHub under `nickthelegend` on November 12, 2026:

- [juno](https://github.com/nickthelegend/juno) — the original Solana STOCKLANA app, with Meteora post curves and stock/pre-IPO trackers.
- [juno-arbitrum](https://github.com/nickthelegend/juno-arbitrum) — the Arbitrum edition, with Stylus curve maths, Chainlink stock trackers and Uniswap v3 graduation.
- [juno-monad](https://github.com/nickthelegend/juno-monad) — the Monad Metropolis edition, with creator-coin curves and Uniswap v2/Kuru graduation.
- [juno-clockin](https://github.com/nickthelegend/juno-clockin) — the Solana Mobile CLOCK IN edition, with Seeker wallet integration, daily clock-in and devnet SKR rewards/boosts.
- [juno-arc](https://github.com/nickthelegend/juno-arc) — the Arc edition, with USDC post curves, gasless buys, CCIP tokens and CCTP creator payouts.
- [juno-wif](https://github.com/nickthelegend/juno-wif) — the Robinhood Chain/World is Flat edition, with WIF post markets and fee burning; the direct source of this repo's imported app.

The public [GitHub repository listing](https://api.github.com/users/nickthelegend/repos?per_page=100&sort=full_name) was checked across all pages by name and description. It exposes the first five editions above. The `juno-wif` URL currently returns 404 to an unauthenticated request; its reuse is documented by the local sibling history, import commit and license notices below. All code written before November 1 is baseline, and reused work from other editions is not claimed as new NEAR work.

The sibling project `juno-wif` is the earlier Juno on Robinhood Chain. Its git history has the Expo app, EVM contracts, server and Rust curve before November 1, 2026; its last pre-November commit is `2ebfd26` (October 30). That product and curve are baseline work. This repository starts at `da0ff11` on November 9, so its first commit date does not make the reused app new work.

`packages/app` was imported from `juno-wif/app` in commit `00251dd` on November 9. Its screens, components, theme, logo, fonts and art are reused. The source project also added art on November 9 (`b6231bf`, `4badda1`); that reused art is not claimed as new NEAR work. The curve weights are ported from the earlier Rust curve. Both [LICENSE](LICENSE) and [packages/app/LICENSE](packages/app/LICENSE) retain the reuse and Expo MIT notices. There is no separate NOTICE file in this repo. The Robinhood repository is not a remote of this one.

Juno also has an [Avalanche edition](https://juno-avax.vercel.app), verified live on November 12, 2026; this submission covers only the NEAR-specific code built during the November 1–14, 2026 window.

NEAR work built in the November 1-14 window, recorded here on November 9-12: the factory and post contracts (sealed auction, floor vault, dare bond and trade log), SDK, email relayer with NEP-366 policy, read-only MCP server, NEAR data and signing integration, browser wallet support, web landing page and testnet deployment. The window also includes the flow fixes, testnet-only QA signer and real browser buy/sell evidence, plus the new [3D object kit](docs/ART-3D.md) generated with ChatGPT. Only the NEAR-specific changes are offered for judging; the earlier product, imported app and reused art remain disclosed baseline. Live email sign-in, testnet relayed deposits, cross-chain swaps and Rhea pool seeding are not claimed as complete; see [BLOCKED.md](BLOCKED.md).

To inspect the NEAR changes separately from the imported app and initial scaffold:

```bash
git show --stat 00251dd
git diff 00251dd..6e37a99 -- packages/app
git diff da0ff11..6e37a99 -- packages/contract packages/sdk packages/relayer packages/mcp scripts
```

These ranges end at the November 12 3D art integration. They include the NEAR app changes, landing page and QA signer, while excluding the app import itself from the app diff.

## Hackathon disclosures

Built for NEAR HACKATHON 2026 (Nov 1-14).

Prior work: the original Juno app and earlier curve are baseline. The imported art is reused too. The dates, source commits and NEAR work built in the window are listed in [Prior work](#prior-work).

AI-assisted code: Built with AI coding agents (Claude Code, Codex) under human direction; all code reviewed and tested by the team.

### Other projects by the same team in this hackathon

Lead: <TBD by Nick>

### License

MIT. Copyright (c) 2026 Nivesh Gajengi. See [LICENSE](LICENSE).
