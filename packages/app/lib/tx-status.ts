/**
 * Follow a transaction a wallet sent until it is final, and say whether it worked.
 *
 * A browser wallet submits the transaction itself, and what it hands back
 * varies by wallet and version (some only wait for `NONE`, before anything
 * has executed). So the app takes the hash and asks again, across
 * the public testnet RPCs, until the transaction and every receipt it spawned
 * are final, and returns the failure text when any of them failed (a contract
 * panic such as `ERR_PAYMENT`, or an action error such as `NotEnoughBalance`).
 *
 * No React Native imports: `scripts/wallet-path.ts` runs this in Node.
 */
import { RPC_URLS } from "./chain";

type Outcome = { status?: { Failure?: unknown; SuccessValue?: string; SuccessReceiptId?: string } };
type TxResult = {
  final_execution_status?: string;
  status?: { Failure?: unknown };
  transaction_outcome?: { outcome?: Outcome };
  receipts_outcome?: { outcome?: Outcome }[];
};

/** The failure in a final transaction, as text a person (or `describeTxError`) can read; null when it succeeded. */
export function failureOf(result: TxResult): string | null {
  const failure =
    result.status?.Failure ??
    result.transaction_outcome?.outcome?.status?.Failure ??
    result.receipts_outcome?.find((receipt) => receipt.outcome?.status?.Failure)?.outcome?.status?.Failure;
  if (!failure) return null;
  const text = JSON.stringify(failure);
  const panic = /Smart contract panicked: ((?:\\.|[^"\\])+)/.exec(text)?.[1];
  // near-sdk's `expect` prefixes the source line: "panicked at src/lib.rs:98:48:\nERR_PAYMENT".
  if (panic) return `Smart contract panicked: ${panic.replace(/\\n/g, "\n").replace(/^panicked at [^\n]*:\n/, "")}`;
  return text;
}

/**
 * Wait until `hash` (signed by `signerId`) is final. Resolves with null on
 * success, or the failure text; rejects when no RPC can find the transaction
 * within `timeoutMs`.
 */
export async function confirmTx(hash: string, signerId: string, timeoutMs = 90_000): Promise<string | null> {
  const started = Date.now();
  let attempt = 0;
  let lastProblem = "";
  while (Date.now() - started < timeoutMs) {
    const endpoint = RPC_URLS[attempt % RPC_URLS.length]!;
    attempt += 1;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "juno",
          method: "tx",
          params: { tx_hash: hash, sender_account_id: signerId, wait_until: "FINAL" },
        }),
      });
      if (response.status === 429 || response.status >= 500) throw new Error(`RPC HTTP ${response.status}`);
      const body = (await response.json()) as { result?: TxResult; error?: { name?: string; cause?: { name?: string }; message?: string } };
      if (body.result) return failureOf(body.result);
      const cause = body.error?.cause?.name ?? body.error?.name ?? body.error?.message ?? "unknown";
      // Usually UNKNOWN_TRANSACTION (not seen yet) or TIMEOUT_ERROR (the node gave up waiting): ask again.
      lastProblem = cause;
    } catch (error) {
      lastProblem = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, Math.min(4000, 800 * attempt)));
  }
  throw new Error(`The transaction ${hash} was sent, but its result could not be read (${lastProblem}). Check it on NearBlocks.`);
}
