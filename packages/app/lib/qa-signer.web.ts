/** JUNO_QA_SIGNER_BUILD_ONLY — selected by Metro only in an explicitly flagged web build. */
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, baseEncode, type KeyPairString } from 'near-api-js';
import type { TxStep } from './api';
import { RPC_URL } from './chain';
import { testnetAccount, testnetRpc, validateQaTransaction, type QaTransaction } from './qa-signer-policy';

type Call = ReturnType<typeof validateQaTransaction>;
type Injection = { accountId: string; secretKey: string; rpcUrl: string; factory: string };
type Report = { event: 'prepared' | 'submitted' | 'submission_unknown'; reservation: number; hash: string };
declare global {
  interface Window {
    __JUNO_QA_SIGNER__?: Injection;
    __JUNO_QA_AUTHORIZE__?: (call: Call) => Promise<number>;
    __JUNO_QA_REPORT__?: (report: Report) => Promise<void>;
  }
}
export const BROWSER_WALLET = { id: 'juno-qa-signer', name: 'QA signer', url: 'http://localhost' } as const;
const SESSION = 'juno-qa-connected';
let loaded: { account: Account; signer: KeyPairSigner; provider: JsonRpcProvider; accountId: string; factory: string } | null = null;
let connected = false;
let busy = false;
function credentials() {
  if (process.env.EXPO_PUBLIC_QA_SIGNER !== '1') throw Error('QA signer is disabled in this build.');
  if (!['localhost', '127.0.0.1'].includes(location.hostname) || Number(location.port) < 5300 || Number(location.port) > 5999) throw Error('QA signer only runs on the local QA preview port.');
  testnetRpc(RPC_URL);
  if (loaded) return loaded;
  const input = window.__JUNO_QA_SIGNER__;
  delete window.__JUNO_QA_SIGNER__;
  if (!input || !window.__JUNO_QA_AUTHORIZE__ || !window.__JUNO_QA_REPORT__) throw Error('QA signer requires the Playwright harness injection and shared budget guard.');
  testnetAccount(input.accountId); testnetAccount(input.factory);
  const rpc = testnetRpc(input.rpcUrl);
  let signer: KeyPairSigner;
  try { signer = new KeyPairSigner(KeyPair.fromString(input.secretKey as KeyPairString)); }
  catch { throw Error('QA signer could not read the injected testnet key.'); }
  const provider = new JsonRpcProvider({ url: rpc });
  loaded = { account: new Account(input.accountId, provider, signer), signer, provider, accountId: input.accountId, factory: input.factory };
  return loaded;
}

/** Wallet Selector-shaped methods; no key is persisted or returned to the caller. */
export const qaWallet = {
  async getAccounts() { return connected ? [{ accountId: credentials().accountId }] : []; },
  async signIn({ contractId }: { contractId: string }) {
    const current = credentials();
    if (contractId !== current.factory) throw Error('QA signer factory mismatch.');
    connected = true;
    sessionStorage.setItem(SESSION, '1');
    return this.getAccounts();
  },
  async signOut() { connected = false; sessionStorage.removeItem(SESSION); },
  async signAndSendTransaction(transaction: QaTransaction) {
    if (!connected) throw Error('QA signer is not connected.');
    if (busy) throw Error('QA signer waits for the current call before signing another.');
    busy = true;
    try {
      const current = credentials();
      const call = validateQaTransaction(transaction, current.accountId, current.factory);
      const reservation = await window.__JUNO_QA_AUTHORIZE__!(call);
      const tx = await current.account.createTransaction({ receiverId: call.receiverId, actions: [actions.functionCall(call.methodName, call.args, BigInt(call.gas), BigInt(call.deposit))], publicKey: await current.signer.getPublicKey() });
      const { txHash: digest, signedTransaction: signed } = await current.signer.signTransaction(tx);
      const hash = baseEncode(digest);
      // Persist only the public hash before any broadcast, including an uncertain submission.
      await window.__JUNO_QA_REPORT__!({ event: 'prepared', reservation, hash });
      try {
        await current.provider.sendTransactionUntil(signed, 'NONE');
      } catch {
        await window.__JUNO_QA_REPORT__!({ event: 'submission_unknown', reservation, hash });
        throw Error(`QA signer submission result is unknown for ${hash}. Check its receipt before retrying.`);
      }
      await window.__JUNO_QA_REPORT__!({ event: 'submitted', reservation, hash });
      return { transaction: { hash } };
    } finally { busy = false; }
  },
  async signAndSendTransactions({ transactions }: { transactions: QaTransaction[] }) {
    const results = [];
    for (const transaction of transactions) results.push(await this.signAndSendTransaction(transaction));
    return results;
  },
};
export function preloadWallet() {}
export async function restoreWallet() {
  if (sessionStorage.getItem(SESSION) !== '1') return null;
  connected = true;
  return (await qaWallet.getAccounts())[0]?.accountId ?? null;
}
export async function connectWallet(contractId: string) { return (await qaWallet.signIn({ contractId }))[0]!.accountId; }
export async function disconnectWallet() { await qaWallet.signOut(); }
export async function sendWithWallet(step: TxStep) {
  const outcome = await qaWallet.signAndSendTransaction({ receiverId: step.receiverId, actions: [{ type: 'FunctionCall', params: { methodName: step.methodName, args: step.args, gas: step.gas, deposit: step.deposit } }] });
  return outcome.transaction.hash;
}
