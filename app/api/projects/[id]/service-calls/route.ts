import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { gcView } from '@/lib/service-calls'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// GET /api/projects/<id>/service-calls - the GC's view of the service calls a
// sub has tied to THIS job: that they exist, who is doing them, where they
// stand and when. Nothing else (`gcView` builds it field by field): the
// customer, the contact, the sub's notes and photos and which of their crew
// went are the sub's business records, and a call carries no price at all.
//
// The GC's own: `ownedProject`, so a sub on the job - even the sub whose calls
// these are - reads them through their own screens, never this one.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'view')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { data, error } = await db.from('service_calls')
    .select('id, company_id, call_number, status, scheduled_start, scheduled_end, completed_at, updated_at')
    .eq('gc_project_id', params.id)
    .order('created_at', { ascending: false })
  if (error) {
    console.error('[service-calls] gc view failed', { project: params.id, error: error.message })
    return NextResponse.json({ error: 'Could not load the service calls. Try again.' }, { status: 500 })
  }
  const rows = (data ?? []) as any[]
  const ids = Array.from(new Set(rows.map(r => r.company_id)))
  // THE GC'S NAME FOR THE SUB, not the one the sub gave his own company: the GC
  // knows him as "Sub Electric" in their Directory, and the card read "Sub 2".
  // Their own Directory row linked to the sub's company is that name
  // (migration 169); the sub's own name is only the fallback.
  const [{ data: companies }, { data: rows169 }] = ids.length
    ? await Promise.all([
      db.from('companies').select('id, name').in('id', ids),
      db.from('companies').select('name, linked_company_id').eq('added_by_company_id', gate.actor.companyId ?? '').in('linked_company_id', ids),
    ])
    : [{ data: [] }, { data: [] }]
  const name = new Map(((companies ?? []) as any[]).map(c => [c.id, c.name]))
  for (const r of (rows169 ?? []) as any[]) if (r.name) name.set(r.linked_company_id, r.name)
  return NextResponse.json({ calls: rows.map(r => gcView(r, name.get(r.company_id) ?? null)) })
}
