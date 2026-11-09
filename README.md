# Juno on NEAR

Every post is a coin. The first minute is a sealed auction with one clearing price; after a minute for reveal, tokens trade on a 16-segment bonding curve. A NEAR vault backs a redeemable floor for every token. The problem is launch sniping and coins with no exit value. This edition makes launch allocation independent of transaction order and keeps a separate redemption reserve.

**Status on 2026-11-09:** The contract runs in a real local NEAR sandbox. A public testnet run is blocked by the testnet account helper's HTTP 429 response (two-hour retry window) and the missing key for `juno.testnet`; no public testnet transaction is claimed. See [BLOCKED.md](BLOCKED.md) and [REPORT.md](REPORT.md).

## Verify it

```bash
pnpm run setup
pnpm test
```

`pnpm run setup` installs packages and downloads the NEAR sandbox binary into `.tools/` on this external-drive project. `pnpm test` builds the WASM and web app, then runs the Rust math, seven signed market sandbox transaction tests, a signed NEP-366 sandbox relay, SDK math, relayer policy tests, and an MCP stdio integration test. No test uses a chain stub. See [TESTING.md](TESTING.md) for real counts and attack coverage.

To see the UI, run `pnpm dev` and open `http://127.0.0.1:5173`. With no factory configured it shows **Setup required: VITE_FACTORY_ACCOUNT** and a clear empty feed. After a testnet deployment, put `VITE_FACTORY_ACCOUNT=<factory account>` in `packages/web/.env`; the feed then reads `posts` and each `market` from `https://test.rpc.fastnear.com`. Open a card to see the live bid count, reveal countdown, curve, floor, dare, and creator earnings. Wallet actions use MyNearWallet testnet. Email sign-in requires the configured relayer described below.

## Deployment and evidence

