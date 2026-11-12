/** Public Borsh STATE layout of the deployed Juno contract. No signing material is read. */
export type LifecycleSnapshot = {
  accountId: string | null; creator: string; dare: string; proof: string;
  settled: boolean; finalized: boolean; deadlineMs: number; nowMs: number;
  hasBid: boolean; refundYocto: string; holding: string; voted: boolean;
};

export function decodeLifecycle(bytes: Uint8Array, accountId: string | null, nowMs: number): LifecycleSnapshot {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 0;
  function take(n: number) {
    if (!Number.isSafeInteger(n) || n < 0 || at + n > bytes.length) throw Error('Cannot read Juno lifecycle state.');
    const start = at; at += n; return start;
  }
  const u32 = () => view.getUint32(take(4), true);
  const u64 = () => view.getBigUint64(take(8), true);
  const u128 = () => { const low = u64(); return low + (u64() << 64n); };
  function skipBytes() { take(u32()); }
  function text() { const n = u32(); return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(take(n), at)); }
  function bool() { const n = bytes[take(1)]; if (n > 1) throw Error('Unsupported Juno lifecycle state.'); return n === 1; }
  function count(max = 100_000) { const n = u32(); if (n > max) throw Error('Unsupported Juno lifecycle state.'); return n; }
  if (bool()) throw Error('Lifecycle controls require a post account.');
  text(); skipBytes(); // owner, uploaded code (empty on posts)
  for (let n = count(); n > 0; n--) text(); // factory's posts (empty on posts)
  text(); const creator = text(); text(); text(); // slug, creator, caption, media
  const opened = u64();
  let hasBid = false, refundYocto = '0';
  for (let n = count(64); n > 0; n--) {
    const owner = text(); skipBytes(); u128(); u128(); u128(); bool(); u128(); const refund = u128();
    if (owner === accountId) { hasBid = true; refundYocto = refund.toString(); }
  }
  const settled = bool(); u128(); // clearing price
  let holding = '0';
  for (let n = count(); n > 0; n--) { const owner = text(); const amount = u128(); if (owner === accountId) holding = amount.toString(); }
  for (let n = 0; n < 6; n++) u128(); // supply, sold, floor, reserve, graduation escrow, creator earnings
  bool(); // graduated
  const dare = text(); u128(); const proof = text();
  let voted = false;
  for (let n = count(); n > 0; n--) { const owner = text(); bool(); if (owner === accountId) voted = true; }
  const finalized = bool();
  const deadlineMs = Number(opened) + 300_000;
  if (!Number.isSafeInteger(deadlineMs) || !Number.isSafeInteger(nowMs) || nowMs < 0) throw Error('Unsupported Juno lifecycle timestamp.');
  return { accountId, creator, dare, proof, settled, finalized, deadlineMs, nowMs, hasBid, refundYocto, holding, voted };
}
