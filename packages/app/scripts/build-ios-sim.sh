#!/bin/zsh
# Juno for the iOS Simulator (not Expo Go): Release build with its own icon and embedded JS bundle.
#   packages/app/scripts/build-ios-sim.sh          -> production build (relayer email sign-in only)
#   JUNO_QA=1 packages/app/scripts/build-ios-sim.sh -> film build with the test wallet (lib/qa-signer.native.ts),
#                                                    which signs through scripts/qa-native-signer.ts on 127.0.0.1
# Arm64 simulator only, ad-hoc signed ("-") so expo-secure-store's keychain works. Build products stay on the SSD
# (ios/build); CocoaPods home is CP_HOME_DIR (defaults to the SSD). One Xcode build at a time on this Mac: it takes
# grokbot/orchestration/.xcode-lock and frees it after.
set -euo pipefail
export LANG=en_US.UTF-8
APP=${0:A:h:h}
LOCK="${APP:h:h:h:h}/orchestration/.xcode-lock"
export CP_HOME_DIR=${CP_HOME_DIR:-"/Volumes/Extreme SSD/cocoapods-home"}
export EXPO_NO_DOTENV=1
export EXPO_PUBLIC_JUNO_FACTORY=${EXPO_PUBLIC_JUNO_FACTORY:-juno-awkorp.testnet}
export EXPO_PUBLIC_NEAR_RPC_URL=${EXPO_PUBLIC_NEAR_RPC_URL:-https://test.rpc.fastnear.com}
export EXPO_PUBLIC_APP_URL=${EXPO_PUBLIC_APP_URL:-https://juno-near.vercel.app}
if [[ "${JUNO_QA:-}" == 1 ]]; then
  export EXPO_PUBLIC_QA_SIGNER=1 EXPO_PUBLIC_QA_BUDGET_NEAR=${EXPO_PUBLIC_QA_BUDGET_NEAR:-6} EXPO_PUBLIC_RELAYER_URL=
else
  export EXPO_PUBLIC_QA_SIGNER=0
fi

if [[ -d "$LOCK" && "$(cat "$LOCK/owner" 2>/dev/null)" == juno-near* ]]; then :; else
  until mkdir "$LOCK" 2>/dev/null; do echo "waiting for the Xcode lock ($(cat "$LOCK/owner" 2>/dev/null))"; sleep 30; done
  echo "juno-near $(date -u +%FT%TZ)" > "$LOCK/owner"
  trap 'rm -rf "$LOCK"' EXIT
fi

cd "$APP"
[[ -d ios ]] || npx expo prebuild --platform ios --no-install
[[ -d ios/Pods ]] || (cd ios && pod install)
(cd ios && nice -n 10 xcodebuild -workspace Juno.xcworkspace -scheme Juno -configuration Release -sdk iphonesimulator \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath build ARCHS=arm64 ONLY_ACTIVE_ARCH=YES \
  CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= -jobs 4 | grep -E "error:|BUILD (SUCCEEDED|FAILED)" | head -40)

OUT="$APP/ios/build/Build/Products/Release-iphonesimulator/Juno.app"
[[ -f "$OUT/main.jsbundle" ]] || { echo "Juno.app has no embedded JS bundle"; exit 1; }
echo "Built $OUT (QA=${EXPO_PUBLIC_QA_SIGNER})"
echo "Install: xcrun simctl install <device> \"$OUT\" && xcrun simctl launch <device> app.launch.junonear"
