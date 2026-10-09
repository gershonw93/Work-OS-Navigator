// BULK ADD FROM A LOT LIST - the file that started it, as fixtures.
//
// 42 lots in two cities, no city/state/ZIP on any row (it was in each page's
// heading), Palm Coast sizes in square feet and Palm Bay in acres, one row of
// dashes, and street names the map may not recognise.

import {
  rowsFromTable, rowsFromScan, rowsFromLines, lotRowProblem, fullAddress, sharedPlace,
  lotJobName, headingMap, sectionPlace, MAX_LOTS,
} from '../lot-list'
import { matchPrecision, stateIn, matchProblem } from '../geocode-match'
import { ok, done, read, code } from './_helpers'

// ── a spreadsheet laid out like the PDF ─────────────────────────────────────
const sheet: unknown[][] = [
  ['Blue addresses from Mendy.xlsx'],
  ['Address', 'Parcel ID', 'Block', 'Lot', 'GIS Sqft/Acres', 'City water', 'City sewer', 'Garage', 'Environmental'],
  ['Palm Coast | Flagler | 21 addresses'],
  ['89 White Hall Dr', '07-11-31-7023-00410-0010', 41, 1, 13322.499, 'Yes', 'Yes', 'Left', '-'],
  ['3 Port Echo Ln', '07-11-31-7028-00440-0210', 44, 21, '-', '-', '-', 'Right', '-'],
  ['Palm Bay | Brevard | 21 addresses'],
  ['1042 Towhlen St SE', '29-37-32-GT-1111-9', 1111, 9, 0.23, 'No', 'No', 'Right', 'Wetland'],
]
const { rows, problem } = rowsFromTable(sheet, { state: 'FL' })
ok(problem === null && rows.length === 3, 'the heading row is found under a title row, and section rows are not lots')
ok(rows[0].city === 'Palm Coast' && rows[2].city === 'Palm Bay',
  'EACH SECTION HEADING CARRIES ITS CITY ONTO THE ROWS UNDER IT - the reason no house was ever placed')
ok(rows.every(r => r.state === 'FL'), '...and the state typed beside the upload fills the rows that do not say')
ok(fullAddress(rows[0]) === '89 White Hall Dr, Palm Coast, FL', 'so the address looked up is complete')
ok(lotRowProblem(rows[0]) === null, '...and complete enough to pin')
ok(rows[0].lot_size_unit === 'sqft' && rows[2].lot_size_unit === 'acres', 'square feet and acres are told apart per row')
ok(rows[1].city_sewer === null && rows[1].city_water === null && rows[1].lot_size == null,
  'a row of dashes is UNKNOWN, not "no sewer" - it must not suggest a septic inspection')
ok(rows[2].city_sewer === false && rows[2].environmental_notes === 'Wetland', 'a real No and a wetland note come through')
ok(rows[0].parcel_id === '07-11-31-7023-00410-0010' && rows[0].lot === '1' && rows[0].block === '41', 'parcel, block and lot come through as text')
ok(rows[0].garage_side === 'left', 'garage side is read')
ok(headingMap(['GIS Sqft/Acres', 'City water', 'Parcel ID'])[0] === 'lot_size', 'the PDF\'s own size heading is understood')
ok(rowsFromTable([['Name', 'Phone'], ['x', '1']]).problem !== null, 'a sheet with no address column says so instead of importing nothing')
ok(sectionPlace('Palm Bay | Brevard | 21 addresses').city === 'Palm Bay', 'a section heading reads as a city, not "21 addresses"')

