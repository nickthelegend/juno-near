#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
BIN="$PWD/.tools/near-sandbox-2.14.0-rc.4/near-sandbox"
if [ -x "$BIN" ]; then exit 0; fi
case "$(uname -s)-$(uname -m)" in
  Darwin-arm64) PLATFORM=Darwin-arm64 ;;
  Linux-x86_64) PLATFORM=Linux-x86_64 ;;
  Linux-aarch64) PLATFORM=Linux-aarch64 ;;
  *) echo "Unsupported sandbox platform; set NEAR_SANDBOX_BIN" >&2; exit 1 ;;
esac
mkdir -p "$(dirname "$BIN")"
curl -fsSL "https://s3-us-west-1.amazonaws.com/build.nearprotocol.com/nearcore/$PLATFORM/2.14.0-rc.4/near-sandbox.tar.gz" | tar -xz -C "$(dirname "$BIN")" --strip-components=1
[ -x "$BIN" ]
