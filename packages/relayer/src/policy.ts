import type { SignedDelegate } from 'near-api-js';
import { YOCTO } from '@juno/sdk';

const FACTORY_METHODS=new Set(['create_post']);
const TOKEN_METHODS=new Set(['commit','reveal','settle','claim_refund','buy','sell','redeem','withdraw_earnings','submit_proof','vote_proof','finalize_dare','claim_dare','ft_transfer']);
export function allowedDelegate(signed:SignedDelegate,factory:string,users:ReadonlySet<string>):boolean {
  const d=signed.delegateAction;
  if(!users.has(d.senderId) || d.actions.length!==1 || d.maxBlockHeight<=0n)return false;
  const action=d.actions[0];
  if(action.enum!=='functionCall'||!action.functionCall)return false;
  const fn=action.functionCall;
  if(fn.gas>150n*10n**12n)return false;
  if(d.receiverId===factory){
    if(!FACTORY_METHODS.has(fn.methodName)||fn.deposit<3n*YOCTO||fn.deposit>5n*YOCTO)return false;
  }else if(d.receiverId.endsWith(`.${factory}`)&&/^[a-z0-9-]{2,32}$/.test(d.receiverId.slice(0,-factory.length-1))){
    if(!TOKEN_METHODS.has(fn.methodName))return false;
    if(fn.methodName==='commit'&&fn.deposit!==YOCTO)return false;
    if(fn.methodName==='buy'&&fn.deposit>10n*YOCTO)return false;
    if(fn.methodName==='ft_transfer'&&fn.deposit!==1n)return false;
    if(!['commit','buy','ft_transfer'].includes(fn.methodName)&&fn.deposit!==0n)return false;
  }else return false;
  return true;
}
