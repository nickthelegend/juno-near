export type Tick = { t: string; price: number };
export type Span = '1H' | '1D' | '1W' | '1M' | 'ALL';
const WINDOW_MS: Record<Span, number> = { '1H': 3_600_000, '1D': 86_400_000, '1W': 7 * 86_400_000, '1M': 30 * 86_400_000, ALL: Infinity };

/** A quiet period stays quiet; older fills do not become recent price changes. */
export function withinSpan(ticks: Tick[], span: Span, now = Date.now()): Tick[] {
  if (span === 'ALL') return ticks;
  return ticks.filter(tick => Date.parse(tick.t) >= now - WINDOW_MS[span] && Date.parse(tick.t) <= now);
}
