import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { parseItemRows } from '@/lib/item-list'
import { requirePermission, denied } from '@/lib/api-guard'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// A takeoff spreadsheet → item lines for an RFQ.
//
// Nobody retypes a takeoff. It already exists as a sheet, so read it: the
// parser uses the sheet's own header row when it has one and falls back to a
// heuristic when it doesn't. Whatever comes back is editable before it's sent.
export async function POST(request: Request) {
  const db = admin()
  // Reads the uploaded sheet and nothing else - no table, no storage - so the
  // gate is the screen's: Request Quotes, the only page that sends a takeoff
  // here. `view`, because parsing writes nothing; saving the lines is the
  // request-quotes route's own write, which carries its own gate and lock.
  const gate = await requirePermission(db, request, 'request-quotes', 'view')
  if (denied(gate)) return gate.denied

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  } catch {
    return NextResponse.json({ error: 'Could not read this file. Excel or CSV works best.' }, { status: 422 })
  }

  if (!wb.SheetNames.length) return NextResponse.json({ error: 'That file has no sheets in it.' }, { status: 422 })

  const read = (name: string) => {
    const ws = wb.Sheets[name]
    if (!ws) return []
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })
    return parseItemRows(rows)
  }

  // Takeoffs come with a cover sheet, a summary, and the actual breakdown, and
  // the breakdown is rarely first. Read them all and use the one with the most
  // real lines - the caller can still name a sheet to override.
  const requested = (form.get('sheet') as string) || ''
  let sheetName = wb.SheetNames[0]
  let items = read(sheetName)
  if (wb.SheetNames.includes(requested)) {
    sheetName = requested
    items = read(requested)
  } else {
    for (const name of wb.SheetNames.slice(1)) {
      const candidate = read(name)
      if (candidate.length > items.length) { sheetName = name; items = candidate }
    }
  }

  return NextResponse.json({ items: items.slice(0, 500), sheet: sheetName, sheets: wb.SheetNames })
}
