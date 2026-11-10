/**
 * A Juno `TxStep` as the NEAR action a browser wallet signs.
 *
 * Shared by the web wallet (`browser-wallet.web.ts`) and
 * `scripts/wallet-path.ts`, which signs the same actions with a local testnet
 * key, so the call the script proves on testnet is the call the wallet sends.
 * Web and Node only: it imports the wallet selector.
 */
import { actionCreators } from "@near-wallet-selector/core";

import type { TxStep } from "./api";

export function stepActions(step: TxStep) {
  return [actionCreators.functionCall(step.methodName, step.args, BigInt(step.gas), BigInt(step.deposit))];
}
