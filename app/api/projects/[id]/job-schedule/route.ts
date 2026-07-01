import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

// This project's job schedule + the company's other scheduled jobs (for overlap checks).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  const { data: project } = await db.from('projects')
    .select('id, name, sched_start, sched_days, sched_workers').eq('id', params.id).single()

  let others: any[] = []
  if (profile?.company_id) {
    const { data } = await db.from('projects')
      .select('id, name, sched_start, sched_days, sched_workers, status')
      .eq('created_by_company_id', profile.company_id)
      .neq('id', params.id)
      .not('sched_start', 'is', null)
      .in('status', ['planning', 'active'])
    others = data ?? []
  }
  return NextResponse.json({ project: project ?? null, others })
}

// Save this project's schedule.
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await auth(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await request.json()
  const updates: Record<string, unknown> = {}
  if (body.sched_start !== undefined) updates.sched_start = body.sched_start || null
  if (body.sched_days !== undefined) updates.sched_days = body.sched_days != null ? Number(body.sched_days) : null
  if (body.sched_workers !== undefined) updates.sched_workers = body.sched_workers != null ? Number(body.sched_workers) : null
  const { error } = await admin().from('projects').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
