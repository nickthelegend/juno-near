/**
 * The test wallet behind the iOS Simulator film build (packages/app/lib/qa-signer.native.ts).
 *
 * Listens on 127.0.0.1 only (QA_SIGNER_PORT, default 5351; the simulator shares the Mac's loopback). The app shows
 * its approval sheet, and only after Approve does it POST the call here. This process re-checks the call with the
 * same policy as the browser QA signer (one function call, Juno's factory, its posts or its media account, no
 * transfers), reserves it against one shared testnet budget (EXPO_PUBLIC_QA_BUDGET_NEAR), signs it with the test
 * account's key and broadcasts it. The key is read from .near-credentials/seed.json in code and never leaves this
 * process; every hash is appended to deployments/film-v9-signing-2026-11-14.jsonl.
 *
 * usage: QA_ACCOUNT=kai EXPO_PUBLIC_QA_BUDGET_NEAR=6 tsx scripts/qa-native-signer.ts
 * Requests must carry `x-juno-qa: 1`: a web page cannot send that header cross-origin without a CORS preflight,
 * which this server never answers.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, type KeyPairString } from 'near-api-js';
import { QA_BUDGET, reserveQaBudget, validateQaTransaction } from '../packages/app/lib/qa-signer-policy.ts';

const PORT = Number(process.env.QA_SIGNER_PORT || 5351);
const FACTORY = 'juno-awkorp.testnet';
const LEDGER = process.env.QA_LEDGER || 'deployments/film-v9-signing-2026-11-14.jsonl';
const seed = JSON.parse(readFileSync('.near-credentials/seed.json', 'utf8'));
const player = seed.players[process.env.QA_ACCOUNT || 'kai'];
if (!player) throw Error('QA_ACCOUNT must name a seeded player (kai, mira or oto).');
const provider = new JsonRpcProvider({ url: process.env.QA_RPC || 'https://test.rpc.fastnear.com' });
const signer = new KeyPairSigner(KeyPair.fromString(player.secretKey as KeyPairString));
const account = new Account(player.id, provider, signer);
let reserved = 0n;
let busy = false;

type Body = { receiverId: string; methodName: string; args?: Record<string, unknown>; bytes?: string; gas: string; deposit: string };

const server = createServer(async (req, res) => {
  const reply = (status: number, body: object) => {
    res.writeHead(status, { 'content-type': 'application/json' });
    res.end(JSON.stringify(body));
  };
  if (req.headers['x-juno-qa'] !== '1' || req.headers.origin) return reply(403, { error: 'Test wallet: local app requests only.' });
  if (req.method === 'GET' && req.url === '/account') return reply(200, { accountId: player.id, factory: FACTORY });
  if (req.method !== 'POST' || req.url !== '/sign') return reply(404, { error: 'not found' });
  if (busy) return reply(409, { error: 'The test wallet waits for the current call before signing another.' });
  busy = true;
  try {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const chunk of req) {
      size += (chunk as Buffer).length;
      if (size > 600_000) throw Error('Request too large.');
      chunks.push(chunk as Buffer);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8')) as Body;
    const args = typeof body.bytes === 'string' ? new Uint8Array(Buffer.from(body.bytes, 'base64')) : body.args;
    const call = validateQaTransaction(
      { signerId: player.id, receiverId: body.receiverId, actions: [{ type: 'FunctionCall', params: { methodName: body.methodName, args, gas: body.gas, deposit: body.deposit } }] },
      player.id,
      FACTORY,
    );
    const gasPrice = BigInt(((await provider.viewGasPrice(null)) as { gas_price: string }).gas_price);
    // Photo bytes are charged per byte on top of the attached gas: reserve that too.
    const byteGas = args instanceof Uint8Array ? BigInt(args.length) * 4_500_000n : 0n;
    reserved = reserveQaBudget(reserved, BigInt(call.deposit), BigInt(call.gas) + byteGas, gasPrice);
    const tx = await account.createTransaction({
      receiverId: call.receiverId,
      actions: [actions.functionCall(call.methodName, call.args as Record<string, unknown> | Uint8Array, BigInt(call.gas), BigInt(call.deposit))],
      publicKey: await signer.getPublicKey(),
    });
    const { signedTransaction } = await signer.signTransaction(tx);
    const outcome = (await provider.sendTransactionUntil(signedTransaction, 'INCLUDED')) as { transaction: { hash: string } };
    const hash = outcome.transaction.hash;
    appendFileSync(LEDGER, JSON.stringify({ at: new Date().toISOString(), signer: player.id, receiver: call.receiverId, method: call.methodName, depositYocto: call.deposit, hash }) + '\n');
    console.log(new Date().toISOString(), call.methodName, call.receiverId, hash);
    reply(200, { hash });
  } catch (error) {
    reply(400, { error: error instanceof Error ? error.message : String(error) });
  } finally {
    busy = false;
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`test wallet ${player.id} on 127.0.0.1:${PORT}, budget ${Number(QA_BUDGET / 10n ** 20n) / 10_000} NEAR`));
