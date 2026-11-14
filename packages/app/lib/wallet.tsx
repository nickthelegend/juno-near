import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import * as SecureStore from "expo-secure-store";
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  actions,
  encodeSignedDelegate,
  type KeyPairString,
} from "near-api-js";

import type { TxStep } from "./api";
import { invalidateMarkets } from "./markets";
import { feedChanged } from "./refresh";
import {
  BROWSER_WALLET,
  connectWallet,
  disconnectWallet,
  preloadWallet,
  restoreWallet,
  sendWithWallet,
  setApprover,
} from "./browser-wallet";
import { describeTxError, EXPLORER_NAME, FACTORY, RELAYER_URL, RPC_URL, TxError } from "./chain";
import { confirmTx } from "./tx-status";
import { SignInSheet } from "../components/SignInSheet";
import { ApproveSheet, type ApprovalRequest } from "../components/ApproveSheet";

/**
 * The wallet: Juno on NEAR, signed in with email.
 *
 * The relayer (`packages/relayer`) sends a six-digit code; on verify it
 * creates a named testnet account for that email with the public half of a
 * key generated here, on this device. The secret half never leaves it: it
 * lives in the browser's storage on web and in the secure store on a phone.
 *
 * Every transaction is a NEP-366 delegate action: this device signs the
 * function call, the relayer wraps it and pays the gas. Any deposit (a buy, a
 * 1 NEAR sealed-bid escrow, a launch's 3 NEAR) still comes from the player's
 * own account. The relayer only relays calls on its allowlist.
 *
 * On web there is a second way in: a NEAR browser wallet (Meteor Wallet on
 * testnet, `browser-wallet.web.ts`). Then the person's own account signs each
 * call in the wallet's window and pays its own deposit and gas, so it works on
 * the hosted app where no relayer runs. Native builds keep the relayer only.
 */

export type SendProgress = {
  index: number;
  label: string;
  phase: "checking" | "signing" | "confirming" | "confirmed";
  hash?: string;
};

export type SendResult = {
  hashes: string[];
  confirmedAt: Date;
};

export type SignInBridge = {
  /** Null when the relayer is not configured or not ready: the text says what is missing. */
  setup: string | null;
  /** The browser wallet on offer (web only), or null. */
  wallet: { name: string; connect: () => Promise<void> } | null;
  sendCode: (email: string) => Promise<void>;
  loginWithCode: (code: string, email: string) => Promise<void>;
};

export type WalletState = {
  /** The NEAR account, or null when signed out. */
  address: string | null;
  ready: boolean;
  signing: boolean;
  emailLogin: boolean;
  /** A browser wallet is on offer too (web). */
  walletLogin: boolean;
  /** How the signed-in account signs: Juno's relayer (email) or the person's own browser wallet. */
  via: "email" | "wallet" | null;
  send: (steps: TxStep[], options?: { onProgress?: (progress: SendProgress) => void }) => Promise<SendResult>;
  connect: () => Promise<string>;
  disconnect: () => Promise<void>;
  /** The wallet's name when signed in through one (a NEAR browser wallet, or the test wallet in a QA build). */
  walletName: string | null;
  /** The wallet on offer to sign in with (a NEAR browser wallet on web, the test wallet in a QA build), or null. */
  offer: string | null;
  /** The test wallet's pending approval, for a screen presented as its own Modal to show (see ApprovalOutlet). */
  approval: ApprovalRequest | null;
  answerApproval: (approved: boolean) => void;
  hostApprovals: () => () => void;
};

const WalletContext = createContext<WalletState | null>(null);
const STORE_KEY = "juno-near-player";

type Player = { accountId: string; secretKey: string };

async function loadPlayer(): Promise<Player | null> {
  try {
    const raw =
      Platform.OS === "web"
        ? typeof localStorage === "undefined"
          ? null
          : localStorage.getItem(STORE_KEY)
        : await SecureStore.getItemAsync(STORE_KEY);
    return raw ? (JSON.parse(raw) as Player) : null;
  } catch {
    return null;
  }
}