// ── what the model sends back ───────────────────────────────────────────────
const COLS = ['street', 'parcel_id', 'block', 'lot', 'lot_size', 'city_water', 'city_sewer', 'garage_side', 'environmental_notes', 'model', 'zip', 'unsure']
const scanned = rowsFromScan({
  sections: [
    { city: 'Palm Coast', state: 'FL', lot_size_unit: 'sqft', rows: [['34 Wheeling Ln', '07-11', '58', '5', 8060.149, 'yes', 'yes', 'left', null, 'Aspen', null, []]] },
    { city: 'Palm Bay', state: 'FL', lot_size_unit: 'acres', rows: [['1668 San Soving St SE', null, '1151', '11', 0.23, 'no', 'no', 'right', null, null, null, ['street']]] },
  ],
}, COLS)
ok(scanned.length === 2 && scanned[0].city === 'Palm Coast' && scanned[1].city === 'Palm Bay', 'a scan\'s sections put the city on each row')
ok(scanned[0].lot_size_unit === 'sqft' && scanned[1].lot_size_unit === 'acres', '...and the section\'s size unit')
ok(scanned[0].model === 'Aspen', 'a model named on the list comes through for matching later')
ok(scanned[1].unsure.includes('street'), 'a field the reader was unsure of is carried, so the screen can say so')
const scanRoute = code('app/api/projects/bulk/scan/route.ts')
ok(/guardScan\(db, gate\.actor, 'lot-list'/.test(scanRoute), 'reading a PDF is metered as a scan')
ok(/rowsFromTable/.test(scanRoute) && /SHEET\.test\(file\.name\)/.test(scanRoute), '...and a spreadsheet is read by its headings, using no scan at all')
ok(!/\.insert\(/.test(scanRoute), 'reading a list CREATES NOTHING - every row is seen before a job exists')
ok(/Do not correct names/.test(read('app/api/projects/bulk/scan/route.ts')),
  'the reader is told not to fix spellings - a silent correction hides the row the map cannot find')

// ── pasted lines ────────────────────────────────────────────────────────────
const pasted = rowsFromLines('89 White Hall Dr\n\nnot an address\n1012 Weslaco St SE, Palm Bay, FL 32909', { city: 'Palm Coast', state: 'FL' })
ok(pasted.length === 2, 'a line with no house number is skipped')
ok(pasted[0].city === 'Palm Coast' && pasted[1].city === 'Palm Bay' && pasted[1].zip === '32909',
  'a bare line takes the area typed beside the box; a full one keeps its own')

// ── the rules every door asks ───────────────────────────────────────────────
ok(lotRowProblem({ street: '89 White Hall Dr', city: 'Palm Coast', state: null, zip: null }) !== null,
  'an address with no state and no ZIP is refused BEFORE it becomes a job nobody can map')
ok(lotRowProblem({ street: 'White Hall Dr', city: 'Palm Coast', state: 'FL', zip: null }) !== null, 'and one with no house number')
ok(sharedPlace(rows.slice(0, 2)) === 'Palm Coast, FL' && sharedPlace(rows) === null, 'the group is named after the place its lots share, when they share one')
ok(lotJobName({ street: '89 White Hall Dr', lot: '1' }) === '89 White Hall Dr (Lot 1)', 'a job is named after its address and lot')
ok(MAX_LOTS === 100, 'one batch is capped at 100, the same as the other Bulk Add modes')

// ── the house, or only the street ───────────────────────────────────────────
ok(matchPrecision('89 White Hall Dr, Palm Coast, FL', '89 White Hall Drive, Palm Coast, FL 32164, USA') === 'exact', 'a match carrying our house number is the house')
ok(matchPrecision('89 White Hall Dr, Palm Coast, FL', 'White Hall Drive, Palm Coast, FL') === 'approximate', 'a match without it is only the street')
ok(matchPrecision('89 White Hall Dr', '189 White Hall Drive') === 'approximate', '...and 189 is not 89')

// ── the create route asks too ───────────────────────────────────────────────
const bulk = code('app/api/projects/bulk/route.ts')
ok(/lotRowProblem\(rows\[i\]\.row\)/.test(bulk), 'the route refuses an unpinnable row itself - the screen is not the only caller')
ok(/geocodeManyExact/.test(bulk) && !/geocodeMany\(/.test(bulk),
  'Bulk Add stores only pins on the HOUSE - a street-centre guess is left unpinned rather than stored as a lot')
ok(/tooVagueToPin\(children\[0\]\?\.address\)/.test(bulk),
  'THE ORIGINAL BUG: a street batch with no state or ZIP is refused, with the fix named, instead of making forty unmappable jobs')
ok(/\.\.\.\(c\.lot \?\? \{\}\)/.test(bulk), 'and each job keeps the lot details its row carried')

const modal = read('components/projects/bulk-add-modal.tsx')
ok(!/disabled=\{saving \|\| !canSubmit\}/.test(modal), 'Create is no longer greyed out with no reason - it answers with what is missing')

done()
