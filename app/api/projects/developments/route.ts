import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { attachJobs } from '@/lib/development-db'
import { newDevelopmentProblem } from '@/lib/development'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * A development made from jobs that already exist - "taking two jobs and
 * applying it to a group". Bulk Add only ever made a development and its jobs
 * together, so houses started one at a time could never be gathered after.
 *
 * The development is a folder, not a job, so it uses no slot on the plan (the
 * same as Bulk Add's), and the jobs moved into it were already counted. If the
 * move fails the empty development is taken back out - a folder nobody asked
 * for is the "two Untitled comparison cards" failure in a different place.
 */
export async function POST(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'create')
  if (denied(gate)) return gate.denied
  const companyId = gate.actor.companyId
  if (!companyId) return NextResponse.json({ error: 'No company on this account.' }, { status: 400 })

  const body = await request.json().catch(() => ({} as any))
  const projectIds: string[] = Array.isArray(body?.project_ids) ? body.project_ids.map(String) : []
  const problem = newDevelopmentProblem({ name: body?.name, projectIds })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  // The client and type the jobs share, when they all agree - a development of
  // four Smith houses is a Smith development. When they disagree it says
  // nothing rather than picking one.
  const { data: jobs } = await db.from('projects').select('client, customer_id, type').in('id', projectIds)
  const same = <K extends 'client' | 'customer_id' | 'type'>(k: K) => {
    const vals = Array.from(new Set((jobs ?? []).map((j: any) => j[k] ?? null)))
    return vals.length === 1 ? vals[0] : null
  }

  const { data: dev, error } = await db.from('projects').insert({
    name: String(body.name).trim(),
    address: String(body?.address ?? '').trim() || null,
    is_site: true,
    // What Bulk Add gives a development. Its jobs keep their own statuses.
    status: 'planning',
    type: same('type') || 'residential',
    client: same('client'),
    ...(same('customer_id') ? { customer_id: same('customer_id') } : {}),
    gc_company_id: companyId,
    created_by_company_id: companyId,
  }).select('id, name').single()
  if (error || !dev) {
    console.error('[developments] insert failed', error?.message)
    return NextResponse.json({ error: 'Could not create the development. Try again.' }, { status: 500 })
  }

  const moved = await attachJobs(db, companyId, dev.id, projectIds)
  if ('error' in moved) {
    await db.from('projects').delete().eq('id', dev.id).eq('is_site', true)
    return NextResponse.json({ error: moved.error }, { status: moved.status })
  }
  return NextResponse.json({ development: dev, moved: moved.moved })
}
