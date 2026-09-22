import { foldTrade } from './sub-trades'

/**
 * WHAT ORDER TRADES RUN IN, DECLARED - because nothing in this repo knew.
 *
 * 121 schedule lines across 26 jobs carry FIVE links between them. That is the
 * reason a delay pushes nobody: the cascade, the review screen, the shift
 * email and the delay action are all correct and all idle, because almost
 * nothing on a job says what it waits for. Nobody is going to sit down and
 * link 121 lines by hand, so the app has to offer - and to offer it needs an
 * opinion about what follows what.
 *
 * **AND IT MUST NOT BE `HARD_COST_CATEGORIES`.** That is the only ordered
 * trade list already here, and its own comment says "ordered ROUGHLY by build
 * sequence" - it is a dropdown's ordering. It puts Drywall ABOVE Plumbing and
 * Electrical, so generating dependencies from it would suggest that the
 * electrician waits for the drywaller. A list good enough to scan is not good
 * enough to make a claim from, and the claim here ends in somebody's dates
 * moving and a sub being emailed.
 *
 * So this is a SEPARATE, DECLARED table whose only job is sequence.
 *
 * ── THE MATCH IS EXACT ───────────────────────────────────────────────────────
 *
 * `foldTrade` normalises (trimmed, case-folded, whitespace-collapsed) and then
 * the alias must match WHOLE. No substring search, no closest-match, no
 * scoring. "Elecric" - a real spelling in this directory - gets NOTHING, and
 * that is the correct answer: `lib/inspector-link.ts` and
 * `lib/geocode-match.ts` both refuse a question too vague to have one answer,
 * for the reason that a link to the WRONG predecessor is worse than no link.
 * A suggestion nobody can trust costs more than a blank panel, because a blank
 * panel does not teach anybody to stop reading.
 *
 * ── AND SOME TRADES ARE DELIBERATELY ABSENT ──────────────────────────────────
 *
 * See `UNPLACED` below. A trade whose position genuinely depends on the job is
 * left out rather than pinned somewhere plausible. Absent means "no
 * suggestion", which is a state this whole module is built to be comfortable
 * with; a wrong `order` is a claim.
 */

export interface TradePhase {
  /** Stable key, for a test to name a phase without quoting its label. */
  key: string
  /**
   * Where it sits in the build. LOWER RUNS FIRST.
   *
   * Spaced by ten so a phase can be inserted between two without renumbering
   * the file - a renumber is how an ordered list quietly changes meaning.
   */
  order: number
  /** What to call the phase in a sentence a GC reads. */
  label: string
  /**
   * Every spelling that IS this phase. Matched whole, through `foldTrade`.
   *
   * These are the canonical trades from `TRADE_SCOPES` plus the spellings
   * actually written on subcontracts in this database - "Concrete /
   * Foundation", "Site Work" and "Low Voltage / Security" are all real rows
   * and none of them is a standard trade name.
   */
  aliases: string[]
}

export const TRADE_PHASES: TradePhase[] = [
  {
    key: 'sitework', order: 10, label: 'site work',
    aliases: ['Site Work', 'Sitework', 'Site Prep', 'Excavation', 'Earthwork', 'Grading', 'Demolition', 'Demo'],
  },
  {
    key: 'foundation', order: 20, label: 'the foundation',
    aliases: ['Foundation', 'Foundations', 'Concrete', 'Concrete / Foundation', 'Concrete/Foundation', 'Footings', 'Slab'],
  },
  {
    key: 'framing', order: 30, label: 'framing',
    aliases: ['Framing', 'Rough Carpentry', 'Carpentry - Rough', 'Structural Steel', 'Steel'],
  },
  {
    key: 'roofing', order: 40, label: 'the roof',
    aliases: ['Roofing', 'Roof'],
  },
  {
    key: 'exterior', order: 50, label: 'closing the shell in',
    aliases: ['Windows', 'Doors', 'Windows & Doors', 'Doors & Windows', 'Windows and Doors', 'Siding', 'Waterproofing'],
  },
  {
    // THE ROUGH-INS ARE ONE PHASE, NOT THREE. Plumbing, electrical and HVAC
    // rough happen alongside each other in an open wall; ranking them against
    // one another would invent a sequence that does not exist on a real job,
    // and each pair would be a suggestion that is wrong half the time.
    key: 'rough_in', order: 60, label: 'the rough-ins',
    aliases: [
      'Plumbing', 'Electrical', 'HVAC', 'Mechanical',
      'Fire Sprinkler', 'Fire Protection',
      'Low Voltage', 'Low Voltage / Security', 'Low Voltage/Security',
    ],
  },
  {
    key: 'insulation', order: 70, label: 'insulation',
    aliases: ['Insulation'],
  },
  {
    key: 'drywall', order: 80, label: 'drywall',
    aliases: ['Drywall', 'Sheetrock', 'Taping', 'Plaster'],
  },
  {
    key: 'interior_finish', order: 90, label: 'interior finishes',
    aliases: ['Painting', 'Paint', 'Trim', 'Finish Carpentry', 'Carpentry - Finish', 'Millwork'],
  },
  {
    key: 'flooring', order: 100, label: 'flooring',
    aliases: ['Flooring', 'Tile', 'Carpet'],
  },
  {
    key: 'cabinets', order: 110, label: 'cabinets and tops',
    aliases: ['Cabinets', 'Cabinetry', 'Casework', 'Countertops', 'Counters'],
  },
  {
    key: 'site_finish', order: 120, label: 'the outside finishes',
    aliases: ['Landscaping', 'Landscape', 'Fence', 'Fencing', 'Paving', 'Sidewalk', 'Hardscape'],
  },
  {
    key: 'closeout', order: 130, label: 'closing the job out',
    aliases: ['Punch List', 'Punchlist', 'Final Clean', 'Cleaning', 'Janitorial'],
  },
]

/**
 * TRADES CONSIDERED AND LEFT OUT ON PURPOSE.
 *
 * Each one really does run at a different point on different jobs: stucco goes
 * on while the inside is being drywalled on one job and months later on
 * another; masonry is a foundation trade, a structural one and a finish one
 * depending on what is being built; a pool or an elevator is scheduled around
 * everything else rather than after anything in particular.
 *
 * Written down rather than simply omitted so the next person can see these
 * were weighed - an absent trade otherwise looks like one nobody thought of,
 * and gets added with a guessed `order` by somebody being helpful. Pinned, so
 * adding one to `TRADE_PHASES` has to be a deliberate act that also edits this
 * list.
 */
export const UNPLACED = [
  'Stucco', 'Masonry', 'Solar', 'Pool', 'Elevator', 'Specialty', 'Other', 'Materials',
] as const

const BY_ALIAS = new Map<string, TradePhase>()
for (const phase of TRADE_PHASES) {
  for (const alias of phase.aliases) BY_ALIAS.set(foldTrade(alias), phase)
}

/**
 * The phase a trade belongs to, or NULL for one this table has no opinion on.
 *
 * Null is a normal, common answer and every caller has to handle it as "say
 * nothing" rather than as an error or a default.
 */
export function tradePhase(trade: unknown): TradePhase | null {
  const key = foldTrade(trade)
  if (!key) return null
  return BY_ALIAS.get(key) ?? null
}

/** Whether the table places this trade at all - the readable half of the above. */
export const isPlacedTrade = (trade: unknown): boolean => tradePhase(trade) !== null
