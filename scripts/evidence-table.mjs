// Print the README's testnet table from deployments/testnet-<date>.json.
//   node scripts/evidence-table.mjs deployments/testnet-2026-11-09.json
import { readFileSync } from 'node:fs';

const file = process.argv[2];
const data = JSON.parse(readFileSync(file, 'utf8'));
const link = (hash) => `[${hash.slice(0, 8)}…](https://testnet.nearblocks.io/txns/${hash})`;
const account = (id) => `[${id}](https://testnet.nearblocks.io/address/${id})`;
console.log(`Factory: ${account(data.factory)} · players: ${data.players.map(account).join(', ')}\n`);
console.log('| # | Step | Signer | Receiver | Transaction |');
console.log('| ---: | --- | --- | --- | --- |');
data.transactions.forEach((t, i) => {
  const signer = t.signer.startsWith('engye-') ? 'funder' : t.signer.replace(`.${data.factory}`, '');
  const receiver = t.receiver.replace(`.${data.factory}`, '');
  console.log(`| ${i + 1} | ${t.step} | ${signer} | ${receiver} | ${link(t.hash)} |`);
});
