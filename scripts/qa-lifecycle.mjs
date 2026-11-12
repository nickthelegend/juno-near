/** R3: real testnet eligibility, optional eligible writes, and existing-component browser QA. */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createReadStream,existsSync,statSync} from 'node:fs';
import {readFile,writeFile,mkdir,readdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join,resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {posts,lifecycle,market,formatNear} from '@juno/sdk';
import {lifecycleOptions,buildLifecycle,LIFECYCLE_METHODS} from '../packages/app/lib/lifecycle.ts';
import {QA_BUDGET,reserveQaBudget,validateQaTransaction} from '../packages/app/lib/qa-signer-policy.ts';
import {failureOf} from '../packages/app/lib/tx-status.ts';
delete process.env.DEBUG;delete process.env.PWDEBUG;
const {chromium}=await import('playwright-core');
const repo=process.cwd(),factory='juno-awkorp.testnet',rpc='https://near-testnet.drpc.org';
const out=process.env.JUNO_R3_SHOTS||'/Volumes/Extreme SSD/Projects/grokbot/orchestration/shots/juno-near/r3';
const buildDir=join(out,'build'),file=join(repo,'deployments',`r3-${new Date().toISOString().slice(0,10)}.json`);
const lock=process.env.CHROME_LOCK_MODULE||'/Volumes/Extreme SSD/Projects/grokbot/orchestration/chrome-lock.mjs';
const titles={claim_refund:'Claim auction refund',submit_proof:'Submit proof',vote_proof:'Vote on proof',finalize_dare:'Finalize dare'};
let ledger,run,server,who,expected;
const clean=s=>String(s).replace(/ed25519:[1-9A-HJ-NP-Za-km-z]+/g,'[redacted]');
const say=s=>process.stdout.write(clean(s)+'\n');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const persist=()=>writeFile(file,JSON.stringify(ledger,null,2)+'\n');
async function resources(disk=false){
 for(;;){const text=spawnSync('sh',['-c','memory_pressure | tail -1'],{encoding:'utf8'}).stdout;const match=/(\d+)%/.exec(text);assert.ok(match,'Cannot check memory');if(Number(match[1])>=30)break;say('Memory free below 30%; waiting.');await sleep(20000);}
 if(disk){const text=spawnSync('df',['-Pk','/System/Volumes/Data'],{encoding:'utf8'}).stdout;const fields=text.trim().split('\n').at(-1).split(/\s+/);assert.ok(Number(fields[3])>=5*1024*1024,'Stopped: disk free below 5 GB.');}
}
async function rpcRead(method,params){let last;for(const url of[rpc,'https://test.rpc.fastnear.com','https://rpc.testnet.near.org'])try{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'r3',method,params}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok||j.error)throw Error('Testnet read unavailable');return j.result}catch(e){last=e}throw last;}
async function snapshot(post,account){let last;for(const url of[rpc,'https://test.rpc.fastnear.com','https://rpc.testnet.near.org'])try{return await lifecycle(post,account,url)}catch(e){last=e}throw last;}
async function available(id){const [a,p]=await Promise.all([rpcRead('query',{request_type:'view_account',account_id:id,finality:'final'}),rpcRead('EXPERIMENTAL_protocol_config',{finality:'final'})]);return BigInt(a.amount)-BigInt(a.storage_usage)*BigInt(p.runtime_config.storage_amount_per_byte);}
function used(){return ledger.transactions.reduce((n,t)=>n+BigInt(t.spentUpperBoundYocto??t.reservedYocto),0n);}
async function authorize(call){
 assert.ok(expected,'Unexpected QA call');const c=validateQaTransaction({receiverId:call.receiverId,actions:[{type:'FunctionCall',params:call}]},who.id,factory);
 assert.equal(c.receiverId,expected.post);assert.equal(c.methodName,expected.method);assert.equal(c.deposit,'0');assert.deepEqual(c.args,expected.args);
 const fresh=await snapshot(c.receiverId,who.id);const step=buildLifecycle(c.receiverId,fresh,c.methodName,c.args);assert.equal(step.gas,c.gas);
 const price=BigInt((await rpcRead('gas_price',[null])).gas_price),reserve=reserveQaBudget(used(),0n,BigInt(c.gas),price)-used(),balance=await available(who.id);
 if(balance<10n**23n||balance<reserve+10n**22n)throw Error('Stopped: demo account is low; at least 0.1 available testnet NEAR and the gas reserve are required.');
 const id=ledger.transactions.length;ledger.transactions.push({accountId:who.id,post:c.receiverId,method:c.methodName,args:c.args,depositYocto:'0',gas:c.gas,availableBeforeYocto:balance.toString(),reservedYocto:reserve.toString(),status:'authorized'});await persist();return id;
}
async function report(event){const t=ledger.transactions[event.reservation];assert.ok(t);assert.match(event.hash,/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);if(t.hash)assert.equal(t.hash,event.hash);t.hash=event.hash;t.status=event.event;t.explorer=`https://testnet.nearblocks.io/txns/${event.hash}`;await persist();}
async function finalized(t){const r=await rpcRead('tx',{tx_hash:t.hash,sender_account_id:t.accountId,wait_until:'FINAL'});assert.equal(r.final_execution_status,'FINAL');assert.equal(failureOf(r),null);assert.equal(r.transaction.signer_id,t.accountId);assert.equal(r.transaction.receiver_id,t.post);const burnt=BigInt(r.transaction_outcome.outcome.tokens_burnt)+r.receipts_outcome.reduce((n,x)=>n+BigInt(x.outcome.tokens_burnt),0n);t.status='final';t.gasBurntYocto=burnt.toString();t.spentUpperBoundYocto=burnt.toString();ledger.spentUpperBoundYocto=used().toString();assert.ok(used()<=QA_BUDGET);await persist();}
async function build(qa){await resources(true);let log='';const env={...process.env,EXPO_NO_DOTENV:'1',EXPO_PUBLIC_QA_SIGNER:qa?'1':'0',EXPO_PUBLIC_JUNO_FACTORY:factory,EXPO_PUBLIC_NEAR_RPC_URL:rpc,EXPO_PUBLIC_RELAYER_URL:'',EXPO_PUBLIC_NEAR_MAINNET_ACCOUNT:'',NODE_OPTIONS:'--max-old-space-size=2048'};await new Promise((resolve,reject)=>{const child=spawn('pnpm',qa?['--filter','app','exec','expo','export','--platform','web','--output-dir',buildDir]:['web:export'],{cwd:repo,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>log+=b);child.stderr.on('data',b=>log+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error('Export failed; see R3 build log.')))}).finally(()=>writeFile(join(out,qa?'qa-export.log':'production-export.log'),clean(log)));}
async function scan(dir,qa){let found=false,count=0;async function walk(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=join(dir,entry.name);if(entry.isDirectory())await walk(path);else if(path.endsWith('.js')){count++;const text=await readFile(path,'utf8');if(/qa-signer|JUNO_QA_SIGNER_BUILD_ONLY|__JUNO_QA_SIGNER__|juno-qa-connected/.test(text))found=true;}}}await walk(dir);assert.equal(found,qa);assert.ok(count);return {javascriptFiles:count,qaSignerPresent:found};}
async function preview(){server=createServer((req,res)=>{let f=resolve(buildDir,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!f.startsWith(buildDir+sep)||!existsSync(f)||statSync(f).isDirectory())f=join(buildDir,'index.html');const types={'.js':'text/javascript','.html':'text/html','.css':'text/css','.webp':'image/webp','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.json':'application/json'};res.setHeader('Content-Type',types[extname(f)]||'application/octet-stream');createReadStream(f).pipe(res);});for(let port=5384;port<=5999;port++){if(spawnSync('lsof',['-t','-nP',`-iTCP:${port}`,'-sTCP:LISTEN'],{encoding:'utf8'}).stdout.trim())continue;await new Promise(r=>server.listen(port,'127.0.0.1',r));return `http://127.0.0.1:${port}`;}throw Error('No free preview port');}
async function shot(page,name,width,diag,extra={}){const state=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth-innerWidth,text:document.body.innerText,raw:/\b(undefined|NaN|ERR_[A-Z_]+)\b/.test(document.body.innerText),broken:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src)}));const nameOnly=`${run.id}-${name}-${width}.png`;await page.screenshot({path:join(out,nameOnly)});run.steps.push({name,width,screenshot:nameOnly,...extra,...state,diagnostics:structuredClone(diag)});await persist();assert.equal(state.overflow,0);assert.equal(state.raw,false);assert.equal(state.broken.length,0);assert.equal(diag.pageErrors.length,0);const external=diag.failed.every(r=>/near-testnet\.drpc\.org|test\.rpc\.fastnear\.com|rpc\.testnet\.near\.org/.test(r.url))&&diag.errors.every(e=>/Failed to load resource|blocked by CORS/.test(e));assert.ok((!diag.failed.length&&!diag.errors.length)||external,'Unrecovered browser error');diag.failed=[];diag.errors=[];say(`PASS ${width}: ${name}`);}
try{
 await mkdir(out,{recursive:true});ledger=JSON.parse(await readFile(file,'utf8'));assert.equal(ledger.sealed,false,'R3 evidence is sealed; do not overwrite it.');
 run={id:`after-${Date.now()}`,head:spawnSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).stdout.trim(),status:'building',steps:[],inventory:[]};ledger.runs.push(run);await persist();
 await build(false);run.productionIsolation=await scan(join(repo,'packages/app/dist'),false);await build(true);run.qaIsolation=await scan(buildDir,true);await persist();
 const base=await preview();run.preview=base;run.status='running';await persist();say(`R3 preview ${base}`);
 // Key file stays at its original path; only init-script memory receives it. No tracing/storage exports.
 let players;try{players=JSON.parse(await readFile(join(repo,'.near-credentials/seed.json'),'utf8')).players;}catch{throw Error('Cannot load repo demo accounts; credential contents suppressed.');}
 const accounts=await posts(factory,rpc),{withChromeLock}=await import(pathToFileURL(lock).href);
 await withChromeLock(async()=>{await resources();const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of[1440,375])for(const name of['kai','mira','oto']){
 who=players[name];assert.equal(who.id,`${name}.${factory}`);const context=await browser.newContext({viewport:{width,height:width===1440?900:812}});
 await context.exposeFunction('__JUNO_QA_AUTHORIZE__',authorize);await context.exposeFunction('__JUNO_QA_REPORT__',report);
 await context.addInitScript(data=>Object.defineProperty(window,'__JUNO_QA_SIGNER__',{value:data,configurable:true,writable:true}),{accountId:who.id,secretKey:who.secretKey,rpcUrl:rpc,factory});
 const page=await context.newPage(),diag={pageErrors:[],errors:[],failed:[]};page.setDefaultTimeout(60000);
 page.on('pageerror',e=>diag.pageErrors.push(clean(e.message)));page.on('console',m=>{if(m.type()==='error')diag.errors.push(clean(m.text()))});page.on('requestfailed',r=>diag.failed.push({url:r.url().split('?')[0],error:r.failure()?.errorText}));page.on('response',r=>{if(r.status()>=400)diag.failed.push({url:r.url().split('?')[0],status:r.status()})});
 if(name==='kai'){
 await page.goto(`${base}/coin/sprout.${factory}`);await page.getByRole('button',{name:'Buy',exact:true}).click();await page.getByRole('button',{name:'1',exact:true}).click();await page.getByText('Setup required: NEAR_MAINNET_ACCOUNT',{exact:true}).waitFor();await shot(page,'signed-out-buy-quote',width,diag);
 await page.goto(`${base}/coin/cap-toss.${factory}`);await page.getByText('This dare is already final.',{exact:true}).waitFor();await page.getByTestId('finalize_dare-reason').scrollIntoViewIfNeeded();await shot(page,'signed-out-dare',width,diag);
 }
 await page.goto(`${base}/profile`);await page.getByRole('button',{name:'Sign in',exact:true}).click();await page.getByRole('button',{name:'Connect NEAR wallet',exact:true}).click();await page.getByText(who.id,{exact:true}).first().waitFor();
 assert.ok(await page.evaluate(()=>window.__JUNO_QA_SIGNER__===undefined&&!Object.keys(localStorage).some(k=>/ed25519:/.test(localStorage.getItem(k)||''))))
 for(const post of accounts){
 await page.goto(`${base}/coin/${post}`);const snap=await snapshot(post,who.id),options=lifecycleOptions(snap);run.inventory.push({width,post,accountId:who.id,snapshot:snap,options});await persist();
 for(const method of LIFECYCLE_METHODS){
 if(!snap.dare&&method!=='claim_refund'){await page.getByText('This post has no dare.',{exact:true}).waitFor();continue;}
 if(!options[method].eligible){const reason=page.getByTestId(`${method}-reason`);await page.waitForFunction(({method,reason})=>document.querySelector(`[data-testid="${method}-reason"]`)?.textContent===reason,{method,reason:options[method].reason});await reason.scrollIntoViewIfNeeded();await shot(page,`${name}-${post.split('.')[0]}-${method}-reason`,width,diag,{reason:options[method].reason});continue;}
 const fresh=await snapshot(post,who.id);if(!lifecycleOptions(fresh)[method].eligible)continue;
 if(method==='submit_proof'&&!snap.proof&&!process.env.JUNO_R3_PROOF)throw Error('Proof is eligible but no genuine proof was supplied; set JUNO_R3_PROOF.');
 if(method==='vote_proof'&&!['true','false'].includes(process.env.JUNO_R3_ACCEPTED||''))throw Error('A live vote needs JUNO_R3_ACCEPTED=true or false.');
 const input=method==='submit_proof'?{proof:process.env.JUNO_R3_PROOF||snap.proof}:method==='vote_proof'?{accepted:process.env.JUNO_R3_ACCEPTED==='true'}:{};
 const step=buildLifecycle(post,fresh,method,input);expected={post,method,args:step.args};
 await page.getByRole('button',{name:titles[method],exact:true}).click();if(method==='submit_proof')await page.getByLabel('Proof text or URL').fill(input.proof);
 await shot(page,`${name}-${post.split('.')[0]}-${method}-sheet`,width,diag);
 await page.getByRole('button',{name:method==='vote_proof'?(input.accepted?'Accept proof':'Reject proof'):titles[method],exact:true}).last().click();await page.getByRole('button',{name:'Done',exact:true}).waitFor({timeout:120000});
 const tx=ledger.transactions.at(-1);await finalized(tx);const text=await page.locator('body').innerText();assert.ok(text.includes(tx.hash.slice(0,10))&&text.includes(tx.hash.slice(-8)));await shot(page,`${name}-${post.split('.')[0]}-${method}-receipt`,width,diag,{hash:tx.hash});await page.getByRole('button',{name:'Done',exact:true}).click();expected=null;
 }
 if(!snap.dare){await page.getByText('This post has no dare.',{exact:true}).scrollIntoViewIfNeeded();await shot(page,`${name}-${post.split('.')[0]}-no-dare`,width,diag);}
 if(post.startsWith('sprout.')){await page.getByRole('button',{name:'Buy',exact:true}).click();await page.getByRole('button',{name:'1',exact:true}).click();await page.getByText('Setup required: NEAR_MAINNET_ACCOUNT',{exact:true}).waitFor();await shot(page,`${name}-buy-quote`,width,diag);}
 }
 await context.close();
 }
 }finally{await browser.close();}});
 run.status='pass';run.completedAt=new Date().toISOString();ledger.spentUpperBoundYocto=used().toString();await persist();say(`PASS: R3 eligibility and UI. Testnet spend ceiling ${formatNear(used(),8)} NEAR.`);
}catch(e){if(run){run.status='failed';run.failure=clean(e.message);await persist();}say(`FAIL: ${clean(e.message)}`);process.exitCode=1;}finally{if(server?.listening)await new Promise(r=>server.close(r));}
