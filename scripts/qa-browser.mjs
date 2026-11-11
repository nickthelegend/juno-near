/** Real browser transactions. No traces, HARs, videos, storage-state exports or key logs. */
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { balanceOf, formatNear, market, quoteBuy } from '@juno/sdk';
import { QA_BUDGET, reserveQaBudget, testnetAccount, testnetRpc, validateQaTransaction } from '../packages/app/lib/qa-signer-policy.ts';
import { failureOf } from '../packages/app/lib/tx-status.ts';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const scratch = '/private/tmp/claude-501/-Volumes-Extreme-SSD-Projects-grokbot/0f121b7c-0081-4ec0-81a9-0ccb4f7f8b48/scratchpad';
const output = join(scratch, 'flow-qa', 'juno-near', 'qa-signer');
const qaBuild = join(output, 'build');
const rpcUrl = testnetRpc(process.env.JUNO_QA_RPC || 'https://near-testnet.drpc.org');
const factory = process.env.JUNO_QA_FACTORY || 'juno-awkorp.testnet';
const post = `${process.env.JUNO_QA_POST || 'sprout'}.${factory}`;
const playerName = process.env.JUNO_QA_PLAYER || 'kai';
const widths=(process.env.JUNO_QA_WIDTHS || '1440,375').split(',').map(Number);
assert.ok(widths.length>0 && widths.every(w=>[1440,375].includes(w)) && new Set(widths).size===widths.length,'QA widths must be 1440, 375, or both.');
const keyFile = resolve(repo, process.env.JUNO_QA_PLAYER_FILE || '.near-credentials/seed.json');
const lockFile = process.env.CHROME_LOCK_MODULE || join(scratch, 'chrome-lock.mjs');
const date = new Date().toISOString().slice(0, 10);
const evidenceFile = join(repo, 'deployments', `qa-browser-${date}.json`);
// Playwright debug logging can serialize init-script arguments; it must never see credentials.
delete process.env.DEBUG;
delete process.env.PWDEBUG;
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_CORE || 'playwright-core');
let server, activePage, player, currentRun, expectedCall, ledger;
let stage = 'preflight';
const allLedgers = [];
const clean = value => String(value).replace(/ed25519:[1-9A-HJ-NP-Za-km-z]+/g, '[redacted]');
const say = value => process.stdout.write(`${clean(value)}\n`);
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function rpc(method, params) {
  const endpoints=[...new Set([rpcUrl,'https://test.rpc.fastnear.com','https://rpc.testnet.near.org'])];
  let last='unavailable';
  for(let attempt=0;attempt<endpoints.length+1;attempt++){
    try{
      const response=await fetch(endpoints[attempt%endpoints.length],{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'qa-browser',method,params}),signal:AbortSignal.timeout(15000)});
      if(!response.ok)throw Error(`HTTP ${response.status}`);
      const json=await response.json();
      if(json.error)throw Error(json.error.cause?.name||json.error.name||'RPC error');
      return json.result;
    }catch(error){last=clean(error instanceof Error?error.message:'network error');if(attempt<endpoints.length)await sleep(500*(attempt+1));}
  }
  throw Error(`Testnet read failed after retries (${last}).`);
}
async function available() {
  const [account, protocol] = await Promise.all([rpc('query', {request_type:'view_account',finality:'final',account_id:player.id}), rpc('EXPERIMENTAL_protocol_config', {finality:'final'})]);
  return BigInt(account.amount) - BigInt(account.storage_usage) * BigInt(protocol.runtime_config.storage_amount_per_byte);
}
async function persist() { await writeFile(evidenceFile, `${JSON.stringify(ledger, null, 2)}\n`); }
function usage() {
  return allLedgers.flatMap(l => l.runs || []).flatMap(r => r.reservations || []).reduce((total, r) => total + BigInt(r.spentUpperBoundYocto ?? r.reservedYocto), 0n);
}
async function authorize(call) {
  const checked = validateQaTransaction({receiverId:call.receiverId,actions:[{type:'FunctionCall',params:{...call}}]}, player.id, factory);
  assert.ok(expectedCall, 'Unexpected QA transaction request');
  assert.equal(checked.receiverId,post); assert.equal(checked.methodName,expectedCall.method);
  assert.deepEqual(checked.args,{quantity:String(expectedCall.quantity)});
  const price = BigInt((await rpc('gas_price',[null])).gas_price);
  const deposit = BigInt(checked.deposit), gas = BigInt(checked.gas);
  const used = usage();
  const next = reserveQaBudget(used,deposit,gas,price);
  const reserve = next-used;
  if (await available() < reserve + 10n**22n) throw Error('Stopped: testnet account is too low for this call and its gas reserve.');
  const id = currentRun.reservations.length;
  currentRun.reservations.push({id,width:expectedCall.width,method:checked.methodName,receiver:checked.receiverId,args:checked.args,depositYocto:checked.deposit,gas:checked.gas,gasPrice:price.toString(),reservedYocto:reserve.toString(),status:'authorized'});
  await persist();
  return id;
}
async function report(event) {
  const reservation = currentRun.reservations[event.reservation];
  assert.ok(reservation, 'Unknown QA reservation');
  assert.match(event.hash,/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
  if (reservation.hash) assert.equal(reservation.hash,event.hash);
  reservation.hash = event.hash;
  reservation.explorer = `https://testnet.nearblocks.io/txns/${event.hash}`;
  reservation.status = event.event;
  await persist();
}
async function finalize(reservation) {
  const result = await rpc('tx',{tx_hash:reservation.hash,sender_account_id:player.id,wait_until:'FINAL'});
  assert.equal(result.final_execution_status,'FINAL');
  assert.equal(result.transaction.signer_id,player.id);
  assert.equal(result.transaction.receiver_id,post);
  assert.equal(failureOf(result),null,'On-chain function call failed');
  const burnt = BigInt(result.transaction_outcome.outcome.tokens_burnt) + result.receipts_outcome.reduce((n,r)=>n+BigInt(r.outcome.tokens_burnt),0n);
  reservation.status='final'; reservation.finalExecutionStatus='FINAL'; reservation.gasBurntYocto=burnt.toString();
  reservation.spentUpperBoundYocto=(BigInt(reservation.depositYocto)+burnt).toString();
  assert.ok(BigInt(reservation.spentUpperBoundYocto)<=BigInt(reservation.reservedYocto));
  assert.ok(usage()<=QA_BUDGET);
  await persist();
}
async function memory() {
  for (;;) {
    const result=spawnSync('sysctl',['vm.swapusage'],{encoding:'utf8'});
    if(result.status!==0) throw Error('Cannot check swap before building.');
    const match=/free = ([\d.]+)([MG])/.exec(result.stdout);
    if(!match) throw Error('Cannot parse swap availability.');
    const free=Number(match[1])*(match[2]==='G'?1024:1);
    say(`Swap free before build: ${free} MB`);
    if(free>=500)return;
    say('Swap free is below 500 MB; waiting two minutes.');
    for(let i=0;i<6;i++) await sleep(20000);
  }
}
async function build(qa) {
  await memory();
  const log=join(output,qa?'qa-export.log':'production-export.log');
  const env={...process.env,EXPO_NO_DOTENV:'1',EXPO_PUBLIC_QA_SIGNER:qa?'1':'0',EXPO_PUBLIC_JUNO_FACTORY:factory,EXPO_PUBLIC_NEAR_RPC_URL:rpcUrl,EXPO_PUBLIC_RELAYER_URL:'',EXPO_PUBLIC_NEAR_MAINNET_ACCOUNT:'',EXPO_PUBLIC_APP_URL:'',NODE_OPTIONS:'--max-old-space-size=2048'};
  const args=qa?['--filter','app','exec','expo','export','--platform','web','--output-dir',qaBuild]:['web:export'];
  // Child output contains build diagnostics only; credentials are never passed as environment/CLI values.
  let text='';
  await new Promise((resolve,reject)=>{const child=spawn('pnpm',args,{cwd:repo,env,stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>{text+=b});child.stderr.on('data',b=>{text+=b});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(Error(`Export failed (${code}); see ${log}`)));}).finally(()=>writeFile(log,clean(text)));
}
async function jsFiles(dir) {
  const files=[];for(const item of await readdir(dir,{withFileTypes:true})){const file=join(dir,item.name);if(item.isDirectory())files.push(...await jsFiles(file));else if(file.endsWith('.js'))files.push(file);}return files;
}
async function isolation(dir,qa) {
  const markers=['qa-signer','JUNO_QA_SIGNER_BUILD_ONLY','__JUNO_QA_SIGNER__','juno-qa-connected','QA signer'];
  const files=await jsFiles(dir);assert.ok(files.length);
  const hash=createHash('sha256');let found=false;
  for(const file of files.sort()){const content=await readFile(file,'utf8');hash.update(content);for(const marker of markers){if(content.includes(marker)){found=true;if(!qa)throw Error(`Production bundle contains QA marker: ${marker}`);}}}
  assert.equal(found,qa,qa?'QA adapter was not bundled':'QA adapter leaked into production');
  return {javascriptFiles:files.length,qaAdapterPresent:found,sha256:hash.digest('hex')};
}
async function preview() {
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ttf':'font/ttf','.woff2':'font/woff2','.ico':'image/x-icon'};
  server=createServer((req,res)=>{let file=resolve(qaBuild,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!file.startsWith(qaBuild+sep)||!existsSync(file)||statSync(file).isDirectory())file=join(qaBuild,'index.html');res.setHeader('Content-Type',types[extname(file)]||'application/octet-stream');createReadStream(file).pipe(res);});
  for(let port=5383;port<=5999;port++){
    const check=spawnSync('lsof',['-t','-nP',`-iTCP:${port}`,'-sTCP:LISTEN'],{encoding:'utf8'});if(check.stdout?.trim())continue;
    try{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(port,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});return `http://127.0.0.1:${port}`;}catch(e){if(e.code!=='EADDRINUSE')throw e;}
  }
  throw Error('No free QA port in the allowed range.');
}
async function screenshot(page,name,width,diagnostics,extra={}) {
  const state=await page.evaluate(()=>({text:document.body.innerText,overflow:document.documentElement.scrollWidth-innerWidth,suspicious:/undefined|NaN|Server error|ERR_[A-Z_]+/.test(document.body.innerText),brokenImages:[...document.images].filter(i=>i.complete&&!i.naturalWidth).map(i=>i.src)}));
  const file=join(output,`${currentRun.id}-${name}-${width}.png`);
  await page.screenshot({path:file,fullPage:true});
  const recoveredRpcIssues=diagnostics.failedRequests.length>0 && diagnostics.failedRequests.every(r=>{
    try{return ['https://near-testnet.drpc.org','https://test.rpc.fastnear.com','https://rpc.testnet.near.org'].includes(new URL(r.url).origin) && (r.status===408||r.status===429||r.status>=500||!!r.error)}catch{return false}
  }) && diagnostics.consoleErrors.every(message=>/Failed to load resource|Access to fetch .* blocked by CORS/.test(message));
  const row={step:name,width,screenshot:file,...state,...diagnostics,recoveredRpcIssues,...extra};
  currentRun.steps.push(row);await persist();
  assert.equal(state.overflow,0,'Horizontal overflow');assert.equal(state.suspicious,false,'Raw error text');assert.equal(state.brokenImages.length,0,'Broken images');assert.equal(diagnostics.pageErrors.length,0,'Page errors');if(!recoveredRpcIssues){assert.equal(diagnostics.consoleErrors.length,0,'Console errors');assert.equal(diagnostics.failedRequests.length,0,'Failed requests');}else{say(`Recovered testnet RPC issue at ${name}; retained in evidence.`);}
  diagnostics.pageErrors=[];diagnostics.consoleErrors=[];diagnostics.failedRequests=[];
  say(`PASS ${width}: ${name}`);
}
async function runBrowser(base) {
  const {withChromeLock}=await import(pathToFileURL(lockFile).href);
  await withChromeLock(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
    for(const width of widths){
      stage=`${width}: startup`;
      const context=await browser.newContext({viewport:{width,height:width===1440?900:812},deviceScaleFactor:1});
      await context.exposeFunction('__JUNO_QA_AUTHORIZE__',authorize);await context.exposeFunction('__JUNO_QA_REPORT__',report);
      // The only browser transfer of the key is this in-memory init-script argument. Never export the context.
      await context.addInitScript(input=>Object.defineProperty(window,'__JUNO_QA_SIGNER__',{value:input,writable:true,configurable:true}),{accountId:player.id,secretKey:player.secretKey,rpcUrl,factory});
      const page=await context.newPage();activePage=page;
      const diagnostics={pageErrors:[],consoleErrors:[],failedRequests:[]};
      page.on('pageerror',e=>diagnostics.pageErrors.push(clean(e.message)));
      page.on('console',m=>{if(m.type()==='error')diagnostics.consoleErrors.push(clean(m.text()))});
      page.on('requestfailed',r=>diagnostics.failedRequests.push({url:r.url().split('?')[0],error:r.failure()?.errorText}));
      page.on('response',r=>{if(r.status()>=400)diagnostics.failedRequests.push({url:r.url().split('?')[0],status:r.status()})});
      page.setDefaultTimeout(45000);
      const baseline=BigInt(await balanceOf(post,player.id,rpcUrl));
      await page.goto(base);await page.getByRole('link',{name:'Open app',exact:true}).waitFor();await screenshot(page,'landing',width,diagnostics);
      await page.getByRole('link',{name:'Open app',exact:true}).click();await page.waitForURL('**/social');
      await page.getByRole('tab',{name:'Profile',exact:true}).click();await page.getByRole('button',{name:'Sign in',exact:true}).click();await screenshot(page,'signin',width,diagnostics);
      await page.getByRole('button',{name:'Connect NEAR wallet',exact:true}).click();await page.getByText(player.id,{exact:true}).first().waitFor();
      assert.equal(await page.evaluate(()=>window.__JUNO_QA_SIGNER__===undefined),true);
      assert.equal(await page.evaluate(()=>Object.keys(localStorage).some(k=>/ed25519:/.test(localStorage.getItem(k)||''))),false,'QA key persisted in localStorage');
      await page.getByText(`${Number(baseline).toFixed(2)} $${process.env.JUNO_QA_POST?.toUpperCase()||'SPROUT'}`,{exact:true}).waitFor();
      await screenshot(page,'connected-profile',width,diagnostics,{tokenBalance:baseline.toString()});
      await page.getByRole('tab',{name:'Trade',exact:true}).click();await page.getByText('Traders',{exact:true}).click();await page.waitForTimeout(1800);await screenshot(page,'connected-traders',width,diagnostics);await page.getByRole('tab',{name:'Profile',exact:true}).click();
      for(const [method,quantity,delta] of [['buy',2,2n],['sell',1,1n],['redeem',1,0n]]){
        stage=`${width}: ${method}`;
        await page.getByRole('tab',{name:'Social',exact:true}).click();await page.waitForURL('**/social');
        const title=page.getByText(`${process.env.JUNO_QA_POST?process.env.JUNO_QA_POST[0].toUpperCase()+process.env.JUNO_QA_POST.slice(1):'Sprout'} $${process.env.JUNO_QA_POST?.toUpperCase()||'SPROUT'}`,{exact:true});
        await title.scrollIntoViewIfNeeded();await title.click();await page.waitForURL(`**/coin/${post}`);
        await page.getByRole('button',{name:'Buy',exact:true}).click();
        const label=method[0].toUpperCase()+method.slice(1);
        if(method!=='buy')await page.getByRole('button',{name:label,exact:true}).click();
        await page.getByRole('button',{name:String(quantity),exact:true}).click();
        const confirm=page.getByRole('button',{name:label,exact:true}).last();
        await confirm.waitFor();await screenshot(page,`${method}-quote`,width,diagnostics);
        expectedCall={method,quantity,width};const count=currentRun.reservations.length;
        await confirm.click();
        await page.getByRole('button',{name:'Done',exact:true}).waitFor({timeout:90000});
        assert.equal(currentRun.reservations.length,count+1);
        const reservation=currentRun.reservations.at(-1);await finalize(reservation);
        const receipt=await page.locator('body').innerText();assert.ok(receipt.includes(reservation.hash.slice(0,10))&&receipt.includes(reservation.hash.slice(-8)),'Receipt does not match submitted transaction');
        const held=BigInt(await balanceOf(post,player.id,rpcUrl));assert.equal(held,baseline+delta);
        reservation.positionAfter=held.toString();await persist();
        await screenshot(page,`${method}-receipt`,width,diagnostics,{hash:reservation.hash,tokenBalance:held.toString()});
        await page.getByRole('button',{name:'Done',exact:true}).click();
        await page.getByRole('button').first().click();await page.waitForURL('**/social');
        await page.getByRole('tab',{name:'Profile',exact:true}).click();
        const position=page.getByText(`${Number(held).toFixed(2)} $${process.env.JUNO_QA_POST?.toUpperCase()||'SPROUT'}`,{exact:true});
        stage=`${width}: ${method} profile update`;
        try{await position.waitFor({timeout:30000});await position.scrollIntoViewIfNeeded();}
        catch{await screenshot(page,`${method}-profile-stale`,width,diagnostics,{expectedTokenBalance:held.toString()});throw Error(`Profile did not reflect the real ${method} (${reservation.hash}) without a reload.`);}
        reservation.profileVerified=true;await screenshot(page,`${method}-profile`,width,diagnostics,{tokenBalance:held.toString()});
      }
      await page.getByText('About',{exact:true}).click();await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.getByText('No wallet yet',{exact:true}).waitFor();await screenshot(page,'signed-out',width,diagnostics);
      await context.close();activePage=null;
    }
  }finally{await browser.close();activePage=null;}});
}

