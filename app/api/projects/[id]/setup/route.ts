import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { setupProgress } from '@/lib/job-setup'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * What is still missing on a job you are setting up.
 *
 * Every count is best-effort. A table that does not exist yet, or a permission
 * that blocks one, must not take the whole checklist down - a setup guide that
 * fails to load is worse than one reporting a zero.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const count = async (table: string, column = 'project_id') => {
    try {
      const { count: c } = await db.from(table)
        .select('id', { count: 'exact', head: true })
        .eq(column, params.id)
      return c ?? 0
    } catch { return 0 }
  }

  const [
    { data: project },
    budgetLines, plans, teamMembers, subcontracts, complianceDocs, scheduleItems, shares,
    dismissed,
  ] = await Promise.all([
    db.from('projects')
      .select('address, client, customer_id, contract_type, billing_mode, start_date')
      .eq('id', params.id).maybeSingle(),
    count('budget_line_items'),
    count('project_plans'),
    count('project_team_members'),
    count('subcontracts'),
    count('compliance_documents'),
    count('schedule_items'),
    count('file_shares'),
    // Per PERSON, not per browser. Hiding it on the laptop must also hide it on
    // the phone, and must not hide it for a colleague sharing the machine.
    db.from('project_setup_dismissals')
      .select('user_id', { head: true, count: 'exact' })
      .eq('project_id', params.id).eq('user_id', user.id)
      .then(r => (r.count ?? 0) > 0, () => false),
  ])

  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const p: any = project
  const progress = setupProgress({
    hasAddress: !!(p.address ?? '').trim(),
    hasContractType: !!p.contract_type,
    hasClient: !!((p.client ?? '').trim() || p.customer_id),
    contractType: p.contract_type ?? null,
    budgetLines, plans, teamMembers, subcontracts, complianceDocs, scheduleItems,
    shared: shares > 0,
    billingMode: p.billing_mode ?? 'simple',
  })

  return NextResponse.json({ ...progress, dismissed })
}

/** Hide the checklist for THIS person on this job, or bring it back. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const dismissed = !!body?.dismissed

  if (dismissed) {
    const { error } = await db.from('project_setup_dismissals')
      .upsert({ user_id: user.id, project_id: params.id }, { onConflict: 'user_id,project_id' })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  } else {
    const { error } = await db.from('project_setup_dismissals')
      .delete().eq('user_id', user.id).eq('project_id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, dismissed })
}
