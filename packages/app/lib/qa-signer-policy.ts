/** Validation shared by the QA-only browser adapter and its Node harness. */
/** Shared testnet spend cap for one QA run: 0.3 NEAR, or EXPO_PUBLIC_QA_BUDGET_NEAR (whole NEAR, max 12) for a filmed lifecycle run. */
function budget(): bigint {
  const raw = process.env.EXPO_PUBLIC_QA_BUDGET_NEAR;
  if (!raw) return 3n * 10n ** 23n;
  if (!/^\d{1,2}$/.test(raw) || Number(raw) < 1 || Number(raw) > 12) throw Error('EXPO_PUBLIC_QA_BUDGET_NEAR must be a whole number of NEAR from 1 to 12.');
  return BigInt(raw) * 10n ** 24n;
}
export const QA_BUDGET = budget();
const BUDGET_LABEL = `${Number(QA_BUDGET / 10n ** 20n) / 10_000}`;
export const QA_RPC_URLS = ['https://near-testnet.drpc.org', 'https://test.rpc.fastnear.com', 'https://rpc.testnet.near.org'];
const ACCOUNT = /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/;
const METHODS = new Set(['buy', 'sell', 'redeem', 'withdraw_earnings', 'claim_refund', 'claim_dare', 'submit_proof', 'vote_proof', 'finalize_dare', 'settle', 'reveal', 'commit', 'create_post', 'fs_store']);

export function testnetAccount(id: string): void {
  if (typeof id !== 'string' || !id.endsWith('.testnet') || id.length > 64 || !ACCOUNT.test(id)) throw Error('QA signer requires a named .testnet account.');
}
export function testnetRpc(endpoint: string): string {
  const url = new URL(endpoint);
  if (!QA_RPC_URLS.includes(url.origin) || url.pathname !== '/' || url.search || url.hash || url.username || url.password) throw Error('QA signer refuses this RPC; only the configured public testnet nodes are allowed.');
  return url.origin;
}
export type QaTransaction = { signerId?: string; receiverId: string; actions: readonly unknown[] };
export function validateQaTransaction(transaction: QaTransaction, accountId: string, factory: string) {
  testnetAccount(accountId); testnetAccount(factory); testnetAccount(transaction.receiverId);
  if (transaction.signerId && transaction.signerId !== accountId) throw Error('QA signer account mismatch.');
  if (transaction.receiverId !== factory && !transaction.receiverId.endsWith(`.${factory}`)) throw Error('QA signer only calls this Juno factory and its posts.');
  if (!Array.isArray(transaction.actions) || transaction.actions.length !== 1) throw Error('QA signer requires one Juno function call.');
  const action = transaction.actions[0] as { type?: string; params?: { methodName: string; args: Record<string, unknown>; gas: string | bigint; deposit: string | bigint } };
  if (action?.type !== 'FunctionCall' || !action.params || !METHODS.has(action.params.methodName)) throw Error('QA signer refuses this action.');
  const gas = BigInt(action.params.gas), deposit = BigInt(action.params.deposit);
  if (gas <= 0n || gas > 150n * 10n ** 12n || deposit < 0n || deposit > QA_BUDGET) throw Error('QA signer gas/deposit exceeds the test budget.');
  if (!action.params.args || typeof action.params.args !== 'object' || Array.isArray(action.params.args)) throw Error('QA signer requires JSON function-call arguments.');
  if (action.params.methodName === 'fs_store') {
    // A photo for a post: raw JPEG bytes to the factory's locked media account, no deposit, at most 250 kB.
    if (transaction.receiverId !== `media.${factory}` || deposit !== 0n || !(action.params.args instanceof Uint8Array) || action.params.args.length > 250_000) throw Error('QA signer only stores photos (fs_store, under 250 kB, no deposit) on the media account.');
  } else if (action.params.args instanceof Uint8Array) throw Error('QA signer requires JSON function-call arguments.');
  return { receiverId: transaction.receiverId, methodName: action.params.methodName, args: action.params.args, gas: gas.toString(), deposit: deposit.toString() };
}
export function reserveQaBudget(reserved: bigint, deposit: bigint, gas: bigint, gasPrice: bigint) {
  if (reserved < 0n || deposit < 0n || gas <= 0n || gasPrice <= 0n) throw Error('Invalid QA budget input.');
  const next = reserved + deposit + gas * gasPrice * 3n;
  if (next > QA_BUDGET) throw Error(`QA signer stopped: the shared ${BUDGET_LABEL} testnet NEAR budget would be exceeded.`);
  return next;
}
