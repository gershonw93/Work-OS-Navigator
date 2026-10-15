import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string; subId: string } }) {
  // Any login, any subcontract id: what the GC pays a sub and when. It is
  // read from the Subs & Team tab, so `team: view` - what `subcontracts` GET
  // asks - and the owning company's (`ownedProject`), and the subcontract has
  // to be on THIS job rather than any id in the URL.
  const db = admin()
  const gate = await requirePermission(db, request, 'team', 'view')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  const { data: sub } = await db.from('subcontracts').select('id')
    .eq('id', params.subId).eq('project_id', params.id).maybeSingle()
  if (!sub) return NextResponse.json({ error: 'Subcontract not found' }, { status: 404 })

  const { data: items, error } = await db
    .from('payment_schedule_items')
    .select('id, label, type, percentage, amount, status, order_index')
    .eq('subcontract_id', params.subId)
    .order('order_index')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ items: items ?? [] })
}
