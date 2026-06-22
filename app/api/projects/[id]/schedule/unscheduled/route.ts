import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get all sub IDs that already have a schedule_items row
  const { data: scheduled } = await db
    .from('schedule_items')
    .select('subcontract_id')
    .eq('project_id', params.id)
    .not('subcontract_id', 'is', null)

  const scheduledIds = (scheduled ?? []).map((r: any) => r.subcontract_id).filter(Boolean)

  // Fetch subs for this project, excluding already-scheduled ones
  let query = db
    .from('subcontracts')
    .select('id, scope, trade, companies(id, name)')
    .eq('project_id', params.id)

  if (scheduledIds.length > 0) {
    query = query.not('id', 'in', `(${scheduledIds.map((id: string) => `"${id}"`).join(',')})`)
  }

  const { data: subs } = await query

  return NextResponse.json({ subs: subs ?? [] })
}
