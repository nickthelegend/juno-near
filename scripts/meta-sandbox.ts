import { readFile } from 'node:fs/promises';
import { Account, JsonRpcProvider, KeyPair, KeyPairSigner, actions, type KeyPairString } from 'near-api-js';
import { base64, commitment, market, YOCTO } from '@juno/sdk';
import { allowedDelegate } from '../packages/relayer/src/policy.ts';

const rpc='http://127.0.0.1:3030';
const provider=new JsonRpcProvider({url:rpc});
const rootKey=JSON.parse(await readFile('.demo/sandbox/validator_key.json','utf8')) as {account_id:string;secret_key:KeyPairString};
const root=new Account(rootKey.account_id,provider,new KeyPairSigner(KeyPair.fromString(rootKey.secret_key)));
const wasm=await readFile('packages/contract/target/near/juno_market.wasm');
const txs:Array<{step:string;hash:string}>=[];
async function send(account:Account,receiverId:string,step:string,actionList:ReturnType<typeof actions.functionCall>[]) {
  const result=await account.signAndSendTransaction({receiverId,actions:actionList,throwOnFailure:false,waitUntil:'FINAL'}) as any;
  if(result.status?.Failure)throw Error(`${step} failed on sandbox: ${JSON.stringify(result.status.Failure)}`);
  txs.push({step,hash:result.transaction.hash});
  let value:any;
  if(result.status?.SuccessValue){const bytes=Buffer.from(result.status.SuccessValue,'base64');if(bytes.length)value=JSON.parse(bytes.toString());}
  return value;
}
const factory=`juno.${root.accountId}`;
await send(root,factory,'deploy_factory',[actions.createAccount(),actions.transfer(20n*YOCTO),actions.deployContract(wasm),actions.functionCall('init_factory',{},30n*10n**12n,0n)]);
await send(root,factory,'upload_code',[actions.functionCall('upload_code',{code:wasm.toString('base64')},200n*10n**12n,0n)]);
async function child(name:string){
  const id=`${name}.${root.accountId}`,key=KeyPair.fromRandom('ed25519');
  await send(root,id,`create_${name}`,[actions.createAccount(),actions.transfer(20n*YOCTO),actions.addFullAccessKey(key.getPublicKey())]);
  return new Account(id,provider,new KeyPairSigner(key));
}
const player=await child('player');
const relayer=await child('relayer');
const token=`meta.${factory}`;
await send(player,factory,'create_post',[actions.functionCall('create_post',{slug:'meta',caption:'Signed delegation on a real sandbox chain',media_url:'',dare:'',dare_bond:'0'},100n*10n**12n,4n*YOCTO)]);
const salt='sandbox-secret';
const {signedDelegate}=await player.createSignedMetaTransaction({receiverId:token,actions:[actions.functionCall('commit',{commitment:base64(commitment(player.accountId,1n,YOCTO/1000n,salt))},80n*10n**12n,YOCTO)],blockHeightTtl:120});
if(!allowedDelegate(signedDelegate,factory,new Set([player.accountId])))throw Error('Relayer policy rejected valid commit');
const result=await relayer.relayMetaTransaction(signedDelegate) as any;
if(result.status?.Failure)throw Error(`Delegation rejected on sandbox: ${JSON.stringify(result.status.Failure)}`);
txs.push({step:'nep366_commit',hash:result.transaction.hash});
let data=await market(token,rpc);
for(let i=0;i<20&&data.sealed_bid_count!==1;i++){await new Promise(r=>setTimeout(r,500));data=await market(token,rpc);}
if(data.sealed_bid_count!==1)throw Error(`Delegated commit finalized but count ${data.sealed_bid_count}; status ${JSON.stringify(result.status)}; receipts ${JSON.stringify(result.receipts_outcome?.map((r:any)=>r.outcome.status))}`);
console.log(JSON.stringify({test:'real sandbox NEP-366 signed delegation',factory,token,sealedBidCount:data.sealed_bid_count,transactions:txs},null,2));
