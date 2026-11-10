/**
 * Sign in with a NEAR browser wallet, web only: Meteor Wallet on testnet,
 * through NEAR Wallet Selector.
 *
 * The person's own account signs every call and pays its own deposit and gas;
 * Juno's relayer is not involved, so this works on the hosted app. Meteor
 * opens in a pop-up window (or its browser extension, when installed) and
 * posts the result back to this page, so a static host needs no callback
 * route. MyNearWallet was the first choice, but on 2026-11-10 its testnet
 * pop-up answered "MyNearWallet can't connect to apps anymore" and pointed to
 * Meteor Wallet instead.
 *
 * The native build resolves `./browser-wallet` to the stub next to this file,
 * so the wallet selector never enters an iOS or Android bundle.
 */
import type { InjectedWallet, WalletSelector } from "@near-wallet-selector/core";

import type { TxStep } from "./api";
import { RPC_URLS } from "./chain";

export const BROWSER_WALLET = { id: "meteor-wallet", name: "Meteor Wallet", url: "https://wallet.meteorwallet.app" } as const;

let selectorPromise: Promise<WalletSelector> | null = null;

// Loaded on first use, so the feed does not pay for the wallet bundle.
function selector(): Promise<WalletSelector> {
  selectorPromise ??= Promise.all([import("@near-wallet-selector/core"), import("@near-wallet-selector/meteor-wallet")])
    .then(([core, meteor]) =>
      core.setupWalletSelector({
        network: "testnet",
        fallbackRpcUrls: RPC_URLS,
        modules: [meteor.setupMeteorWallet()],
      }),
    )
    .catch((error: unknown) => {
      selectorPromise = null;
      throw new Error(`${BROWSER_WALLET.name} could not load (${error instanceof Error ? error.message : String(error)}). Reload and try again.`);
    });
  return selectorPromise;
}

async function wallet(): Promise<InjectedWallet> {
  return (await selector()).wallet<InjectedWallet>(BROWSER_WALLET.id);
}

/** Start loading the selector now, so a tap on Connect opens the pop-up without waiting on a download. */
export function preloadWallet(): void {
  void selector().catch(() => undefined);
}

/** The account signed in through the wallet on an earlier visit, if any. */
export async function restoreWallet(): Promise<string | null> {
  // Skip the wallet bundle for anyone who never connected one.
  if (typeof localStorage === "undefined" || !localStorage.getItem("near-wallet-selector:selectedWalletId")) return null;
  const s = await selector();
  return s.store.getState().accounts.find((account) => account.active)?.accountId ?? null;
}

/**
 * Open the wallet's sign-in. `contractId` is the Juno factory: the wallet
 * adds a function-call key for it, and every call that attaches NEAR (a bid,
 * a buy, a launch) still asks the person to approve it in the wallet.
 */
export async function connectWallet(contractId: string): Promise<string> {
  const s = await selector();
  const accounts = await (await wallet()).signIn({ contractId, methodNames: [] });
  const id = accounts[0]?.accountId || s.store.getState().accounts.find((account) => account.active)?.accountId;
  if (!id) throw new Error(`${BROWSER_WALLET.name} did not return an account.`);
  return id;
}

export async function disconnectWallet(): Promise<void> {
  if (typeof localStorage === "undefined" || !localStorage.getItem("near-wallet-selector:selectedWalletId")) return;
  await (await wallet()).signOut();
}

/**
 * Have the wallet sign and send one Juno call. Resolves with the transaction
 * hash once the wallet has submitted it; `confirmTx` follows it to final.
 */
export async function sendWithWallet(step: TxStep): Promise<string> {
  const [connected, { stepActions }] = await Promise.all([wallet(), import("./wallet-actions")]);
  type Outcome = { transaction?: { hash?: string }; transaction_outcome?: { id?: string } } | undefined;
  let outcome: Outcome;
  try {
    outcome = (await connected.signAndSendTransaction({ receiverId: step.receiverId, actions: stepActions(step) })) as Outcome;
  } catch (error) {
    // Landed and failed (a contract panic): the error carries the outcome. Hand back
    // the hash so `confirmTx` reads the failure from the chain like any other.
    const landed = (error as { transaction_outcome?: { id?: string } } | null)?.transaction_outcome?.id;
    if (landed) return landed;
    throw error;
  }
  const hash = outcome?.transaction?.hash ?? outcome?.transaction_outcome?.id;
  if (!hash) throw new Error(`${BROWSER_WALLET.name} did not return a transaction hash. Check your account on NearBlocks before trying again.`);
  return hash;
}
