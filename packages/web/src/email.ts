import {
  Account,
  JsonRpcProvider,
  KeyPair,
  KeyPairSigner,
  actions,
  encodeSignedDelegate,
  type KeyPairString,
} from "near-api-js";
import { TESTNET_RPC } from "@juno/sdk";

export type EmailPlayer = { accountId: string; secretKey: string };
async function post(url: string, body: object): Promise<any> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw Error(data.error || `Relayer HTTP ${res.status}`);
  return data;
}
export async function requestCode(
  relayer: string,
  email: string,
): Promise<void> {
  await post(`${relayer}/auth/request`, { email });
}
export async function verifyCode(
  relayer: string,
  email: string,
  code: string,
): Promise<{ player: EmailPlayer; transactionHash: string }> {
  const keyPair = KeyPair.fromRandom("ed25519");
  const result = await post(`${relayer}/auth/verify`, {
    email,
    code,
    publicKey: keyPair.getPublicKey().toString(),
  });
  const player = {
    accountId: result.accountId as string,
    secretKey: keyPair.toString(),
  };
  return { player, transactionHash: result.transactionHash };
}
export async function relayCall(
  relayer: string,
  player: EmailPlayer,
  receiverId: string,
  methodName: string,
  args: object,
  deposit: bigint,
  rpc = TESTNET_RPC,
): Promise<string> {
  const account = new Account(
    player.accountId,
    new JsonRpcProvider({ url: rpc }),
    new KeyPairSigner(KeyPair.fromString(player.secretKey as KeyPairString)),
  );
  const { signedDelegate } = await account.createSignedMetaTransaction({
    receiverId,
    actions: [
      actions.functionCall(methodName, args, 120n * 10n ** 12n, deposit),
    ],
    blockHeightTtl: 120,
  });
  const result = await post(`${relayer}/relay`, {
    signedDelegate: btoa(
      String.fromCharCode(...encodeSignedDelegate(signedDelegate)),
    ),
  });
  return result.transactionHash as string;
}
