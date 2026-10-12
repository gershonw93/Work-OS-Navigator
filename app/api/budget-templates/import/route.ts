import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'
import { parseBudgetRows } from '@/lib/budget-import'
import { requirePermission, denied } from '@/lib/api-guard'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Parse a contractor's budget Excel into { description, default_amount } line items.
// Heuristic: per row, take the first non-empty text cell as the line-item label
// and the first numeric cell as its amount. Skips totals/headers.
export async function POST(request: Request) {
  // Reading a sheet writes nothing, but it is only ever the first half of
  // making a template or a budget, so it asks the permission the second half will.
  const gate = await requirePermission(admin(), request, 'budget', 'edit')
  if (denied(gate)) return gate.denied

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  let wb: XLSX.WorkBook
  try {
    wb = XLSX.read(await file.arrayBuffer(), { type: 'array' })
  } catch {
    return NextResponse.json({ error: 'Could not read this spreadsheet.' }, { status: 422 })
  }

  const ws = wb.Sheets[wb.SheetNames[0]]
  // raw:false would hand back pre-formatted display strings; raw values keep
  // real numbers as numbers and leave parseAmount to deal with the rest.
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })

  const items = parseBudgetRows(rows)

  return NextResponse.json({
    suggested_name: file.name.replace(/\.(xlsx|xls|csv)$/i, ''),
    items,
    // So the confirmation screen can say plainly how many amounts it actually
    // read. A sheet that imports at zero used to look identical to one that
    // imported correctly, right up until you opened the budget.
    with_amounts: items.filter(i => i.default_amount != null).length,
  })
}
