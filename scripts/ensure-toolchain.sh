#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v rustup >/dev/null || { echo 'Setup required: rustup' >&2; exit 1; }
command -v cargo >/dev/null || { echo 'Setup required: cargo' >&2; exit 1; }
if ! rustup toolchain list | grep -q '^1.95.0'; then rustup toolchain install 1.95.0 --profile minimal; fi
if ! rustup target list --toolchain 1.95.0 --installed | grep -q '^wasm32-unknown-unknown$'; then rustup target add wasm32-unknown-unknown --toolchain 1.95.0; fi
if command -v cargo-near >/dev/null && cargo near --version | grep -q '0.22.0'; then exit 0; fi
if [ -x .tools/cargo-near/bin/cargo-near ]; then exit 0; fi
mkdir -p .tools/cargo-home .tools/cargo-near
CARGO_HOME="$PWD/.tools/cargo-home" cargo install cargo-near --version 0.22.0 --locked --root "$PWD/.tools/cargo-near"
