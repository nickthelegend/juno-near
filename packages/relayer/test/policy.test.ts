import test from 'node:test';
import assert from 'node:assert/strict';
import type { SignedDelegate } from 'near-api-js';
import { YOCTO } from '@juno/sdk';
import { allowedDelegate } from '../src/policy.ts';
const factory='juno.testnet',sender='u123.relayer.testnet',users=new Set([sender]);
function signed(receiverId:string,methodName:string,deposit=0n,gas=120n*10n**12n):SignedDelegate{
  return {delegateAction:{senderId:sender,receiverId,maxBlockHeight:100n,actions:[{enum:'functionCall',functionCall:{methodName,args:new Uint8Array(),deposit,gas}}]}} as unknown as SignedDelegate;
}
test('permits only funded player account and named Juno receivers',()=>{
  assert.equal(allowedDelegate(signed('post.juno.testnet','buy',YOCTO),factory,users),true);
  assert.equal(allowedDelegate(signed('other.testnet','buy',YOCTO),factory,users),false);
  const outsider=signed('post.juno.testnet','buy',YOCTO);
  outsider.delegateAction.senderId='attacker.testnet';
  assert.equal(allowedDelegate(outsider,factory,users),false);
});
test('blocks deployment, arbitrary methods and excessive gas',()=>{
  assert.equal(allowedDelegate(signed('post.juno.testnet','delete_account'),factory,users),false);
  assert.equal(allowedDelegate(signed('post.juno.testnet','buy',YOCTO,200n*10n**12n),factory,users),false);
  const other=signed('post.juno.testnet','buy',YOCTO);
  other.delegateAction.actions=[{enum:'transfer'}] as any;
  assert.equal(allowedDelegate(other,factory,users),false);
});
test('enforces exact auction escrow and bounded deposits',()=>{
  assert.equal(allowedDelegate(signed('post.juno.testnet','commit',YOCTO),factory,users),true);
  assert.equal(allowedDelegate(signed('post.juno.testnet','commit',YOCTO/2n),factory,users),false);
  assert.equal(allowedDelegate(signed(factory,'create_post',4n*YOCTO),factory,users),true);
  assert.equal(allowedDelegate(signed(factory,'create_post',6n*YOCTO),factory,users),false);
  assert.equal(allowedDelegate(signed('post.juno.testnet','redeem',1n),factory,users),false);
});
