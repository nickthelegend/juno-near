import test from 'node:test';
import assert from 'node:assert/strict';
import type { LifecycleSnapshot } from '@juno/sdk';
import { buildLifecycle, lifecycleOptions } from '../lib/lifecycle';
const s: LifecycleSnapshot = { accountId:'alice.testnet',creator:'alice.testnet',dare:'Do it',proof:'',settled:true,finalized:false,deadlineMs:300000,nowMs:200000,hasBid:true,refundYocto:'100',holding:'10',voted:false,bidders:[],votes:[],openedMs:0,darePayoutYocto:'0' };
test('lifecycle gates refunds, proof, votes and finalization by chain eligibility',()=>{
  assert.equal(lifecycleOptions(s).claim_refund.eligible,true);
  assert.equal(lifecycleOptions({...s,settled:false}).claim_refund.eligible,false);
  assert.equal(lifecycleOptions({...s,refundYocto:'0'}).claim_refund.eligible,false);
  assert.equal(lifecycleOptions({...s,hasBid:false}).claim_refund.eligible,false);
  assert.equal(lifecycleOptions({...s,accountId:null}).submit_proof.eligible,false);
  assert.equal(lifecycleOptions({...s,accountId:'bob.testnet'}).submit_proof.eligible,false);
  assert.equal(lifecycleOptions({...s,nowMs:300000}).submit_proof.eligible,false);
  for(const extra of [{settled:false},{holding:'0'},{voted:true},{nowMs:300000}])assert.equal(lifecycleOptions({...s,...extra}).vote_proof.eligible,false);
  assert.equal(lifecycleOptions(s).finalize_dare.eligible,false);
  assert.equal(lifecycleOptions({...s,nowMs:300000}).finalize_dare.eligible,true);
  assert.equal(lifecycleOptions({...s,nowMs:300000,finalized:true}).finalize_dare.eligible,false);
  for(const state of Object.values(lifecycleOptions({...s,dare:''})).slice(1))assert.equal(state.eligible,false);
});
test('app call builders enforce UTF-8 proof bounds, vote choices, zero deposits and exact args',()=>{
  const proof=buildLifecycle('post.testnet',s,'submit_proof',{proof:'  done  '});
  assert.deepEqual(proof.args,{proof:'done'});assert.equal(proof.deposit,'0');
  assert.throws(()=>buildLifecycle('post.testnet',s,'submit_proof',{proof:'🪙'.repeat(76)}),/UTF-8/);
  assert.throws(()=>buildLifecycle('post.testnet',s,'submit_proof',{proof:' '}));
  assert.throws(()=>buildLifecycle('post.testnet',s,'vote_proof',{}));
  assert.deepEqual(buildLifecycle('post.testnet',s,'vote_proof',{accepted:false}).args,{accepted:false});
  assert.deepEqual(buildLifecycle('post.testnet',s,'claim_refund').args,{});
  assert.deepEqual(buildLifecycle('post.testnet',{...s,nowMs:300000},'finalize_dare').args,{});
  assert.throws(()=>buildLifecycle('post.testnet',{...s,voted:true},'vote_proof',{accepted:true}),/already voted/);
});
test('a failed dare pays each holder only their own unclaimed bond share', () => {
  const final = { ...s, finalized: true, nowMs: 400000 };
  assert.equal(lifecycleOptions({ ...final, darePayoutYocto: '0' }).claim_dare.eligible, false);
  assert.equal(lifecycleOptions({ ...final, darePayoutYocto: '5' }).claim_dare.eligible, true);
  assert.equal(lifecycleOptions({ ...s, darePayoutYocto: '5' }).claim_dare.eligible, false);
  assert.equal(buildLifecycle('p.testnet', { ...final, darePayoutYocto: '5' }, 'claim_dare').methodName, 'claim_dare');
});
