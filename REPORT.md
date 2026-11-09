# Juno on NEAR — build report (2026-11-09)

## What works live

- The factory creates named post-token accounts on a real local NEAR sandbox. Signed transactions exercise the sealed auction, uniform clearing and refunds, weighted bonding curve, fee split, redeemable NEAR floor, graduation escrow, dare voting and bond payout, and NEP-141 transfer callback refund.
- A player-signed NEP-366 delegated bid was submitted by a separate relayer on the local chain; finalized RPC showed one sealed bid. `pnpm test:meta` prints its real local transaction hashes.
- The SDK reads the live [1Click `/v0/tokens` endpoint](https://1click.chaindefuser.com/v0/tokens): on 2026-11-09 it returned **216** assets including `nep141:wrap.near`. No quote or swap was claimed.
- The Vite/React web app and read-only MCP server build. The web shows explicit setup and empty states until a testnet factory and relayer are configured.

## Test counts

`pnpm test` **passed: 19 tests, 0 failed, 0 skipped** — 1 Rust curve math, 7 signed market sandbox, 1 signed NEP-366 sandbox flow, 6 TypeScript SDK, 3 relayer policy tests, and 1 MCP stdio integration test. The production web build and TypeScript checks passed. Browser visual inspection at 375px was unavailable because the browser-access host did not start; responsive CSS is present but that visual gate is unverified.

## BLOCKED

- **Public testnet transaction evidence:** the official account helper returned **HTTP 429, “retry in 2 hours”** before account creation. No testnet tx hash or explorer link exists yet. Retry `pnpm testnet:run --demo-namespace` when the limit clears; it creates one funded account and three player sub-accounts, then records real hashes in `deployments/testnet-YYYY-MM-DD.json`.
- **Exact `<slug>.juno.testnet` names:** Nick must provide the authorized `juno.testnet` key via `NEAR_TESTNET_ACCOUNT=juno.testnet` and `NEAR_TESTNET_KEY_FILE` in gitignored `.env`. The existing account is never overwritten by the runner.
- **Three email players on testnet:** `RELAYER_ACCOUNT`, `RELAYER_KEY_FILE`, `EMAIL_PROVIDER_API_KEY`, `EMAIL_FROM`, `AUTH_SECRET`, and `JUNO_FACTORY_ACCOUNT` are required. Email delivery and public testnet delegated transactions are unverified. The browser-generated signing key stays in memory; the relayer keeps a custodial recovery key in a gitignored file.
- **1Click buying and BTC floor asset:** `NEAR_MAINNET_ACCOUNT` / `VITE_NEAR_MAINNET_ACCOUNT` are absent. The UI supports only `dry: true` quotes and has sent no swap. The floor vault holds NEAR only, not BTC or USDC.
- **Rhea pool:** graduation liquidity is locked in the token contract; pool creation on Rhea testnet has not run. The fallback escrow is visible on-chain and has no withdrawal method.
- **Publication and submission:** this repo has no remote and remains local. Nick supplies the human fields, publishes the repository and demo post, and confirms the exact submission payload. The [deadline](https://nearhackathon.com/HACKATHON.md) is 2026-11-14 23:59 UTC.

## Exact demo commands

```bash
pnpm run setup
pnpm test
pnpm dev
```

Open `http://127.0.0.1:5173` to see the feed and setup states. For the signed relayer demonstration alone, run `pnpm test:meta`. For a live testnet run after the faucet limit clears, run `pnpm build:contract && pnpm testnet:run --demo-namespace`; for the required namespace, configure the `juno.testnet` credentials in `.env` and run `pnpm build:contract && pnpm testnet:run`. To enable email sign-in after credentials are configured, run `pnpm relayer` in another terminal and set `VITE_FACTORY_ACCOUNT` and `VITE_RELAYER_URL` in `packages/web/.env`. Stop `pnpm dev` and `pnpm relayer` after the demo.