try {
  await mkdir(output,{recursive:true});testnetAccount(factory);testnetAccount(post);
  if(!keyFile.startsWith(join(repo,'.near-credentials')+sep))throw Error('Use an existing key file under this repo’s .near-credentials directory.');
  try{const data=JSON.parse(await readFile(keyFile,'utf8'));player=data.players?.[playerName];if(!player?.id||!player.secretKey)throw Error();}catch{throw Error('Could not read the funded demo player file; credential contents are suppressed.');}
  testnetAccount(player.id);
  for(const name of await readdir(join(repo,'deployments'))){if(!/^qa-browser-\d{4}-\d{2}-\d{2}\.json$/.test(name))continue;const data=JSON.parse(await readFile(join(repo,'deployments',name),'utf8'));allLedgers.push(data);if(join(repo,'deployments',name)===evidenceFile)ledger=data;}
  if(!ledger){ledger={network:'testnet',budgetNEAR:'0.3',runs:[]};allLedgers.push(ledger);}
  const state=await market(post,rpcUrl);assert.equal(state.phase,'curve','Pick a post with an open curve');
  const balance=await available();if(balance<10n**23n)throw Error(`Stopped: ${player.id} has only ${formatNear(balance,6)} available testnet NEAR; at least 0.1 is required. No spending attempted.`);
  const quote=await quoteBuy(post,2n,rpcUrl);assert.ok(quote<10n**22n,'Buy quote too large for the QA run');
  const gasPrice=BigInt((await rpc('gas_price',[null])).gas_price);reserveQaBudget(usage(),quote,100n*10n**12n,gasPrice);
  currentRun={id:randomUUID(),at:new Date().toISOString(),gitHead:spawnSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).stdout.trim(),accountId:player.id,factory,post,rpc:rpcUrl,availableBeforeYocto:balance.toString(),status:'building',reservations:[],steps:[]};ledger.runs.push(currentRun);await persist();
  say(`Preflight: ${player.id}, ${formatNear(balance,6)} available testnet NEAR, 2-token deposit ${formatNear(quote,8)}. Shared cap 0.3 NEAR.`);
  stage='production build';await build(false);currentRun.productionIsolation=await isolation(join(repo,'packages/app/dist'),false);await persist();
  stage='QA build';await build(true);currentRun.qaIsolation=await isolation(qaBuild,true);await persist();
  const base=await preview();currentRun.preview=base;currentRun.status='running';await persist();say(`QA preview: ${base}`);
  await runBrowser(base);currentRun.status='pass';currentRun.completedAt=new Date().toISOString();currentRun.spentUpperBoundYocto=currentRun.reservations.reduce((n,r)=>n+BigInt(r.spentUpperBoundYocto||0),0n).toString();await persist();
  say(`PASS: real browser buy, sell, redemption and profile updates at both widths. Conservative spend ${formatNear(BigInt(currentRun.spentUpperBoundYocto),8)} testnet NEAR. Evidence: ${evidenceFile}`);
} catch(error) {
  if(currentRun){currentRun.status='failed';currentRun.failedStage=stage;currentRun.failure=clean(error instanceof Error?error.message:'QA test failed');await persist();}
  say(`FAIL at ${stage}: ${clean(error instanceof Error?error.message:'QA test failed')}`);process.exitCode=1;
} finally {if(server?.listening)await new Promise(resolve=>server.close(resolve));}