async function savePlayer(player: Player | null) {
  const raw = player ? JSON.stringify(player) : null;
  if (Platform.OS === "web") {
    if (typeof localStorage === "undefined") return;
    if (raw) localStorage.setItem(STORE_KEY, raw);
    else localStorage.removeItem(STORE_KEY);
    return;
  }
  if (raw) await SecureStore.setItemAsync(STORE_KEY, raw);
  else await SecureStore.deleteItemAsync(STORE_KEY);
}

async function relayer<T>(path: string, body?: object): Promise<T> {
  if (!RELAYER_URL) throw new Error("Setup required: EXPO_PUBLIC_RELAYER_URL");
  let response: Response;
  try {
    response = await fetch(`${RELAYER_URL}${path}`, {
      method: body ? "POST" : "GET",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error("The Juno relayer can't be reached. Start it with `pnpm relayer`.");
  }
  const data = (await response.json().catch(() => ({}))) as { error?: string } & T;
  if (!response.ok) throw new Error(data.error || `Relayer HTTP ${response.status}`);
  return data;
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [player, setPlayer] = useState<Player | null>(null);
  const [walletAccount, setWalletAccount] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [setup, setSetup] = useState<string | null>(RELAYER_URL ? null : "Setup required: EXPO_PUBLIC_RELAYER_URL");
  const pending = useRef<{ resolve: (address: string) => void; reject: (error: Error) => void } | null>(null);
  const pendingKey = useRef<KeyPair | null>(null);
  /**
   * Set for a few seconds after a wallet sign-in that an action was waiting
   * on. The browser only lets a page open a window right after a tap, and the
   * sign-in window used that tap up, so the action asks for one more.
   */
  const freshWallet = useRef(0);
  // The test wallet (QA builds) asks before it signs anything; a NEAR browser wallet shows its own window instead.
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  // A Modal screen (the trade sheet) covers the root view, so while one is open it shows the approval itself.
  const [hosts, setHosts] = useState(0);
  const hostApprovals = useCallback(() => {
    setHosts((n) => n + 1);
    return () => setHosts((n) => n - 1);
  }, []);
  const answer = useRef<((approved: boolean) => void) | null>(null);
  const answerApproval = useCallback((approved: boolean) => answer.current?.(approved), []);
  useEffect(() => {
    setApprover(
      (request) =>
        new Promise<void>((resolve, reject) => {
          answer.current = (approved) => {
            answer.current = null;
            setApproval(null);
            if (approved) resolve();
            else reject(new TxError({ message: "", cancelled: true, reason: null }));
          };
          setApproval(request);
        }),
    );
    return () => setApprover(null);
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all([loadPlayer(), BROWSER_WALLET ? restoreWallet().catch(() => null) : Promise.resolve(null)]).then(([saved, account]) => {
      if (!live) return;
      setPlayer(saved);
      setWalletAccount(saved ? null : account);
      setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  // Ask the relayer whether it can sign anyone in, once the sheet is opened.
  useEffect(() => {
    if (!signingIn || !RELAYER_URL) return;
    relayer<{ ready: boolean }>("/health")
      .then((health) =>
        setSetup(health.ready ? null : "Setup required: the relayer needs EMAIL_PROVIDER_API_KEY, EMAIL_FROM, AUTH_SECRET, RELAYER_ACCOUNT, RELAYER_KEY_FILE and JUNO_FACTORY_ACCOUNT"),
      )
      .catch((error: unknown) => setSetup(error instanceof Error ? error.message : String(error)));
  }, [signingIn]);

  const address = player?.accountId ?? walletAccount;
  const via: WalletState["via"] = player ? "email" : walletAccount ? "wallet" : null;

  useEffect(() => {
    if (signingIn && BROWSER_WALLET) preloadWallet();
  }, [signingIn]);

  const connect = useCallback(async () => {
    if (address) return address;
    pending.current?.reject(new Error("Sign-in replaced"));
    return new Promise<string>((resolve, reject) => {
      pending.current = { resolve, reject };
      setSigningIn(true);
    });
  }, [address]);

  const cancelSignIn = useCallback(() => {
    setSigningIn(false);
    pending.current?.reject(new TxError({ message: "Sign in to continue.", cancelled: true, reason: null }));
    pending.current = null;
  }, []);

  const bridge = useMemo<SignInBridge>(
    () => ({
      setup,
      wallet: BROWSER_WALLET
        ? {
            name: BROWSER_WALLET.name,
            connect: async () => {
              if (!FACTORY) throw new Error("Setup required: EXPO_PUBLIC_JUNO_FACTORY");
              const accountId = await connectWallet(FACTORY).catch((error: unknown) => {
                const failure = describeTxError(error);
                throw new Error(failure.cancelled ? "The wallet closed before you signed in." : failure.message);
              });
              if (accountId.endsWith(".near")) {
                await disconnectWallet().catch(() => undefined);
                throw new Error(`${accountId} is a mainnet account. Juno runs on NEAR testnet: sign in with a .testnet account.`);
              }
              setWalletAccount(accountId);
              setSigningIn(false);
              if (pending.current) freshWallet.current = Date.now();
              pending.current?.resolve(accountId);
              pending.current = null;
            },
          }
        : null,
      sendCode: async (email) => {
        await relayer("/auth/request", { email });
      },
      loginWithCode: async (code, email) => {
        const key = pendingKey.current ?? KeyPair.fromRandom("ed25519");
        pendingKey.current = key;
        const result = await relayer<{ accountId: string; transactionHash: string }>("/auth/verify", {
          email,
          code,
          publicKey: key.getPublicKey().toString(),
        });
        const next = { accountId: result.accountId, secretKey: key.toString() };
        await savePlayer(next);
        pendingKey.current = null;
        setPlayer(next);
        setSigningIn(false);
        pending.current?.resolve(next.accountId);
        pending.current = null;
      },
    }),
    [setup],
  );

  const disconnect = useCallback(async () => {
    await savePlayer(null);
    setPlayer(null);
    await disconnectWallet().catch(() => undefined);
    setWalletAccount(null);
  }, []);

  /** The browser-wallet path: the wallet signs and submits, the app follows each call to final. */
  const sendViaWallet = useCallback(
    async (accountId: string, steps: TxStep[], progress: (progress: SendProgress) => void): Promise<SendResult> => {
      // Where the browser can say whether a tap is still "live", trust it; elsewhere assume the sign-in used it up.
      const activation = (globalThis.navigator as { userActivation?: { isActive: boolean } } | undefined)?.userActivation;
      if (Date.now() - freshWallet.current < 8000 && !activation?.isActive) {
        freshWallet.current = 0;
        throw new TxError({ message: `Signed in as ${accountId}. Tap again to approve it in ${BROWSER_WALLET?.name ?? "your wallet"}.`, cancelled: false, reason: null });
      }
      setSigning(true);
      const hashes: string[] = [];
      try {
        for (const [index, step] of steps.entries()) {
          progress({ index, label: step.label, phase: "signing" });
          const hash = await sendWithWallet(step).catch((error: unknown) => {
            throw new TxError(describeTxError(error));
          });
          progress({ index, label: step.label, phase: "confirming", hash });
          const failure = await confirmTx(hash, accountId).catch((error: unknown) => {
            throw new TxError({ message: error instanceof Error ? error.message : String(error), cancelled: false, reason: null });
          });
          if (failure) throw new TxError(describeTxError(failure));
          hashes.push(hash);
          progress({ index, label: step.label, phase: "confirmed", hash });
        }
        return { hashes, confirmedAt: new Date() };
      } finally {
        if (hashes.length) {
          invalidateMarkets();
          feedChanged();
        }
        setSigning(false);
      }
    },
    [],
  );

  const send = useCallback<WalletState["send"]>(
    async (steps, options = {}) => {
      if (!player && !walletAccount) throw new TxError({ message: "Sign in to continue.", cancelled: false, reason: null });
      if (steps.length === 0) throw new TxError({ message: "Nothing to send.", cancelled: false, reason: null });
      const progress = options.onProgress ?? (() => undefined);
      if (!player) return sendViaWallet(walletAccount!, steps, progress);
      const account = new Account(
        player.accountId,
        new JsonRpcProvider({ url: RPC_URL }),
        new KeyPairSigner(KeyPair.fromString(player.secretKey as KeyPairString)),
      );
      setSigning(true);
      const hashes: string[] = [];
      try {
        for (const [index, step] of steps.entries()) {
          progress({ index, label: step.label, phase: "signing" });
          let encoded: string;
          try {
            const { signedDelegate } = await account.createSignedMetaTransaction({
              receiverId: step.receiverId,
              actions: [actions.functionCall(step.methodName, step.args, BigInt(step.gas), BigInt(step.deposit))],
              blockHeightTtl: 120,
            });
            encoded = btoa(String.fromCharCode(...encodeSignedDelegate(signedDelegate)));
          } catch (error) {
            throw new TxError(describeTxError(error));
          }
          progress({ index, label: step.label, phase: "confirming" });
          const result = await relayer<{ transactionHash: string }>("/relay", { signedDelegate: encoded }).catch((error: unknown) => {
            throw new TxError(describeTxError(error));
          });
          const hash = result.transactionHash;
          // The relayer answers once the outer transaction is final; the inner
          // call's own failure comes back as an error above.
          hashes.push(hash);
          progress({ index, label: step.label, phase: "confirmed", hash });
        }
        return { hashes, confirmedAt: new Date() };
      } catch (error) {
        if (error instanceof TxError) throw error;
        throw new TxError({
          message: `${describeTxError(error).message} Check your account on ${EXPLORER_NAME} before trying again.`,
          cancelled: false,
          reason: null,
        });
      } finally {
        if (hashes.length) {
          invalidateMarkets();
          feedChanged();
        }
        setSigning(false);
      }
    },
    [player, walletAccount, sendViaWallet],
  );

  const value = useMemo<WalletState>(
    () => ({
      address,
      ready,
      signing,
      emailLogin: true,
      walletLogin: !!BROWSER_WALLET,
      via,
      send,
      connect,
      disconnect,
      walletName: via === "wallet" ? (BROWSER_WALLET?.name ?? null) : null,
      offer: BROWSER_WALLET?.name ?? null,
      approval,
      answerApproval,
      hostApprovals,
    }),
    [address, ready, signing, via, send, connect, disconnect, approval, answerApproval, hostApprovals],
  );

  return (
    <WalletContext.Provider value={value}>
      {children}
      <SignInSheet visible={signingIn} onClose={cancelSignIn} bridge={bridge} />
      <ApproveSheet request={hosts > 0 ? null : approval} onAnswer={answerApproval} />
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletState {
  const context = useContext(WalletContext);
  if (!context) throw new Error("useWallet must be used inside a WalletProvider");
  return context;
}

/** Renders the test wallet's approval sheet inside a screen that is its own Modal (it would be hidden behind it). */
export function ApprovalOutlet() {
  const wallet = useWallet();
  const { hostApprovals } = wallet;
  useEffect(() => hostApprovals(), [hostApprovals]);
  const shown = useRef(false);
  // A Modal is its own native window: gestures inside it need their own root (the sheet can be dragged down).
  if (!wallet.approval && !shown.current) return null;
  shown.current = !!wallet.approval;
  return (
    <GestureHandlerRootView style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <ApproveSheet request={wallet.approval} onAnswer={wallet.answerApproval} />
    </GestureHandlerRootView>
  );
}
