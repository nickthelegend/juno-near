/** Prints the testnet NEAR balance (total and free of storage) of Juno's film accounts. Read-only. */
import { JsonRpcProvider } from 'near-api-js';
const p = new JsonRpcProvider({ url: process.env.FILM_RPC || 'https://near-testnet.drpc.org' });
for (const id of ['kai', 'mira', 'oto'].map((n) => `${n}.juno-awkorp.testnet`).concat('juno-awkorp.testnet')) {
  const a = (await p.query({ request_type: 'view_account', finality: 'final', account_id: id })) as unknown as { amount: string; storage_usage: number };
  const total = Number(BigInt(a.amount) / 10n ** 20n) / 1e4;
  console.log(id.padEnd(28), total.toFixed(4), 'free', (total - a.storage_usage / 1e5).toFixed(4));
}
