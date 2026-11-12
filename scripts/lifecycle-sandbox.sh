#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export SANDBOX_STATE_DIR="${SANDBOX_STATE_DIR:-$PWD/.demo/r3-lifecycle}"
export SANDBOX_RPC_PORT="${SANDBOX_RPC_PORT:-5385}"
if lsof -t -nP -iTCP:"$SANDBOX_RPC_PORT" -sTCP:LISTEN >/dev/null; then echo 'Sandbox QA port is occupied; choose SANDBOX_RPC_PORT in 5300-5998.' >&2; exit 1; fi
scripts/sandbox.sh start
trap 'scripts/sandbox.sh stop' EXIT
pnpm exec tsx scripts/lifecycle-sandbox.ts
