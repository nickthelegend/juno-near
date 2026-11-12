import type { LifecycleSnapshot } from '@juno/sdk';
import type { TxStep } from './api';

export const LIFECYCLE_METHODS = ['claim_refund', 'submit_proof', 'vote_proof', 'finalize_dare'] as const;
export type LifecycleMethod = typeof LIFECYCLE_METHODS[number];
export type Eligibility = { eligible: boolean; reason: string };
const gate = (reason: string): Eligibility => ({ eligible: !reason, reason });

/** Eligibility is derived from a final chain snapshot, never a local claim/vote marker. */
export function lifecycleOptions(s: LifecycleSnapshot): Record<LifecycleMethod, Eligibility> {
  const connected = s.accountId ? '' : 'Connect a NEAR wallet to continue.';
  const noDare = !s.dare ? 'This post has no dare.' : '';
  const closed = s.nowMs >= s.deadlineMs;
  return {
    claim_refund: gate(!s.settled ? 'Refunds open after the auction settles.' : connected || (!s.hasBid ? 'This account did not bid in this auction.' : BigInt(s.refundYocto) === 0n ? 'No unclaimed auction refund for this account.' : '')),
    submit_proof: gate(noDare || (closed ? 'Proof submission closed.' : connected || (s.accountId !== s.creator ? 'Only the creator can submit proof.' : ''))),
    vote_proof: gate(noDare || (!s.settled ? 'Voting opens after the auction settles.' : closed ? 'Voting closed.' : connected || (BigInt(s.holding) === 0n ? 'Hold this post token to vote.' : s.voted ? 'This account already voted.' : ''))),
    finalize_dare: gate(noDare || (s.finalized ? 'This dare is already final.' : !closed ? 'Finalize after the dare deadline.' : connected)),
  };
}

/** Shared by the app and the real local-sandbox test. Every lifecycle call attaches zero NEAR. */
export function buildLifecycle(receiverId: string, snapshot: LifecycleSnapshot, method: LifecycleMethod, input: { proof?: string; accepted?: boolean } = {}): TxStep {
  const allowed = lifecycleOptions(snapshot)[method];
  if (!allowed?.eligible) throw Error(allowed?.reason || 'Unknown lifecycle action.');
  const args: Record<string, unknown> = {};
  if (method === 'submit_proof') {
    const proof = input.proof?.trim() || '';
    if (!proof || new TextEncoder().encode(proof).length > 300) throw Error('Proof must be 1–300 UTF-8 bytes.');
    args.proof = proof;
  }
  if (method === 'vote_proof') {
    if (typeof input.accepted !== 'boolean') throw Error('Choose accept or reject.');
    args.accepted = input.accepted;
  }
  const label = { claim_refund: 'Claim auction refund', submit_proof: 'Submit proof', vote_proof: 'Vote on proof', finalize_dare: 'Finalize dare' }[method];
  return { receiverId, methodName: method, label, args, deposit: '0', gas: '120000000000000' };
}
