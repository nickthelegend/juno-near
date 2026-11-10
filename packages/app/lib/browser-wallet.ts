/**
 * The native build has no browser wallet: iOS and Android sign in through the
 * Juno relayer only. Metro picks `browser-wallet.web.ts` for the web export;
 * this file keeps the same shape so `wallet.tsx` imports one module on every
 * platform, and keeps the wallet selector out of the native bundle.
 */
import type { TxStep } from "./api";

export const BROWSER_WALLET: { id: string; name: string; url: string } | null = null;

const unavailable = () => new Error("A NEAR browser wallet is only available in the web app.");

export function preloadWallet(): void {}

export async function restoreWallet(): Promise<string | null> {
  return null;
}

export async function connectWallet(_contractId: string): Promise<string> {
  throw unavailable();
}

export async function disconnectWallet(): Promise<void> {}

export async function sendWithWallet(_step: TxStep): Promise<string> {
  throw unavailable();
}
