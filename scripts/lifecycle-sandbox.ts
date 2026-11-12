/** Real local-chain verification of the exact app lifecycle builders. No testnet writes. */
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {Account,JsonRpcProvider,KeyPair,KeyPairSigner,actions,type KeyPairString} from 'near-api-js';
import {base64,commitment,lifecycle,market,YOCTO,decodeLifecycle} from '@juno/sdk';
import {buildLifecycle,lifecycleOptions,type LifecycleMethod} from '../packages/app/lib/lifecycle.ts';
import {failureOf} from '../packages/app/lib/tx-status.ts';
const port=Number(process.env.SANDBOX_RPC_PORT||5385),state=process.env.SANDBOX_STATE_DIR||'.demo/r3-lifecycle';
assert.ok(port>=5300&&port<=5998,'Use a local sandbox port in the QA range.');
const rpc=`http://127.0.0.1:${port}`,provider=new JsonRpcProvider({url:rpc});
const rootData=JSON.parse(await readFile(`${state}/sandbox/validator_key.json`,'utf8'));
const root=new Account(rootData.account_id,provider,new KeyPairSigner(KeyPair.fromString(rootData.secret_key as KeyPairString)));
const wasm=await readFile('packages/contract/target/near/juno_market.wasm');
const txs:Array<{step:string;hash:string}>=[];
async function send(who:Account,to:string,step:string,list:any[]) {
 const r:any=await who.signAndSendTransaction({receiverId:to,actions:list,waitUntil:'FINAL',throwOnFailure:false});
 assert.equal(failureOf(r),null,`${step} failed on sandbox`);txs.push({step,hash:r.transaction.hash});return r;
}
const factory=`r3.${root.accountId}`;
await send(root,factory,'deploy factory',[actions.createAccount(),actions.transfer(30n*YOCTO),actions.deployContract(wasm),actions.functionCall('init_factory',{},30n*10n**12n,0n)]);
await send(root,factory,'upload code',[actions.functionCall('upload_code',{code:wasm.toString('base64')},200n*10n**12n,0n)]);
async function child(name:string){const id=`${name}.${root.accountId}`,key=KeyPair.fromRandom('ed25519');await send(root,id,`create ${name}`,[actions.createAccount(),actions.transfer(20n*YOCTO),actions.addFullAccessKey(key.getPublicKey())]);return new Account(id,provider,new KeyPairSigner(key));}
const creator=await child('creator'),voter=await child('voter');
const post=`proof.${factory}`,salt='r3-local',price=YOCTO/1000n;
await send(creator,factory,'launch local dare',[actions.functionCall('create_post',{slug:'proof',caption:'Local lifecycle test',media_url:'',dare:'Publish the proof',dare_bond:(YOCTO/10n).toString()},150n*10n**12n,4n*YOCTO)]);
async function callBuilder(who:Account,method:LifecycleMethod,input:{proof?:string;accepted?:boolean}={}){
 const snapshot=await lifecycle(post,who.accountId,rpc),step=buildLifecycle(post,snapshot,method,input);
 assert.equal(step.deposit,'0');await send(who,step.receiverId,method,[actions.functionCall(step.methodName,step.args,BigInt(step.gas),BigInt(step.deposit))]);
}
assert.equal(lifecycleOptions(await lifecycle(post,voter.accountId,rpc)).claim_refund.eligible,false);
assert.equal(lifecycleOptions(await lifecycle(post,voter.accountId,rpc)).submit_proof.eligible,false);
assert.throws(()=>decodeLifecycle(new Uint8Array(10),voter.accountId,0));
await callBuilder(creator,'submit_proof',{proof:'https://example.com/local-proof'});
assert.equal((await market(post,rpc)).proof,'https://example.com/local-proof');
await send(voter,post,'local sealed bid',[actions.functionCall('commit',{commitment:base64(commitment(voter.accountId,10n,price,salt))},80n*10n**12n,YOCTO)]);
async function fastForward(n:number){
 const block=async()=>{const r=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'local',method:'block',params:{finality:'final'}})});return (await r.json() as any).result;};
 const before=await block();
 const r=await fetch(rpc,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'local',method:'sandbox_fast_forward',params:{delta_height:n}})});
 const j:any=await r.json();assert.ok(!j.error,'sandbox fast-forward failed');
 for(let i=0;i<300;i++){if((await block()).header.height>=before.header.height+n)return;await new Promise(r=>setTimeout(r,100));}
 throw Error('Sandbox did not finalize the fast-forwarded height.');
}
for(let i=0;(await market(post,rpc)).phase==='commit';i++){assert.ok(i<20,'commit window did not advance');await fastForward(20);}
assert.equal((await market(post,rpc)).phase,'reveal');
await send(voter,post,'local reveal',[actions.functionCall('reveal',{amount:'10',max_price:price.toString(),salt},80n*10n**12n,0n)]);
for(let i=0;(await market(post,rpc)).phase==='reveal';i++){assert.ok(i<20,'reveal window did not advance');await fastForward(20);}
await send(voter,post,'local settle',[actions.functionCall('settle',{},150n*10n**12n,0n)]);
const before=await lifecycle(post,voter.accountId,rpc);assert.equal(before.holding,'10');assert.equal(before.refundYocto,(YOCTO-10n*price).toString());
await callBuilder(voter,'claim_refund');assert.equal((await lifecycle(post,voter.accountId,rpc)).refundYocto,'0');
assert.equal(lifecycleOptions(await lifecycle(post,voter.accountId,rpc)).claim_refund.eligible,false);
await callBuilder(voter,'vote_proof',{accepted:true});assert.equal((await lifecycle(post,voter.accountId,rpc)).voted,true);
assert.equal(lifecycleOptions(await lifecycle(post,voter.accountId,rpc)).vote_proof.eligible,false);
assert.equal(lifecycleOptions(await lifecycle(post,voter.accountId,rpc)).finalize_dare.eligible,false);
for(let i=0;!lifecycleOptions(await lifecycle(post,voter.accountId,rpc)).finalize_dare.eligible;i++){assert.ok(i<20,'dare deadline did not advance');await fastForward(50);}
await callBuilder(voter,'finalize_dare');assert.equal((await market(post,rpc)).dare_finalized,true);
assert.equal(lifecycleOptions(await lifecycle(post,voter.accountId,rpc)).finalize_dare.eligible,false);
const evidence={network:'local sandbox',test:'App lifecycle builders against the real contract',passedMethods:['submit_proof','claim_refund','vote_proof','finalize_dare'],factory,post,transactions:txs,at:new Date().toISOString()};
await mkdir(`${state}/evidence`,{recursive:true});await writeFile(`${state}/evidence/lifecycle.json`,JSON.stringify(evidence,null,2)+'\n');
console.log(JSON.stringify({result:'PASS',methods:4,transactions:txs.length,evidence:`${state}/evidence/lifecycle.json`}));
