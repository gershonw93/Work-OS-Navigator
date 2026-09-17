import { TRADE_SCOPES } from './trade-scopes'

/**
 * THE TRADES YOU CAN ASK FOR A PRICE ON, and who you have for each.
 *
 * "I'm creating a bid. I'm trying to price out electrical. So it's trade based"
 * - exactly so. The Trade field was free text with a placeholder reading "e.g.
 * Electrical", so it named nothing, grouped nothing, and could not find you a
 * single electrician. The trade is the KEY: pick it and it should hand you the
 * subs who do it.
 *
 * THE LIST IS A UNION, and both halves are load-bearing:
 *
 *   - the 21 standard trades, because the trade also drives the scope template
 *     (`ScopeBuilder`). Offering only trades you already have subs for would
 *     mean a GC with no electrician yet cannot pick Electrical at all, and
 *     loses the built scope with it.
 *   - every trade actually written on a sub in your directory, because a trade
 *     the list does not offer is a group of subs nobody can reach. Real rows
 *     include "Concrete / Foundation", "Site Work" and "Low Voltage /
 *     Security" - none of them standard, all of them real.
 *
 * AND EVERY OPTION CARRIES ITS COUNT, which is not decoration. A picker that
 * shows a fact in its options fills that fact in: "Electrical (13)" beside
 * "Electric (1)" and "Elecric (1)" is the only thing that makes a typo in the
 * directory visible before it costs somebody an invite.
 */

/** The bucket for subs with no trade written on them at all. */
export const NO_TRADE = '__no_trade__'

export interface TradeOption {
  /** What to store and show. A standard trade keeps its canonical spelling. */
  trade: string
  /** How many directory subs answer to it. */
  count: number
  /** Whether picking it builds a scope template. */
  hasScope: boolean
}

export interface TradedSub { trade?: string | null }

/**
 * Trimmed, case-folded, whitespace-collapsed - the same normalisation the
 * inspector link uses, and for the same reason: "electrical" and "Electrical "
 * are one trade, and treating them as two splits a crew across two options.
 */
export const foldTrade = (v: unknown): string =>
  String(v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

const SCOPE_BY_FOLD = new Map(TRADE_SCOPES.map(s => [foldTrade(s.trade), s.trade]))

export function tradeOptions(subs: TradedSub[]): TradeOption[] {
  const counts = new Map<string, number>()
  /** The spelling a human actually typed, for a trade we have no canonical one for. */
  const spelling = new Map<string, string>()
  let untraded = 0

  for (const s of subs ?? []) {
    const key = foldTrade(s.trade)
    if (!key) { untraded++; continue }
    counts.set(key, (counts.get(key) ?? 0) + 1)
    if (!spelling.has(key)) spelling.set(key, String(s.trade).trim().replace(/\s+/g, ' '))
  }

  const out: TradeOption[] = []
  // Every standard trade, whether or not anybody does it for you yet.
  for (const [key, canonical] of Array.from(SCOPE_BY_FOLD.entries())) {
    out.push({ trade: canonical, count: counts.get(key) ?? 0, hasScope: true })
  }
  // Plus anything your directory uses that the standard list has never heard of.
  for (const [key, count] of Array.from(counts.entries())) {
    if (SCOPE_BY_FOLD.has(key)) continue
    out.push({ trade: spelling.get(key) ?? key, count, hasScope: false })
  }

  out.sort((a, b) => a.trade.localeCompare(b.trade))

  // LAST, and only when it would hold somebody. Eight subs with an empty trade
  // are eight subs no trade-shaped picker can reach; a bucket is the difference
  // between "you have nobody" and "you have not filed them yet".
  if (untraded > 0) out.push({ trade: NO_TRADE, count: untraded, hasScope: false })
  return out
}

/** The subs a picked trade should show. */
export function subsInTrade<T extends TradedSub>(subs: T[], trade: string | null | undefined): T[] {
  if (!trade) return []
  if (trade === NO_TRADE) return (subs ?? []).filter(s => !foldTrade(s.trade))
  const want = foldTrade(trade)
  if (!want) return []
  return (subs ?? []).filter(s => foldTrade(s.trade) === want)
}

/** What to print for an option - the count is the half that makes it useful. */
export function tradeOptionLabel(o: TradeOption): string {
  const name = o.trade === NO_TRADE ? 'No trade set' : o.trade
  return o.count > 0 ? `${name} (${o.count})` : name
}
