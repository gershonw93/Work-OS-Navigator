import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { jobGate, companyProfileIds } from '@/lib/job-access'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(request: Request, { params }: { params: { id: string; entryId: string } }) {
  // Approving or rejecting somebody's hours answered ANY login, for any entry
  // on any job. Now `time: edit` - the Time tab's own `canManage` - and on this
  // job. On a job the caller's company does NOT own (a sub's admin holds
  // `time: edit` in their own company's map), only their OWN crew's entries:
  // a sub signing off the GC's labour is not a thing the screen means.
  const db = admin()
  const gate = await jobGate(db, request, params.id, 'time', 'edit')
  if ('denied' in gate) return gate.denied
  const user = { id: gate.actor.userId }

  if (gate.side !== 'gc') {
    const crew = await companyProfileIds(db, gate.actor.companyId)
    const { data: entry } = await db.from('time_entries').select('profile_id')
      .eq('id', params.entryId).eq('project_id', params.id).maybeSingle()
    if (!entry || !crew || !crew.includes((entry as any).profile_id)) {
      return NextResponse.json({ error: 'Time entry not found' }, { status: 404 })
    }
  }

  const { approval_status } = await request.json()
  if (!['approved', 'rejected', 'pending'].includes(approval_status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  const { data, error } = await db
    .from('time_entries')
    .update({
      approval_status,
      reviewed_by: user.id,
      reviewed_by_name: (profile as any)?.full_name ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.entryId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}