| Network | Contract / action | Evidence | Status |
| --- | --- | --- | --- |
| Local NEAR sandbox | Factory creates a named token sub-account | `pnpm test:contract` replays signed transactions and rejection cases | **PASS** (7 integration tests, 0 skipped) |
| NEAR testnet | `<slug>.juno.testnet` factory and 3-player auction, trades, graduation | Explorer links will be added from `deployments/testnet-YYYY-MM-DD.json` after a real run | **BLOCKED:** `NEAR_TESTNET_KEY_FILE` for `juno.testnet` |
| Local NEAR sandbox | NEP-366 signed bid from a player key, submitted by a separate relayer | `pnpm test:meta` prints real sandbox tx hashes and checks finalized bid count | **PASS** |
| NEAR testnet demo namespace | Same sequence under a temporary named account | `pnpm testnet:run --demo-namespace` | **BLOCKED:** official helper returned HTTP 429, retry after two hours |
| NEAR mainnet 1Click | Dry quote only | [1Click quote API](https://docs.near-intents.org/integration/distribution-channels/1click-api/quickstart/making-a-request) | **BLOCKED:** `NEAR_MAINNET_ACCOUNT` / `VITE_NEAR_MAINNET_ACCOUNT`; no swap sent |

There is no Git remote. Nick will publish this repository before the [2026-11-14 23:59 UTC deadline](https://nearhackathon.com/HACKATHON.md).

## How a market works

1. `create_post` creates `<slug>.<factory>` and deploys the same locked token WASM. The creator supplies a caption, media URL, optional dare, and optional bond.
2. For 60 seconds each bidder escrows **exactly 1 NEAR** and posts `sha256("juno:v1:<account>:<amount>:<max_price>:<salt>")`. Identical public deposits prevent the escrow amount from revealing the bid. The salt stays in the bidder's browser until reveal.
3. The next 60 seconds allow reveal. `settle` orders valid bids by maximum price, allocates 200 whole tokens, and charges every winner the final allocated bid's maximum price. Unused escrow is claimable. A hidden bid forfeits 1% of its escrow to the creator. A t=0 bidder and later bidder pay the same clearing price.
4. The remaining 800 tokens sell on the **content preset** of Juno's 16-segment weighted curve, ported from the earlier Robinhood Chain Rust curve. Prices and rounding use integers in whole token and yoctoNEAR units. Buy gross is at least the current pro-rata floor; buy cost is `gross + floor contribution (20% of gross) + fee (1% of gross)`. The full gross backs curve sells. The fee splits equally between creator earnings and graduation escrow.
5. Half the opening auction raise enters the **NEAR floor vault**; the other half enters graduation escrow. `floor = vault / circulating supply`. Any holder burns tokens with `redeem` and receives at most 99% of their pro-rata vault share. The retained 1% raises the floor for remaining holders when the payout is nonzero. A curve sell below the floor uses the vault and still charges the 1% fee. No BTC or USDC is held in the vault.
6. At 800 curve units sold, `graduated` becomes true and buys close. Graduation funds remain locked on the token account. Rhea testnet pool seeding is not claimed; the escrow is a documented fallback with no withdrawal method.
7. For a dare, the creator posts proof within five minutes; token holders vote once each. After five minutes, a failed or absent proof distributes the bond in proportion to balances at finalization. A successful proof returns the bond to the creator.

The token implements the NEP-141 core methods `ft_total_supply`, `ft_balance_of`, `ft_transfer`, `ft_transfer_call` with failed receiver refund, and NEP-148 `ft_metadata`. It has 0 decimals and 1,000 maximum initial sale units. `create_post` is capped at 64 auction bidders. The factory locks its uploaded token code after one upload.

## NEAR features used

- **Named sub-accounts:** each post is its own token and vault account. The intended production namespace is `<slug>.juno.testnet`; that exact namespace requires Nick's key for the already-existing `juno.testnet` account.
- **NEP-141:** transferable whole-unit post coins with token metadata and transfer callbacks.
- **NEP-366 meta transactions:** the relayer accepts signed delegate actions only from registered email-player accounts to the factory or its post sub-accounts, with method, deposit, and gas limits. It pays gas; the player account pays deposits. This path is implemented but awaits email and relayer credentials for a live run.
- **NEAR Intents 1Click:** the web requests mainnet `dry: true` quotes from live 1Click. There is no Intents testnet. It never sends a deposit or claims a swap. `ONECLICK_JWT` is optional; unauthenticated quotes use the event's stated 0.2% fee schedule.

## Email and relayer setup

Put secrets only in the gitignored root `.env` or a key file under `.near-credentials/`. Configure `RELAYER_ACCOUNT`, `RELAYER_KEY_FILE`, `JUNO_FACTORY_ACCOUNT`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`, and `AUTH_SECRET`, then run `pnpm relayer`. Set `VITE_RELAYER_URL=http://127.0.0.1:8787` and `VITE_FACTORY_ACCOUNT` in `packages/web/.env`, then run `pnpm dev`.

The relayer emails a six-digit code using Resend, creates and funds a named testnet player sub-account, and returns the creation transaction hash. The browser creates the player signing key locally, holds it only in memory for that session, and signs NEP-366 delegated actions. The relayer retains a recovery key for each player in gitignored `.near-credentials/email-users.json`; **this testnet email mode is custodial**. The server binds to localhost by default and enforces an origin, per-email request limit, and signed-action allowlist. A production deployment needs persistent shared rate limits and a security review.

## Prior work

Juno already exists on Robinhood Chain in the sibling local `juno-wif` project. Its feed concept, brand artwork, and content-curve weights are prior work. This NEAR edition, including the named account factory, sealed auction, vault floor, dare bond, relayer, SDK, and web port, was built during the hackathon window. The Robinhood repository is not a remote of this one. Source artwork copied from `juno-wif/app/public/art`; the original React Native feed cannot run in Vite, so its post-first layout was rebuilt as clean React components.

## Team and other projects

Lead: <TBD by Nick>

Other project disclosed under Q-015: <TBD by Nick>. One person may submit at most two independent projects. Nick must fill the lead and other-project disclosure before publishing/submitting.

MIT License · Copyright (c) 2026 Nivesh Gajengi.
