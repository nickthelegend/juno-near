import { shortAddress as shortAccount } from "./chain";

/**
 * Display names for NEAR accounts.
 *
 * A NEAR account already is a name, so there is nothing to look up: a player
 * account under the Juno root shows its first label ("mira" for
 * mira.juno-k3x9.testnet), anything else shows the account without its
 * `.testnet` suffix.
 */
const ROOT = process.env.EXPO_PUBLIC_JUNO_FACTORY ?? "";

export function rememberName(_wallet: string, _name: string) {}

export function shortAddress(wallet: string): string {
  if (ROOT && wallet.endsWith(`.${ROOT}`)) return wallet.slice(0, -ROOT.length - 1);
  return shortAccount(wallet);
}

export function useName(wallet: string | null | undefined): string | null {
  return wallet ? shortAddress(wallet) : null;
}

export function useHandle(wallet: string | null | undefined): string {
  if (!wallet) return "";
  return shortAddress(wallet);
}
