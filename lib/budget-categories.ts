// The category catalogs offered on a budget line.
//
// Neither list is a constraint - budget_line_items.category is free text, and
// the Budget tab lets anyone type a category that isn't here. These are the
// starting points, and the API also feeds back every category this company has
// already used so a one-off typed on one job shows up on the next.
//
// Ordered roughly by build sequence rather than alphabetically: a GC scanning
// for the trade they're pricing thinks in job order, and the dropdown has a
// search box for everything else.

export const HARD_COST_CATEGORIES = [
  // Pre-site
  'General Conditions',
  'Permits & Fees',
  'Site Preparation',
  'Demolition',
  'Excavation',
  'Site Work',
  // Below grade / structure
  'Waterproofing',
  'Foundation',
  'Concrete',
  'Concrete Flatwork',
  'Window Wells',
  'Masonry',
  'Stucco & Stone',
  'Metals',
  'Iron Work',
  'Craning',
  'Lumber',
  'Trusses',
  'Framing',
  // Envelope
  'Roofing',
  'Siding',
  'Gutters',
  'Windows & Doors',
  'Exterior Railings',
  'Decking',
  'Staircase',
  // Rough-in
  'Insulation',
  'Soundproofing',
  'Drywall',
  'Plumbing',
  'HVAC',
  'Electrical',
  'Low Voltage',
  'Fire Sprinklers',
  // Finishes
  'Flooring',
  'Hardwood Flooring',
  'Tile',
  'Trim & Millwork',
  'Cabinets & Countertops',
  'Painting',
  'Railings',
  'Appliances',
  // Site close-out
  'Landscaping',
  'Lawn Care',
  'Equipment Rental',
  'Site Bathroom',
  'Rubbish Removal',
  'Cleanup',
  // Catch-alls
  'Contingency',
  'General',
]

// The standard soft costs a GC carries alongside the trades. Mirrors the
// S-codes builders keep in their own spreadsheets.
export const SOFT_COST_CATEGORIES = [
  'Plans & Design',
  'Permit Fees',
  'Builders Risk Insurance',
  'Taxes',
  'Loan Origination',
  'Loan Interest',
  'Survey',
  'Legal & Recording',
  'Broker Fees',
  'Engineering',
  'Testing & Inspections',
  'Contingency',
]

/**
 * The built-in catalog for a cost type, plus any category this company has
 * already used, minus duplicates. Custom entries sort to the end so the
 * standard list stays predictable.
 */
export function categoryOptions(
  costType: 'hard' | 'soft',
  known: string[] = [],
): string[] {
  const base = costType === 'soft' ? SOFT_COST_CATEGORIES : HARD_COST_CATEGORIES
  const seen = new Set(base.map(c => c.toLowerCase()))
  const extra: string[] = []
  for (const k of known) {
    const name = (k ?? '').trim()
    if (!name || seen.has(name.toLowerCase())) continue
    seen.add(name.toLowerCase())
    extra.push(name)
  }
  extra.sort((a, b) => a.localeCompare(b))
  return [...base, ...extra]
}
