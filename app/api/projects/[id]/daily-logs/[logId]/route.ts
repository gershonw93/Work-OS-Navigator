import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const ALLOWED_FIELDS = ['log_date', 'workers_onsite', 'notes', 'weather', 'temp_f', 'has_issues', 'issue_description', 'delays', 'subs_on_site'] as const

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; logId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const updates: Record<string, unknown> = {}
  for (const key of ALLOWED_FIELDS) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  // Core columns guaranteed to exist; the rest are optional and may be absent
  const CORE = new Set(['log_date', 'workers_onsite', 'notes', 'weather'])

  async function runUpdate(payload: Record<string, unknown>) {
    return db
      .from('daily_logs')
      .update(payload)
      .eq('id', params.logId)
      .eq('project_id', params.id)
      .select()
      .single()
  }

  let { data: log, error } = await runUpdate(updates)

  // If a column doesn't exist, retry with only the core columns so the save still succeeds
  if (error && (error as any).code === '42703') {
    const safe: Record<string, unknown> = {}
    for (const k of Object.keys(updates)) if (CORE.has(k)) safe[k] = updates[k]
    if (Object.keys(safe).length > 0) {
      const retry = await runUpdate(safe)
      log = retry.data
      error = retry.error
    }
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ log })
}

export async function DELETE(request: Request, { params }: { params: { id: string; logId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await db.from('daily_logs').delete().eq('id', params.logId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
