/**
 * Globals Hermes does not have, installed before anything else on iOS and Android.
 *
 * - `crypto.getRandomValues`: the NEAR key pair is drawn from it.
 *   `react-native-get-random-values` must come first, because a module that
 *   reads `crypto` at import time would otherwise capture the unpatched object.
 * - `TextEncoder`/`TextDecoder`: borsh encodes text before Hermes has them.
 * - `Buffer`: near-api-js calls the global `Buffer` while it signs.
 */

import "react-native-get-random-values";
import "fast-text-encoding";
import { Buffer } from "buffer";

const scope = globalThis as { Buffer?: unknown };
if (typeof scope.Buffer === "undefined") {
  scope.Buffer = Buffer;
}

export {};
