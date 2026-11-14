/** Lists testnet NEAR the film accounts could recover from Juno posts: floor redemptions, curve sells, creator earnings. Read-only. */
import { JsonRpcProvider } from 'near-api-js';
const p = new JsonRpcProvider({ url: 'https://test.rpc.fastnear.com' });
const view = (c: string, m: string, a: object = {}) => p.callFunction({ contractId: c, method: m, args: a }) as Promise<any>;
const who = ['kai', 'mira', 'oto'].map((n) => `${n}.juno-awkorp.testnet`);
const posts: string[] = await view('juno-awkorp.testnet', 'posts');
const Y = 1e24; let tot = 0;
for (const post of posts) {
  const m = await view(post, 'market').catch(() => null); if (!m) continue;
  const supply = Number(m.supply ?? m.total_supply ?? 0);
  const floor = Number(m.floor_vault) / Y;
  const keys = Object.keys(m).join(',');
  const row: string[] = [];
  for (const w of who) { const b = Number(await view(post, 'ft_balance_of', { account_id: w })); if (b > 0) { const v = supply ? b * floor / supply : 0; tot += v; row.push(`${w.split('.')[0]}:${b}≈${v.toFixed(3)}`); } }
  const earn = Number(m.creator_earnings ?? 0) / Y; if (earn > 0.001) { tot += earn; row.push(`earn(${m.creator?.split('.')[0]}):${earn.toFixed(3)}`); }
  console.log(post.split('.')[0], m.phase, 'floor', floor.toFixed(3), 'supply', supply, row.join(' '));
  if (post === posts[0]) console.error(keys);
}
console.log('approx recoverable via redeem+earnings', tot.toFixed(3));
