/**
 * JUNO_QA_SIGNER_BUILD_ONLY — the test wallet for the iOS Simulator film build. Metro selects it in place of
 * `browser-wallet.ts` only when EXPO_PUBLIC_QA_SIGNER=1 (metro.config.js); production builds refuse to import it.
 *
 * The app never holds a key. Each call is shown on the approval sheet first; after Approve, the app hands the
 * validated call to the local QA signer (`scripts/qa-native-signer.ts`, 127.0.0.1 only), which checks it against
 * the same policy and a shared testnet budget, signs it with the test account's key and broadcasts it. The app
 * then follows the hash to final like any wallet transaction.
 */
import { Buffer } from "buffer";
import type { TxStep } from "./api";
import type { ApprovalRequest } from "../components/ApproveSheet";
import { FACTORY } from "./chain";
import { validateQaTransaction } from "./qa-signer-policy";

const URL_ = (process.env.EXPO_PUBLIC_QA_SIGNER_URL || "http://127.0.0.1:5351").replace(/\/$/, "");
export const BROWSER_WALLET = { id: "juno-test-wallet", name: "Test wallet", url: URL_ } as const;

type Approver = (request: ApprovalRequest) => Promise<void>;
let approver: Approver | null = null;
let account: string | null = null;

/** The wallet provider registers its approval sheet here. */
export function setApprover(next: Approver | null) {
  approver = next;
}

async function signer<T>(path: string, body?: object): Promise<T> {
  if (process.env.EXPO_PUBLIC_QA_SIGNER !== "1") throw Error("QA signer is disabled in this build.");
  let response: Response;
  try {
    response = await fetch(`${URL_}${path}`, {
      method: body ? "POST" : "GET",
      headers: { "content-type": "application/json", "x-juno-qa": "1" },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw Error(`The test wallet is not running at ${URL_}. Start it with \`pnpm qa:signer\`.`);
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw Error(data.error || `Test wallet HTTP ${response.status}`);
  return data;
}

const WORDS: Record<string, (a: Record<string, unknown>) => string> = {
  create_post: (a) => `Launch "${String(a.slug)}"`,
  fs_store: () => "Store your photo on NEAR",
  commit: () => "Place a sealed bid",
  reveal: () => "Reveal your sealed bid",
  settle: () => "Settle the opening",
  buy: (a) => `Buy ${String(a.quantity)} tokens`,
  sell: (a) => `Sell ${String(a.quantity)} tokens`,
  redeem: (a) => `Redeem ${String(a.quantity)} tokens`,
  vote_proof: (a) => (a.accepted ? "Vote: accept the proof" : "Vote: reject the proof"),
  submit_proof: () => "Post your dare proof",
  claim_refund: () => "Claim your refund",
  claim_dare: () => "Claim your bond share",
  finalize_dare: () => "Settle the dare",
  withdraw_earnings: () => "Withdraw creator fees",
};
const near = (yocto: string) => {
  const n = Number(BigInt(yocto) / 10n ** 18n) / 1e6;
  return n === 0 ? "0 NEAR" : `${n.toLocaleString("en-US", { maximumFractionDigits: n < 0.01 ? 6 : 4 })} NEAR`;
};

function request(step: TxStep, signerId: string): ApprovalRequest {
  const bytes = step.args instanceof Uint8Array;
  const words = (WORDS[step.methodName] ?? (() => step.methodName))(bytes ? {} : (step.args as Record<string, unknown>));
  const rows = [
    { label: "Network", value: "NEAR testnet" },
    { label: "Contract", value: step.receiverId },
    { label: "Method", value: step.methodName },
    { label: "Attaches", value: near(step.deposit) },
    { label: "Gas limit", value: `${Number(BigInt(step.gas) / 10n ** 12n)} Tgas` },
  ];
  if (bytes) rows.splice(3, 0, { label: "Data", value: `${Math.round((step.args as Uint8Array).length / 1000)} kB photo, kept in this transaction` });
  return { kind: "tx", title: words, rows, account: signerId };
}

export function preloadWallet() {}
export async function restoreWallet(): Promise<string | null> {
  return account;
}
export async function connectWallet(contractId: string): Promise<string> {
  const session = await signer<{ accountId: string; factory: string }>("/account");
  if (session.factory !== contractId) throw Error("The test wallet is set up for a different Juno factory.");
  account = session.accountId;
  return account;
}
export async function disconnectWallet(): Promise<void> {
  account = null;
}
export async function sendWithWallet(step: TxStep): Promise<string> {
  if (!account || !FACTORY) throw Error("Connect the test wallet first.");
  validateQaTransaction(
    { signerId: account, receiverId: step.receiverId, actions: [{ type: "FunctionCall", params: { methodName: step.methodName, args: step.args, gas: step.gas, deposit: step.deposit } }] },
    account,
    FACTORY,
  );
  if (!approver) throw Error("The approval sheet is not mounted.");
  await approver(request(step, account));
  const body =
    step.args instanceof Uint8Array
      ? { receiverId: step.receiverId, methodName: step.methodName, bytes: Buffer.from(step.args).toString("base64"), gas: step.gas, deposit: step.deposit }
      : { receiverId: step.receiverId, methodName: step.methodName, args: step.args, gas: step.gas, deposit: step.deposit };
  const { hash } = await signer<{ hash: string }>("/sign", body);
  return hash;
}
