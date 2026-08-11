// What to send a sub, per trade.
//
// The question that decides everything is not the trade - it's who supplies
// the material and who counts the quantities. A framer prices labor and tells
// you what lumber to buy; a lumber yard prices a list you hand them; a
// foundation sub brings everything and quotes off the plans; a door supplier
// comes and measures first.
//
// So a package carries: who supplies material, what you want priced, what's in
// and out of scope, and what you need back besides a number. Every bidder
// answers the same questions, which is what makes the bids comparable - you do
// NOT need a takeoff for that. Quantities only matter when you're buying the
// material and somebody has to count it.
//
// These are starting points, not rules. Every one is editable per package.

export type MaterialBy = 'sub' | 'gc' | 'na'
export type PackageType = 'turnkey' | 'labor_only' | 'material_only' | 'measure_quote'

export const PACKAGE_TYPES: { key: PackageType; label: string; hint: string }[] = [
  { key: 'turnkey', label: 'Labor + material', hint: 'They bring everything and quote off the plans' },
  { key: 'labor_only', label: 'Labor only', hint: 'You supply the material - ask them what to order' },
  { key: 'material_only', label: 'Material only', hint: 'You send a list, they price it line by line' },
  { key: 'measure_quote', label: 'Measure & quote', hint: 'They visit, measure, then price' },
]

export interface TradeScope {
  trade: string
  package_type: PackageType
  material_by: MaterialBy
  /** In scope, so nobody prices it out and nobody assumes it's covered. */
  included: string[]
  /** The gaps that cause change orders when left unsaid. */
  excluded: string[]
  /** What you need back beyond a price. */
  ask_for: string[]
  /** Shown while building the package - the thing an estimator would tell you. */
  note?: string
}

