import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { createSubcontract } from '@/lib/writes/subcontract'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Reading the money needs permission to see it. The nav hid these
  // screens from a Field Supervisor; the ROUTE answered anybody with a
  // login, so pasting the URL returned the whole budget. #337 guarded the
  // writes and left every read open - a guard on the menu is not a guard.
  const viewGate = await requirePermission(admin(), request, 'team', 'view')
  if (denied(viewGate)) return viewGate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: subcontracts, error } = await db
    .from('subcontracts')
    .select('id, scope, companies(id, name)')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ subcontracts: subcontracts ?? [] })
}

// Manually add an off-platform subcontractor (GC enters everything; no invite/bid).
// Accepts multipart form-data so a proposal file can be uploaded at the same time.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await request.formData()
  const existingCompanyId = (form.get('existing_company_id') as string ?? '').trim()

  // THE PERMISSION DEPENDS ON WHAT IS BEING DONE, so it is checked after the
  // form is read rather than before it.
  //
  // Putting a sub you already have in the Directory onto this project is part
  // of entering their bill - a bookkeeper who can enter bills should not have
  // to go and find somebody the moment a sub is not yet attached, which is
  // exactly the wall the tester hit mid-bill. The subcontract is created with
  // no agreed amount, which migration 082 made possible for this case.
  //
  // Creating a BRAND NEW company is a different act: it writes a company-wide
  // Directory record that every project sees, and duplicate vendors are how a
  // directory stops being worth reading. That stays `team: edit`.
  const gate = await requirePermission(
    admin(), request,
    existingCompanyId ? 'invoices' : 'team',
    'edit',
  )
  if (denied(gate)) return gate.denied

  // The form, as a plain object of its fields - first value per key, exactly
  // what `form.get` answers - with the proposal File under `proposal`.
  const body: Record<string, any> = {}
  for (const key of Array.from(new Set(Array.from(form.keys())))) body[key] = form.get(key)

  // Everything after the gate is `createSubcontract`, which Claude's MCP server can call too.
  const result = await createSubcontract(db, { userId: user.id, projectId: params.id, body })
  return NextResponse.json(result.body, { status: result.status })
}
