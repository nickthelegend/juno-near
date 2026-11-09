# Testing evidence

CI-equivalent command: `pnpm test` after `pnpm run setup`. The contract tests use a real local nearcore 2.14 sandbox through near-workspaces, signed transactions, and the compiled WASM. No RPC or chain responses are substituted.

| Suite | Tests passed | Failed | Skipped | What it checks |
| --- | ---: | ---: | ---: | --- |
| Rust curve unit | 1 | 0 | 0 | 16-segment table, monotonic prices, round-trip rounding |
| NEAR sandbox integration | 7 | 0 | 0 | Factory, named token, sealed auction, uniform clearing/refunds, duplicate/altered/late reveal rejection, sniper parity, creator self-buy, hidden-bid penalty, fee split, floor math, repeated cycle resistance, floor-clamped sells, graduation lock, dare bond, failed NEP-141 receiver refund |
| NEP-366 local sandbox | 1 | 0 | 0 | Player signs a delegated sealed bid, separate relayer submits it, finalized RPC confirms bid count |
| TypeScript SDK | 6 | 0 | 0 | Matching weighted-curve arithmetic, buy fee, floor clamp, commitment binding |
| Relayer policy | 3 | 0 | 0 | Signed delegate receiver/method/gas/deposit limits |
| MCP stdio integration | 1 | 0 | 0 | Tool discovery and explicit setup state over real stdio JSON-RPC |
| **Total** | **19** | **0** | **0** | |

Commands run on 2026-11-09:

```bash
cd packages/contract
cargo near build non-reproducible-wasm --no-abi
cargo test --lib
NEAR_SANDBOX_BIN="$PWD/../../.tools/near-sandbox-2.14.0-rc.4/near-sandbox" cargo test --test sandbox -- --test-threads=1
cd ../..
pnpm -r --workspace-concurrency=1 build
pnpm test:meta
pnpm --filter @juno/sdk test
pnpm --filter @juno/relayer test
pnpm --filter @juno/mcp test
```

The testnet flow is a separate deployment/evidence run, not a skipped test. `pnpm testnet:run --demo-namespace` currently stops at account creation because `https://helper.nearprotocol.com/account` returned HTTP 429 (two-hour retry). The required namespace also needs `NEAR_TESTNET_KEY_FILE` for `juno.testnet`. No testnet transaction hash is present until an actual run succeeds.

The web was TypeScript-checked and built with Vite. Automated visual inspection at 375px could not run because the browser-access host was unavailable; the CSS includes a dedicated mobile layout and no fixed-width content wider than the viewport. This remains a verification limitation, not a passed visual test.
