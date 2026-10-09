// LOT DETAILS - nine optional facts about the dirt a house sits on.
//
// Arrived as a 42-row lot list (Palm Coast in square feet, Palm Bay in acres,
// one row of dashes). The rules worth pinning are the ones that would quietly
// produce a wrong fact rather than a missing one.

import {
  cleanLotDetails, yesNo, garageSide, lotSizeLabel, lotFacts, lotTag,
  utilityInspections, guessLotUnit, LOT_FIELDS, lotFormFrom, lotFormBody, EMPTY_LOT,
} from '../lot-details'
import { ok, done, read } from './_helpers'

// ── unknown is not no ───────────────────────────────────────────────────────
ok(yesNo('Yes') === true && yesNo('No') === false, 'yes and no read as yes and no')
ok(yesNo('-') === null && yesNo('') === null && yesNo(undefined) === null,
  'a dash, an empty cell and nothing at all are UNKNOWN - never false')
ok(utilityInspections({ city_sewer: null, city_water: null }).length === 0,
  'so a row of dashes suggests no septic or well inspection')
ok(utilityInspections({ city_sewer: false }).some(t => /septic/i.test(t)), 'no city sewer suggests septic')
ok(utilityInspections({ city_water: false }).some(t => /well/i.test(t)), 'no city water suggests a well')
ok(utilityInspections({ city_sewer: true, city_water: true }).length === 0, 'city on both suggests nothing')

// ── only what was sent ──────────────────────────────────────────────────────
const partial = cleanLotDetails({ name: 'x', lot: ' 5 ' })
ok(Object.keys(partial).join() === 'lot' && partial.lot === '5',
  'a body that sends one lot field updates that one field and nothing else')
ok(cleanLotDetails({ parcel_id: '' }).parcel_id === null, 'a field sent empty is a deliberate clear')
ok(cleanLotDetails({ parcel_id: '-' }).parcel_id === null, 'a dash is not a parcel ID')

// ── a size carries its unit ─────────────────────────────────────────────────
ok(cleanLotDetails({ lot_size: '0.27' }).lot_size_unit === 'acres', '0.27 with no unit is acres')
ok(cleanLotDetails({ lot_size: '13322.499' }).lot_size_unit === 'sqft', '13,322 with no unit is square feet')
ok(cleanLotDetails({ lot_size: '10,000.38', lot_size_unit: 'sq ft' }).lot_size === 10000.38, 'a thousands comma is not a decimal point')
ok(cleanLotDetails({ lot_size: '' }).lot_size_unit === null, 'clearing the size clears the unit with it')
ok(guessLotUnit(null) === null, 'no size, no guess')
// NUMERIC comes back from PostgREST as a string - read it as one.
ok(lotSizeLabel('0.27', 'acres') === '0.27 acres', 'a size off the wire ("0.27") prints as a size')
ok(lotSizeLabel('13322.499', 'sqft') === '13,322 sq ft', 'square feet print whole, with a comma')
ok(lotSizeLabel('1', 'acres') === '1 acre', 'one acre is singular')

ok(garageSide('Left') === 'left' && garageSide('right') === 'right' && garageSide('-') === null,
  'garage side reads either case and refuses anything else')

const facts = lotFacts({ lot: '5', block: '58', parcel_id: '07-11', city_sewer: false, city_water: null, garage_side: 'left' })
ok(facts.some(f => f.value === 'Lot 5, Block 58'), 'lot and block print together')
ok(facts.some(f => f.value === 'Septic') && !facts.some(f => f.label === 'Water'),
  'a known "no" prints as what it means, and an unknown prints nothing')
ok(lotTag({ lot: '5', block: '58' }) === 'Lot 5 · Blk 58' && lotTag(EMPTY_LOT) === null, 'the short tag, or nothing')

// ── the form round trip ─────────────────────────────────────────────────────
const back = cleanLotDetails(lotFormBody(lotFormFrom({ lot_size: '0.27', lot_size_unit: 'acres', city_water: false })))
ok(back.lot_size === 0.27 && back.lot_size_unit === 'acres' && back.city_water === false && back.city_sewer === null,
  'a stored lot survives the form unchanged, unknowns included')

// ── the columns are the migration's ─────────────────────────────────────────
const m = read('supabase/migrations/131_project_lot_details.sql')
ok(LOT_FIELDS.every(f => new RegExp(`ADD COLUMN IF NOT EXISTS ${f}\\b`).test(m)),
  'every field the code reads is a column migration 131 adds')
ok(/city_sewer boolean;/.test(m) && !/city_sewer boolean NOT NULL/.test(m), 'and the yes/no columns are nullable')

// ── every door writes them ──────────────────────────────────────────────────
ok(/cleanLotDetails\(body\)/.test(read('app/api/projects/route.ts')), 'creating a project keeps the lot details')
ok(/cleanLotDetails\(body\)/.test(read('app/api/projects/[id]/route.ts')), 'editing a project keeps the lot details')
ok(/LotDetailsFields/.test(read('components/projects/project-form.tsx')), 'the create form shows the fields')
ok(/LotDetailsFields/.test(read('components/layout/edit-project-button.tsx')), 'the settings dialog shows the fields')
ok(/garage_side: project\?\.garage_side/.test(read('app/(dashboard)/projects/[id]/layout.tsx')),
  'and the layout hands the stored values to the dialog, or it would open blank and save blanks')

done()
