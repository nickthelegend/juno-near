import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { Account, KeyPair, KeyPairSigner, JsonRpcProvider, actions, type Action, type KeyPairString } from 'near-api-js';
import { base64, commitment, market, view, YOCTO, TESTNET_RPC } from '@juno/sdk';

if(existsSync('.env')) process.loadEnvFile('.env');
const rpc=process.env.NEAR_TESTNET_RPC_URL || TESTNET_RPC;
const provider=new JsonRpcProvider({url:rpc});
const dir=join(process.cwd(),'.near-credentials');
const demo=process.argv.includes('--demo-namespace');
const keyPath=join(dir,demo?'demo-accounts.json':'players.json');
const artifact=join(process.cwd(),'packages/contract/target/near/juno_market.wasm');
const ZERO='11111111111111111111111111111111';
type Signer={id:string; secretKey:string};
type Tx={step:string; signer:string; receiver:string; hash:string};
const txs:Tx[]=[];
function account(s:Signer) { return new Account(s.id,provider,new KeyPairSigner(KeyPair.fromString(s.secretKey as KeyPairString))); }
async function existsOnChain(id:string):Promise<boolean>{try{await provider.query({request_type:'view_account',finality:'final',account_id:id});return true}catch(e){if(/does not exist|UNKNOWN_ACCOUNT/i.test(String(e)))return false;throw e}}
async function newAccount(prefix:string):Promise<Signer>{
  const id=`${prefix}-${Date.now().toString(36)}.testnet`;
  const key=KeyPair.fromRandom('ed25519');
  const response=await fetch('https://helper.nearprotocol.com/account',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({newAccountId:id,newAccountPublicKey:key.getPublicKey().toString()})});
  if(!response.ok) throw Error(`Faucet refused ${id}: HTTP ${response.status} ${(await response.text()).slice(0,200)}`);
  for(let i=0;i<30;i++){if(await existsOnChain(id))return{id,secretKey:key.toString()}; await new Promise(r=>setTimeout(r,1000));}
  throw Error(`Faucet response received but ${id} did not appear on testnet`);
}
async function signers():Promise<{root:Signer; players:Signer[]}>{
  await mkdir(dir,{recursive:true,mode:0o700});
  const saved: {root:Signer;players:Signer[]} | null=existsSync(keyPath)?JSON.parse(await readFile(keyPath,'utf8')):null;
  let root:Signer;
  if(saved)root=saved.root;
  else if(demo)root=await newAccount('juno-demo');
  else{
    const id=process.env.NEAR_TESTNET_ACCOUNT;
    const file=process.env.NEAR_TESTNET_KEY_FILE;
    if(!id||!file)throw Error('Setup required: NEAR_TESTNET_ACCOUNT, NEAR_TESTNET_KEY_FILE');
    const raw=(await readFile(file,'utf8')).trim();
    const parsed=raw.startsWith('{')?JSON.parse(raw):{secretKey:raw};
    root={id,secretKey:parsed.secretKey||parsed.private_key};
    if(!root.secretKey)throw Error('NEAR_TESTNET_KEY_FILE must contain a NEAR secret key');
  }
  if(!demo&&root.id!=='juno.testnet')throw Error('NEAR_TESTNET_ACCOUNT must be juno.testnet for the required named sub-account deployment. Use --demo-namespace for a separate live evidence run.');
  const rootState=await provider.query({request_type:'view_account',finality:'final',account_id:root.id}) as any;
  if(rootState.code_hash!==ZERO)throw Error(`${root.id} already has a contract; refusing to overwrite it`);
  const players:Signer[]=saved?.players ?? [];
  await writeFile(keyPath,JSON.stringify({root,players}),{mode:0o600});
  for(let i=1;i<=3;i++){
    if(!players[i-1]){
      const key=KeyPair.fromRandom('ed25519');
      players.push({id:`player${i}-${Date.now().toString(36)}.${root.id}`,secretKey:key.toString()});
      await writeFile(keyPath,JSON.stringify({root,players}),{mode:0o600});
    }
    const player=players[i-1];
    if(!(await existsOnChain(player.id))){
      const key=KeyPair.fromString(player.secretKey as KeyPairString);
      const result=await account(root).signAndSendTransaction({receiverId:player.id,actions:[actions.createAccount(),actions.transfer(10n*YOCTO),actions.addFullAccessKey(key.getPublicKey())],throwOnFailure:false,waitUntil:'FINAL'}) as any;
      if(result.status?.Failure)throw Error(`Player account creation failed: ${JSON.stringify(result.status.Failure)}`);
      txs.push({step:`create_player_${i}`,signer:root.id,receiver:player.id,hash:result.transaction.hash});
    }
  }
  return{root,players};
}
async function send(s:Signer,receiver:string,step:string,actionList:Action[]) {
  const result=await account(s).signAndSendTransaction({receiverId:receiver,actions:actionList,waitUntil:'FINAL',throwOnFailure:false}) as any;
  const status=result.status;
  if(status?.Failure)throw Error(`${step} failed on testnet: ${JSON.stringify(status.Failure)}`);
  const hash=result.transaction.hash as string;
  txs.push({step,signer:s.id,receiver,hash});
  await save({network:'testnet',status:'in_progress',factory:root.id,transactions:txs});
  let value:unknown;
  if(status?.SuccessValue){const bytes=Buffer.from(status.SuccessValue,'base64');if(bytes.length)value=JSON.parse(bytes.toString('utf8'));}
  return value;
}
function fc(method:string,args:object,deposit=0n,gas=250n*10n**12n){return actions.functionCall(method,args,gas,deposit)}
async function waitUntil(ms:number){const delay=ms-Date.now()+3000;if(delay>0)await new Promise(r=>setTimeout(r,delay));}
async function waitForMarket(accountId:string,predicate:(value:Awaited<ReturnType<typeof market>>)=>boolean){
  let last:Awaited<ReturnType<typeof market>>|undefined;
  for(let i=0;i<30;i++){
    try{last=await market(accountId,rpc);if(predicate(last))return last;}catch(e){if(i===29)throw e;}
    await new Promise(r=>setTimeout(r,1000));
  }
  throw Error(`Finalized market state did not reach expected condition for ${accountId}; last phase ${last?.phase||'unavailable'}`);
}
async function save(data:object){const date=new Date().toISOString().slice(0,10);const outputDir=join(process.cwd(),'deployments');await mkdir(outputDir,{recursive:true});await writeFile(join(outputDir,`testnet-${date}.json`),JSON.stringify(data,null,2)+'\n');}
const {root,players}=await signers();
const wasm=await readFile(artifact);
await send(root,root.id,'deploy_factory',[actions.deployContract(wasm),fc('init_factory',{},0n,30n*10n**12n)]);
await send(root,root.id,'upload_token_code',[fc('upload_code',{code:wasm.toString('base64')})]);
const slug=`opening-${Date.now().toString(36)}`;
const token=`${slug}.${root.id}`;
await send(players[0],root.id,'create_post',[fc('create_post',{slug,caption:'One moment, one redeemable market',media_url:'',dare:'Share a proof before the five-minute vote closes',dare_bond:'0'},4n*YOCTO)]);
const initial=await waitForMarket(token,m=>m.phase==='commit');
const bidSpecs=[{amount:50n,price:YOCTO/2000n},{amount:75n,price:YOCTO/2500n},{amount:100n,price:YOCTO/3333n}];
const salts=players.map(()=>crypto.randomUUID());
for(let i=0;i<3;i++){
  const spec=bidSpecs[i];
  await send(players[i],token,`commit_player_${i+1}`,[fc('commit',{commitment:base64(commitment(players[i].id,spec.amount,spec.price,salts[i]))},YOCTO)]);
}
await waitUntil(initial.commit_end_ms);
for(let i=0;i<3;i++){
  const spec=bidSpecs[i];
  await send(players[i],token,`reveal_player_${i+1}`,[fc('reveal',{amount:spec.amount.toString(),max_price:spec.price.toString(),salt:salts[i]},0n,80n*10n**12n)]);
}
await waitUntil(initial.reveal_end_ms);
await send(players[0],token,'settle',[fc('settle',{},0n,150n*10n**12n)]);
await waitForMarket(token,m=>m.phase==='curve');
for(let i=0;i<3;i++)await send(players[i],token,`refund_player_${i+1}`,[fc('claim_refund',{},0n,50n*10n**12n)]);
const firstQuote=BigInt(await view<string>(token,'quote_buy',{quantity:'10'},rpc));
await send(players[1],token,'curve_buy_10',[fc('buy',{quantity:'10'},firstQuote,100n*10n**12n)]);
await send(players[1],token,'curve_sell_10',[fc('sell',{quantity:'10'},0n,100n*10n**12n)]);
await waitForMarket(token,m=>m.curve_sold==='0');
const graduateQuote=BigInt(await view<string>(token,'quote_buy',{quantity:'800'},rpc));
await send(players[2],token,'curve_buy_800_graduate',[fc('buy',{quantity:'800'},graduateQuote,120n*10n**12n)]);
const final=await waitForMarket(token,m=>m.graduated);
if(!final.graduated)throw Error('Graduation transaction finalized but market did not graduate');
const data={network:'testnet',rpc,factory:root.id,token,namespace:demo?'demo (juno.testnet credential unavailable)':'required',players:players.map(p=>p.id),createdAt:new Date().toISOString(),market:final,transactions:txs};
await save(data);
console.log(JSON.stringify({factory:root.id,token,graduated:final.graduated,transactions:txs.map(t=>({step:t.step,hash:t.hash})),artifact:`deployments/testnet-${new Date().toISOString().slice(0,10)}.json`},null,2));
