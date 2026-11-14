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


const WORDS: Record<string, (a: Record<string, unknown>) => string> = {
  create_post: (a) => `Create the post "${String(a.slug)}"`,
  commit: () => 'Place a sealed bid (hidden price)',
  reveal: () => 'Reveal your sealed bid',
  settle: () => 'Settle the opening auction',
  buy: (a) => `Buy ${String(a.quantity)} tokens`,
  sell: (a) => `Sell ${String(a.quantity)} tokens`,
  redeem: (a) => `Redeem ${String(a.quantity)} tokens for NEAR from the floor`,
  vote_proof: (a) => (a.accepted ? 'Vote: accept the dare proof' : 'Vote: reject the dare proof'),
  submit_proof: () => 'Post the dare proof',
  claim_refund: () => 'Claim your auction refund',
  finalize_dare: () => 'Settle the dare',
};
const near = (y: string) => { const n = Number(BigInt(y) / 10n ** 18n) / 1e6; return n === 0 ? '0 NEAR' : `${n.toFixed(n < 0.01 ? 6 : 4)} NEAR`; };
/** Test-wallet approval sheet, QA-signer path only: the user sees the call and presses Approve before anything is signed. */
function approve(call: Call, accountId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const el = document.createElement('div');
    el.setAttribute('data-testid', 'qa-approve');
    el.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(18,21,14,.45);display:flex;align-items:flex-end;font-family:Urbanist,system-ui,sans-serif;';
    const row = (k: string, v: string) => `<div style="display:flex;justify-content:space-between;gap:14px;padding:9px 0;border-bottom:1px solid #E2EAD9"><span style="color:#5C6655;font-size:14px">${k}</span><span style="font-weight:700;font-size:14px;text-align:right;word-break:break-all">${v}</span></div>`;
    const words = (WORDS[call.methodName] ?? (() => call.methodName))(call.args as Record<string, unknown>);
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
    el.innerHTML = `<div style="width:100%;background:#fff;border-radius:26px 26px 0 0;padding:14px 20px 26px;box-shadow:0 -10px 40px rgba(18,21,14,.25);color:#12150E">
      <div style="width:42px;height:5px;border-radius:3px;background:#E2EAD9;margin:0 auto 12px"></div>
      <div style="display:flex;justify-content:space-between;align-items:center"><div style="font-size:21px;font-weight:800">Approve transaction</div><div style="font-size:11px;font-weight:700;background:#F5F7F2;border-radius:8px;padding:4px 8px;color:#5C6655">Test wallet</div></div>
      <div style="font-size:16px;font-weight:700;margin:10px 0 4px">${esc(words)}</div>
      ${row('Network', 'NEAR testnet')}${row('Signer', esc(accountId))}${row('Contract', esc(call.receiverId))}${row('Method', esc(call.methodName))}${row('Attached', near(call.deposit))}${row('Gas limit', `${Number(BigInt(call.gas) / 10n ** 12n)} Tgas`)}
      <div style="display:flex;gap:10px;margin-top:16px"><button data-testid="qa-reject" style="flex:1;height:50px;border-radius:25px;border:1.5px solid #12150E;background:#fff;font:800 16px Urbanist,system-ui,sans-serif;color:#12150E">Reject</button><button data-testid="qa-approve-btn" style="flex:1.4;height:50px;border-radius:25px;border:0;background:#D6FF3D;font:800 16px Urbanist,system-ui,sans-serif;color:#12150E">Approve</button></div></div>`;
    document.body.appendChild(el);
    const done = (ok: boolean) => { el.remove(); ok ? resolve() : reject(Error('Rejected in the test wallet.')); };
    el.querySelector('[data-testid=qa-reject]')!.addEventListener('click', () => done(false));
    el.querySelector('[data-testid=qa-approve-btn]')!.addEventListener('click', () => done(true));
  });
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
      if ((window as unknown as { __JUNO_QA_SHEET__?: boolean }).__JUNO_QA_SHEET__) await approve(call, current.accountId); // film runs set this; automated tests skip the tap
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

/** Only the native QA signer shows an in-app approval sheet; other wallets have their own window. */
export function setApprover(_approver: ((request: import("../components/ApproveSheet").ApprovalRequest) => Promise<void>) | null): void {}
