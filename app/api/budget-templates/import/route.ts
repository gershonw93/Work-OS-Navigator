import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import * as XLSX from 'xlsx'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Parse a contractor's budget Excel into { description, default_amount } line items.
// Heuristic: per row, take the first non-empty text cell as the line-item label
// and the first numeric cell as its amount. Skips totals/headers.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, blankrows: false })

  const SKIP = /^(total|subtotal|grand total|contractor fee|line item|amount|property address|phase\b)/i
  const items: { description: string; default_amount: number | null }[] = []
  for (const row of rows) {
    if (!Array.isArray(row)) continue
    let label: string | null = null
    let amount: number | null = null
    for (const cell of row) {
      if (cell == null) continue
      if (label == null && typeof cell === 'string' && cell.trim()) label = cell.trim()
      else if (amount == null && typeof cell === 'number' && isFinite(cell)) amount = cell
    }
    if (!label || SKIP.test(label)) continue
    if (label.length > 120) continue
    items.push({ description: label, default_amount: amount })
  }

  return NextResponse.json({
    suggested_name: file.name.replace(/\.(xlsx|xls|csv)$/i, ''),
    items,
  })
}