export const TRADE_SCOPES: TradeScope[] = [
  {
    trade: 'Site Preparation',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Clearing and grubbing', 'Rough grading', 'Erosion control', 'Haul-off'],
    excluded: ['Rock excavation', 'Unsuitable soil removal', 'Permits'],
    ask_for: ['Unit price for rock if hit', 'Mobilisation count included'],
  },
  {
    trade: 'Excavation',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Machine and operator', 'Spoil placement on site', 'Backfill and compaction'],
    excluded: ['Import fill', 'Off-site haul', 'Dewatering', 'Shoring'],
    ask_for: ['Unit price per yard for import fill', 'Day rate if extended'],
  },
  {
    trade: 'Foundation',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Footings', 'Stem walls', 'Rebar', 'Forming and stripping', 'Concrete supply and placement'],
    excluded: ['Excavation', 'Waterproofing', 'Under-slab plumbing', 'Engineering'],
    ask_for: ['Concrete PSI you priced', 'Pump included or extra'],
    note: 'Foundation subs bring their own material, so plans are enough. Compare on inclusions, not quantities.',
  },
  {
    trade: 'Concrete',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Slab on grade', 'Vapour barrier', 'Wire mesh or fibre', 'Finish and cure'],
    excluded: ['Sub-base', 'Under-slab plumbing', 'Saw cutting after the fact'],
    ask_for: ['Finish type priced', 'Concrete PSI'],
  },
  {
    trade: 'Framing',
    package_type: 'labor_only', material_by: 'gc',
    included: ['Wall framing', 'Roof framing', 'Sheathing', 'Blocking and backing', 'Setting trusses'],
    excluded: ['Material supply', 'Trusses (supplied)', 'Hardware and fasteners', 'Crane'],
    ask_for: [
      'THE MATERIAL LIST - every piece you need us to order, with quantities',
      'Crew size and duration',
      'Whether you set trusses or we hire a crane',
    ],
    note: 'The material list is the real ask. It becomes the RFQ you send the lumber yard, so ask for it in writing.',
  },
  {
    trade: 'Trusses',
    package_type: 'material_only', material_by: 'sub',
    included: ['Engineered truss package', 'Shop drawings', 'Delivery to site'],
    excluded: ['Setting', 'Crane', 'Hardware'],
    ask_for: ['Lead time from approval', 'Engineered drawings for permit'],
    note: 'Truss suppliers design from the plans - send the full set, not a list.',
  },
  {
    trade: 'Lumber',
    package_type: 'material_only', material_by: 'sub',
    included: ['Material as listed', 'Delivery to site'],
    excluded: ['Labor', 'Unloading', 'Returns restocking'],
    ask_for: ['Price per line item', 'Delivery lead time', 'How long the pricing holds'],
    note: 'This is the one that needs a list. Send quantities and you get line-by-line pricing you can compare exactly.',
  },
  {
    trade: 'Roofing',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Underlayment', 'Shingles or panels', 'Flashing', 'Ridge and vents', 'Clean-up'],
    excluded: ['Sheathing', 'Deck repair', 'Gutters'],
    ask_for: ['Manufacturer and product', 'Warranty offered', 'Unit price for deck repair'],
  },
  {
    trade: 'Siding',
    package_type: 'turnkey', material_by: 'sub',
    included: ['House wrap', 'Siding', 'Trim and corners', 'Caulking'],
    excluded: ['Sheathing', 'Paint', 'Soffit and fascia unless noted'],
    ask_for: ['Product and colour priced', 'Whether paint is included'],
  },
  {
    trade: 'Windows & Doors',
    package_type: 'measure_quote', material_by: 'sub',
    included: ['Supply', 'Field measure', 'Delivery'],
    excluded: ['Installation unless noted', 'Trim', 'Hardware'],
    ask_for: ['Their own measure and takeoff', 'Lead time', 'Installation priced separately'],
    note: 'They will usually come measure before quoting firm. Send plans and site access, expect their takeoff back.',
  },
  {
    trade: 'Plumbing',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Rough-in', 'Fixture setting', 'Rough material', 'Testing and inspection'],
    excluded: ['Fixtures (allowance)', 'Water and sewer tap fees', 'Trenching'],
    ask_for: ['Price per point or lump sum', 'Fixture allowance assumed'],
    note: 'Usually priced per point with rough material included, so the plans are enough.',
  },
  {
    trade: 'HVAC',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Equipment', 'Ductwork', 'Registers and grilles', 'Thermostat', 'Start-up'],
    excluded: ['Electrical hook-up', 'Gas line', 'Permits'],
    ask_for: ['Equipment make, model and SEER', 'Load calc included', 'Warranty'],
  },
  {
    trade: 'Electrical',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Rough-in', 'Panel and service', 'Devices and plates', 'Trim-out', 'Testing'],
    excluded: ['Fixtures (allowance)', 'Low voltage', 'Utility fees', 'Trenching'],
    ask_for: ['Fixture allowance assumed', 'Price per opening if applicable', 'Panel size priced'],
  },
  {
    trade: 'Insulation',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Walls', 'Ceiling', 'Air sealing', 'Clean-up'],
    excluded: ['Crawl or attic access work', 'Vapour barrier unless noted'],
    ask_for: ['R-values priced per assembly', 'Product type'],
  },
  {
    trade: 'Drywall',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Hang', 'Tape', 'Finish to level', 'Stocking', 'Clean-up'],
    excluded: ['Paint', 'Texture unless noted', 'Backing'],
    ask_for: ['Finish level priced', 'Texture included or extra'],
  },
  {
    trade: 'Painting',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Prep and caulk', 'Prime', 'Coats as specified', 'Clean-up'],
    excluded: ['Colour selections (allowance)', 'Repairs beyond touch-up'],
    ask_for: ['Number of coats priced', 'Product line', 'Number of colours included'],
    note: 'Colours are a homeowner selection - price it on a standard count and note extras.',
  },
  {
    trade: 'Trim & Millwork',
    package_type: 'measure_quote', material_by: 'gc',
    included: ['Install base, casing, doors', 'Hardware install'],
    excluded: ['Material supply', 'Paint', 'Stairs unless noted'],
    ask_for: [
      'THE MOULDING LIST - profiles and footage you need ordered',
      'Whether they measure on site first',
    ],
    note: 'Either they price from plans and measure later, or they hand you a moulding list to price. Ask which.',
  },
  {
    trade: 'Cabinets & Countertops',
    package_type: 'measure_quote', material_by: 'sub',
    included: ['Supply', 'Field measure', 'Install', 'Template for tops'],
    excluded: ['Appliances', 'Plumbing hook-up', 'Backsplash unless noted'],
    ask_for: ['Their measure and layout', 'Material and edge priced', 'Lead time'],
  },
  {
    trade: 'Flooring',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Material', 'Underlayment', 'Install', 'Transitions', 'Clean-up'],
    excluded: ['Subfloor prep and levelling', 'Base moulding'],
    ask_for: ['Product priced', 'Unit price for floor levelling'],
  },
  {
    trade: 'Tile',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Setting material', 'Waterproofing', 'Install', 'Grout and seal'],
    excluded: ['Tile (allowance)', 'Substrate repair'],
    ask_for: ['Tile allowance assumed per sq ft', 'Waterproofing system used'],
  },
  {
    trade: 'Landscaping',
    package_type: 'turnkey', material_by: 'sub',
    included: ['Final grade', 'Sod or seed', 'Plantings as specified', 'Clean-up'],
    excluded: ['Irrigation unless noted', 'Retaining walls', 'Fencing'],
    ask_for: ['Warranty on plantings', 'Irrigation priced separately'],
  },
]

const byTrade = new Map(TRADE_SCOPES.map(s => [s.trade.toLowerCase(), s]))

/** Best-effort match on a trade name - exact first, then a loose contains. */
export function scopeForTrade(trade: string | null | undefined): TradeScope | null {
  const t = (trade ?? '').trim().toLowerCase()
  if (!t) return null
  const exact = byTrade.get(t)
  if (exact) return exact
  return TRADE_SCOPES.find(s =>
    t.includes(s.trade.toLowerCase()) || s.trade.toLowerCase().includes(t)) ?? null
}

export const MATERIAL_BY_LABEL: Record<MaterialBy, string> = {
  sub: 'Subcontractor supplies material',
  gc: 'We supply the material',
  na: 'No material on this package',
}

export const PACKAGE_TYPE_LABEL: Record<PackageType, string> = {
  turnkey: 'Labor + material',
  labor_only: 'Labor only',
  material_only: 'Material only',
  measure_quote: 'Measure & quote',
}

/**
 * Whether bids on this package can be compared line for line.
 *
 * Only when you sent the lines. Everything else compares on totals plus what
 * each bidder said they included - which is exactly why the scope checklist
 * matters more than a takeoff.
 */
export function comparabilityNote(type: PackageType, hasItemList: boolean): string {
  if (hasItemList) return 'Bids come back priced per line - you can compare them exactly.'
  if (type === 'material_only') return 'Add an item list and suppliers price it line by line, so the bids compare exactly.'
  return 'Bids come back as totals. They compare because every bidder answers the same scope questions.'
}
