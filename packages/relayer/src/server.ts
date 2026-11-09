import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { deserialize } from 'borsh';
import { Account, KeyPair, KeyPairSigner, JsonRpcProvider, PublicKey, SCHEMA, actions, type Action, type KeyPairString, type SignedDelegate } from 'near-api-js';
import { TESTNET_RPC, YOCTO } from '@juno/sdk';
import { allowedDelegate } from './policy.js';

if(existsSync('.env'))process.loadEnvFile('.env');
const factory=process.env.JUNO_FACTORY_ACCOUNT;
const relayerId=process.env.RELAYER_ACCOUNT;
const keyFile=process.env.RELAYER_KEY_FILE;
const emailKey=process.env.EMAIL_PROVIDER_API_KEY;
const emailFrom=process.env.EMAIL_FROM;
const authSecret=process.env.AUTH_SECRET;
const origin=process.env.WEB_ORIGIN||'http://127.0.0.1:8091';
const provider=new JsonRpcProvider({url:process.env.NEAR_TESTNET_RPC_URL||TESTNET_RPC});
const dbPath=join(process.cwd(),'.near-credentials','email-users.json');
type User={accountId:string;recoverySecretKey:string};
let users:Record<string,User>=existsSync(dbPath)?JSON.parse(await readFile(dbPath,'utf8')):{};
const challenges=new Map<string,{digest:Buffer;expires:number;attempts:number}>();
const requests=new Map<string,{count:number;reset:number}>();
const relayCounts=new Map<string,{count:number;reset:number}>();
let relayer:Account|null=null;
if(relayerId&&keyFile){
  if(!relayerId.endsWith('.testnet'))throw Error('RELAYER_ACCOUNT must be a testnet account');
  const raw=(await readFile(keyFile,'utf8')).trim();
  const parsed=raw.startsWith('{')?JSON.parse(raw):{secretKey:raw};
  const secret=parsed.secretKey||parsed.private_key;
  if(!secret)throw Error('RELAYER_KEY_FILE contains no secret key');
  relayer=new Account(relayerId,provider,new KeyPairSigner(KeyPair.fromString(secret as KeyPairString)));
}
function identity(email:string):string{return createHmac('sha256',authSecret||'missing').update(email.trim().toLowerCase()).digest('hex');}
function otpDigest(id:string,code:string):Buffer{return createHmac('sha256',authSecret||'missing').update(`${id}:${code}`).digest();}
function limited(map:Map<string,{count:number;reset:number}>,key:string,max:number):boolean{
  const now=Date.now(); const old=map.get(key);const state=!old||old.reset<now?{count:0,reset:now+3600_000}:old;
  state.count++;map.set(key,state);return state.count<=max;
}
async function persist(){await mkdir(join(process.cwd(),'.near-credentials'),{recursive:true,mode:0o700});await writeFile(dbPath,JSON.stringify(users),{mode:0o600});}
function json(res:ServerResponse,status:number,body:object){res.writeHead(status,{'Content-Type':'application/json','Access-Control-Allow-Origin':origin,'Vary':'Origin'});res.end(JSON.stringify(body));}
async function body(req:IncomingMessage):Promise<any>{let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>8192)throw Error('Request too large');}return JSON.parse(raw||'{}');}
function requireSetup(...names:string[]):string|undefined{return names.find(n=>!process.env[n]);}
async function sendTx(from:Account,receiverId:string,actionList:Action[]):Promise<string>{
  const result=await from.signAndSendTransaction({receiverId,actions:actionList,throwOnFailure:false,waitUntil:'FINAL'}) as any;
  if(result.status?.Failure)throw Error(`Chain rejected transaction: ${JSON.stringify(result.status.Failure)}`);
  return result.transaction.hash;
}
async function handler(req:IncomingMessage,res:ServerResponse){
  if(req.headers.origin&&req.headers.origin!==origin){json(res,403,{error:'Origin denied'});return;}
  if(req.method==='OPTIONS'){res.writeHead(204,{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});res.end();return;}
  if(req.method==='GET'&&req.url==='/health'){json(res,200,{network:'testnet',ready:!!(factory&&relayer&&emailKey&&emailFrom&&authSecret)});return;}
  if(req.method!=='POST'){json(res,404,{error:'Unknown route'});return;}
  const ip=req.socket.remoteAddress||'unknown';
  try{
    if(req.url==='/auth/request'){
      const missing=requireSetup('EMAIL_PROVIDER_API_KEY','EMAIL_FROM','AUTH_SECRET','RELAYER_ACCOUNT','RELAYER_KEY_FILE','JUNO_FACTORY_ACCOUNT');
      if(missing){json(res,503,{error:`Setup required: ${missing}`});return;}
      const data=await body(req);const email=String(data.email||'').trim().toLowerCase();
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>160){json(res,400,{error:'Invalid email'});return;}
      const id=identity(email);
      if(!limited(requests,`${ip}:${id}`,5)){json(res,429,{error:'Too many requests'});return;}
      const code=String(randomInt(100000,1000000));
      const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${emailKey}`,'Content-Type':'application/json'},body:JSON.stringify({from:emailFrom,to:[email],subject:'Your Juno sign-in code',text:`Your Juno code is ${code}. It expires in 10 minutes.`})});
      if(!response.ok){json(res,502,{error:`Email provider HTTP ${response.status}`});return;}
      challenges.set(id,{digest:otpDigest(id,code),expires:Date.now()+600_000,attempts:0});
      json(res,200,{sent:true});return;
    }
    if(req.url==='/auth/verify'){
      const missing=requireSetup('EMAIL_PROVIDER_API_KEY','AUTH_SECRET','RELAYER_ACCOUNT','RELAYER_KEY_FILE','JUNO_FACTORY_ACCOUNT');
      if(missing||!relayer||!relayerId){json(res,503,{error:`Setup required: ${missing||'RELAYER_ACCOUNT'}`});return;}
      const data=await body(req);const email=String(data.email||'').trim().toLowerCase();const code=String(data.code||'');const publicKey=String(data.publicKey||'');
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||!/^[0-9]{6}$/.test(code)){json(res,400,{error:'Invalid email or code'});return;}
      let pk:PublicKey;try{pk=PublicKey.fromString(publicKey);}catch{json(res,400,{error:'Invalid public key'});return;}
      const id=identity(email);const challenge=challenges.get(id);
      if(!challenge||challenge.expires<Date.now()||challenge.attempts++>=5||!timingSafeEqual(challenge.digest,otpDigest(id,code))){json(res,401,{error:'Invalid or expired code'});return;}
      challenges.delete(id);
      const accountId=`u${id.slice(0,20)}.${relayerId}`;
      if(accountId.length>64){json(res,400,{error:'RELAYER_ACCOUNT too long for player sub-accounts'});return;}
      let user=users[id];let hash:string;
      if(!user){const recovery=KeyPair.fromRandom('ed25519');user={accountId,recoverySecretKey:recovery.toString()};users[id]=user;await persist();}
      let onChain=false;
      try{await provider.query({request_type:'view_account',finality:'final',account_id:accountId});onChain=true;}catch(e){if(!/does not exist|UNKNOWN_ACCOUNT/i.test(String(e)))throw e;}
      if(!onChain){
        const recovery=KeyPair.fromString(user.recoverySecretKey as KeyPairString);
        const result=await relayer.signAndSendTransaction({receiverId:accountId,actions:[actions.createAccount(),actions.transfer(10n*YOCTO),actions.addFullAccessKey(pk),actions.addFullAccessKey(recovery.getPublicKey())],throwOnFailure:false,waitUntil:'FINAL'}) as any;
        if(result.status?.Failure)throw Error(`Account creation rejected: ${JSON.stringify(result.status.Failure)}`);
        hash=result.transaction.hash;
      }else{
        const child=new Account(accountId,provider,new KeyPairSigner(KeyPair.fromString(user.recoverySecretKey as KeyPairString)));
        hash=await sendTx(child,accountId,[actions.addFullAccessKey(pk)]);
      }
      json(res,200,{accountId,transactionHash:hash});return;
    }
    if(req.url==='/relay'){
      const missing=requireSetup('RELAYER_ACCOUNT','RELAYER_KEY_FILE','JUNO_FACTORY_ACCOUNT');
      if(missing||!factory||!relayer){json(res,503,{error:`Setup required: ${missing||'RELAYER_ACCOUNT'}`});return;}
      const data=await body(req);const encoded=String(data.signedDelegate||'');
      if(encoded.length>12000){json(res,400,{error:'Delegation too large'});return;}
      const signed=deserialize(SCHEMA.SignedDelegate,Buffer.from(encoded,'base64')) as unknown as SignedDelegate;
      const ids=new Set(Object.values(users).map(u=>u.accountId));
      if(!allowedDelegate(signed,factory,ids)){json(res,403,{error:'Delegated action outside Juno allowlist'});return;}
      if(!limited(relayCounts,`${ip}:${signed.delegateAction.senderId}`,40)){json(res,429,{error:'Relayer rate limit'});return;}
      const outcome=await relayer.relayMetaTransaction(signed) as any;
      if(outcome.status?.Failure){json(res,400,{error:'Chain rejected delegated action',transactionHash:outcome.transaction?.hash});return;}
      json(res,200,{transactionHash:outcome.transaction.hash,signer:signed.delegateAction.senderId,receiver:signed.delegateAction.receiverId});return;
    }
    json(res,404,{error:'Unknown route'});
  }catch(e){json(res,400,{error:e instanceof Error?e.message:String(e)});}
}
const port=Number(process.env.RELAYER_PORT||8787);
const host=process.env.RELAYER_HOST||'127.0.0.1';
createServer((req,res)=>{void handler(req,res);}).listen(port,host,()=>{process.stdout.write(`Juno relayer listening on http://${host}:${port}\n`);});
