import { TRADE_SCOPES } from './trade-scopes'
import { foldTrade } from './sub-trades'

/**
 * THE ONE LIST OF TRADES a contact can be filed under.
 *
 * WHY IT EXISTS. There were two lists and two doors onto one column.
 * `companies.trade` was set from a `<Select>` of 21 trades when you ADDED a
 * contact, and from a bare `<input placeholder="e.g. Flooring, Electrical">`
 * when you EDITED one. So the tidy path was the one nobody uses twice, and the
 * live directory grew "Electric", "Elecric" and "MetroCore Electric Inc." -
 * three electricians who do not appear when you pick Electrical to price out
 * electrical work. A rule that exists on one door has to exist on the others.
 *
 * AND THE TWO LISTS DISAGREED. The directory offered "Paint"; the scope
 * templates are keyed on "Painting", so a sub filed from the directory could
 * never match the template meant for them. The directory offered no
 * "Excavation" at all, which the templates do.
 *
 * So the list DERIVES from `TRADE_SCOPES` rather than being a third copy of
 * it: a trade that can build a scope is a trade you can file somebody under,
 * automatically. The extras below are the ones the directory needs and no
 * template covers - trades you hire but do not send a scope sheet to.
 */

/** In the directory, not in the scope templates. Kept alphabetical. */
const NO_TEMPLATE_YET = [
  'Demolition',
  'Doors & Hardware',
  'Elevators',
  'Fire Protection',
  'Glazing',
  'Masonry',
  'Structural Steel',
  'Waterproofing',
]

/**
 * Every trade, alphabetical, with "Other" last because it is a fallback rather
 * than a choice. "Paint" is deliberately absent: the templates spell it
 * "Painting", and two spellings of one trade is the whole problem here.
 */
export const TRADES: string[] = (() => {
  const seen = new Set<string>()
  const all: string[] = []
  for (const t of [...TRADE_SCOPES.map(s => s.trade), ...NO_TEMPLATE_YET]) {
    const k = foldTrade(t)
    if (!k || seen.has(k)) continue
    seen.add(k)
    all.push(t)
  }
  all.sort((a, b) => a.localeCompare(b))
  return [...all, 'Other']
})()

/**
 * What to offer somebody editing a contact who is ALREADY filed under
 * something.
 *
 * A picker that silently drops the value it was given reassigns that sub the
 * moment anybody opens their card to fix a phone number - so "Elecric" would
 * become whatever happened to be first, and the mistake would be laundered
 * into a different mistake. The stored value stays in the list, first, until a
 * human chooses to replace it. Fixing the directory is then a deliberate act,
 * which is the only kind worth trusting.
 */
export function tradeChoices(current?: string | null): string[] {
  const value = String(current ?? '').trim()
  if (!value) return TRADES
  const has = TRADES.some(t => foldTrade(t) === foldTrade(value))
  return has ? TRADES : [value, ...TRADES]
}

/** Whether a stored trade is one the app would offer today. */
export function isKnownTrade(trade?: string | null): boolean {
  const v = foldTrade(trade)
  return !!v && TRADES.some(t => foldTrade(t) === v)
}
