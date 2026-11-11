import { formatNear } from "@juno/sdk";

/** Moving average cost from the contract's chronological fills, excluding gas. */
export type Fill = { kind: 'auction' | 'buy' | 'sell' | 'redeem'; quantity: string; total: string; ms: number };

export function positionAccounting(fills: Fill[], balance: number, price: number, truncated = false) {
  let units = 0;
  let cost = 0;
  let realised = 0;
  let complete = !truncated;
  const exits: number[] = [];
  for (const fill of [...fills].sort((a, b) => a.ms - b.ms)) {
    const quantity = Number(fill.quantity);
    const total = Number(formatNear(BigInt(fill.total), 24));
    if (fill.kind === 'auction' || fill.kind === 'buy') {
      units += quantity;
      cost += total;
    } else {
      if (quantity > units) complete = false;
      const removedCost = units > 0 ? (cost / units) * quantity : 0;
      const pnl = total - removedCost;
      realised += pnl;
      exits.push(pnl);
      cost = Math.max(0, cost - removedCost);
      units = Math.max(0, units - quantity);
    }
  }
  // Transfers are not in trades(). A balance mismatch makes the acquisition cost unknown.
  complete &&= units === balance;
  return {
    averageCost: complete && balance > 0 ? cost / balance : null,
    realised: complete ? realised : null,
    unrealised: complete ? balance * price - cost : null,
    unrealisedPct: complete && cost > 0 ? (balance * price - cost) / cost : null,
    exits: complete ? exits : null,
    complete,
  };
}

export type ValuationFill = { market: string; account: string; ms: number; kind: Fill['kind']; quantity: number; price: number | null };
/** Value at observed fills only; callers with transfers or a capped record must not use it. */
export function portfolioHistory(fills: ValuationFill[], wallet: string) {
  const balances = new Map<string, number>();
  const prices = new Map<string, number>();
  const history: Array<{ t: string; value: number }> = [];
  let started = false;
  for (const fill of [...fills].sort((a, b) => a.ms - b.ms)) {
    if (fill.price !== null) prices.set(fill.market, fill.price);
    if (fill.account === wallet) {
      const change = fill.kind === 'auction' || fill.kind === 'buy' ? fill.quantity : -fill.quantity;
      balances.set(fill.market, (balances.get(fill.market) ?? 0) + change);
      started = true;
    }
    if (!started) continue;
    const point = { t: new Date(fill.ms).toISOString(), value: [...balances].reduce((sum, [market, balance]) => sum + balance * (prices.get(market) ?? 0), 0) };
    if (history.at(-1)?.t === point.t) history[history.length - 1] = point;
    else history.push(point);
  }
  return history;
}
