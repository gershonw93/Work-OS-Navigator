import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { requirePermission, denied } from '@/lib/api-guard'
import { guardScan, scanDenied } from '@/lib/scan-guard'
import { rowsFromTable, rowsFromLines, rowsFromScan, sharedPlace, MAX_LOTS, type LotRow } from '@/lib/lot-list'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const SHEET = /\.(xlsx|xls|csv|tsv)$/i

/**
 * Rows come back as ARRAYS in this order, not as objects - forty-two rows of
 * repeated key names is most of the answer, and the answer has to arrive
 * inside `maxDuration`. `rowsFromScan` puts the names back.
 */
const COLUMNS = ['street', 'parcel_id', 'block', 'lot', 'lot_size', 'city_water', 'city_sewer', 'garage_side', 'environmental_notes', 'model', 'zip', 'unsure'] as const

const PROMPT = `You are reading a builder's list of house lots - a lot schedule, a plat summary, a spreadsheet saved as a PDF, or a photo of one. Every row is one house to be built.

Return ONLY a JSON object, no prose and no code fences:
{
  "sections": [
    {
      "city": "the city or town this group of rows is in, or null",
      "county": "the county, if named, or null",
      "state": "two-letter US state code, or null",
      "lot_size_unit": "sqft | acres | null - what the size column in THIS section is measured in",
      "rows": [ [${COLUMNS.map(c => `"${c}"`).join(', ')}] ]
    }
  ]
}

Each row is an ARRAY with exactly these ${COLUMNS.length} values, in this order:
street (house number and street exactly as printed), parcel_id, block, lot, lot_size (a number), city_water ("yes"/"no"/null), city_sewer ("yes"/"no"/null), garage_side ("left"/"right"/null), environmental_notes, model (house model or plan name if listed), zip (if printed on the row), unsure (an array of the column names you could not read with confidence, usually []).

Rules that matter here:
- The city, county and state are very often NOT on the rows - they are in a heading above a group of rows ("Palm Coast | Flagler | 21 addresses"). Put them on the SECTION, and start a new section whenever the heading changes. Never leave them off because the rows lack them.
- If a state is not printed but the county and city make it certain (Flagler County with Palm Coast is Florida), give the two-letter code. If it is not certain, null.
- Copy each street exactly as printed, spelling included. Do not correct names you think are misspelled - the builder checks every row against a map next, and a silent correction hides the problem.
- A dash, a blank or "N/A" is null - not "no". "No" is only "no" when the document says No.
- Sizes: one page may be in square feet (10000.38) and the next in acres (0.23). Say which per section.
- Never invent a row, a lot number or a parcel. Leave out heading, total and page-footer rows.
- At most ${MAX_LOTS} rows in all.`

/**
 * Read a lot list into rows for the review table. Creates NOTHING - the
 * person checks every row (and its map pin) first.
 *
 * A spreadsheet is read by its column headings, here, for free. A PDF or a
 * photo is read by the model and costs one scan. Pasted text is read line by
 * line.
 */
export async function POST(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'create')
  if (denied(gate)) return gate.denied

  const form = await request.formData()
  const file = form.get('file') as File | null
  const text = String(form.get('text') ?? '')
  const area = { city: String(form.get('city') ?? '') || null, state: String(form.get('state') ?? '') || null }

  let rows: LotRow[] = []
  let source: 'sheet' | 'scan' | 'text' = 'text'

  if (!file || file.size === 0) {
    if (!text.trim()) return NextResponse.json({ error: 'Upload a file, or paste the addresses one per line.' }, { status: 400 })
    // A pasted sheet (tab or comma separated, with a heading row) reads as a
    // sheet; anything else is one address per line.
    const table = XLSX.utils.sheet_to_json<unknown[]>(XLSX.read(text, { type: 'string' }).Sheets.Sheet1 ?? {}, { header: 1, blankrows: false })
    const asSheet = rowsFromTable(table, area)
    rows = asSheet.rows.length ? asSheet.rows : rowsFromLines(text, area)
    if (!rows.length) return NextResponse.json({ error: 'No line in that had a house number in it.' }, { status: 422 })
  } else if (SHEET.test(file.name)) {
    source = 'sheet'
    let table: unknown[][]
    try {
      const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
      table = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, blankrows: false })
    } catch {
      return NextResponse.json({ error: 'Could not open that spreadsheet.' }, { status: 422 })
    }
    const read = rowsFromTable(table, area)
    if (read.problem) return NextResponse.json({ error: read.problem }, { status: 422 })
    rows = read.rows
  } else {
    source = 'scan'
    const isPdf = file.type === 'application/pdf'
    if (!isPdf && !IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json({ error: 'Send a PDF, a photo, or a spreadsheet (.xlsx or .csv).' }, { status: 415 })
    }
    if (file.size > 20 * 1024 * 1024) return NextResponse.json({ error: 'That file is over 20MB.' }, { status: 413 })
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'Reading PDFs is not configured on this environment - upload the list as a spreadsheet instead.' }, { status: 503 })
    }

    const scan = await guardScan(db, gate.actor, 'lot-list', null)
    if (scanDenied(scan)) return scan.denied

    const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')
    const content: any = isPdf
      ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: PROMPT }]
      : [{ type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } }, { type: 'text', text: PROMPT }]
    try {
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const message = await anthropic.messages.create({
        // The same model every other extraction route uses.
        model: 'claude-opus-4-8',
        max_tokens: 8000,
        messages: [{ role: 'user', content }],
      })
      let raw = message.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
      const first = raw.indexOf('{'), last = raw.lastIndexOf('}')
      if (first >= 0 && last > first) raw = raw.slice(first, last + 1)
      rows = rowsFromScan(JSON.parse(raw), COLUMNS)
    } catch (e: any) {
      console.error('[bulk/scan] read failed:', e?.message ?? e)
      return NextResponse.json({ error: 'Could not read that file. Try a clearer copy, or upload it as a spreadsheet.' }, { status: 422 })
    }
    if (!rows.length) {
      return NextResponse.json({ error: 'No house addresses were found in that file.' }, { status: 422 })
    }
    await scan.succeeded()
  }

  return NextResponse.json({
    rows,
    source,
    place: sharedPlace(rows),
    suggested_name: file?.name ? file.name.replace(/\.[a-z0-9]+$/i, '') : null,
  })
}
