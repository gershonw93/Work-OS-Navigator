import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isAssignedOnly } from '@/lib/permissions'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role, email, full_name').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ stats: {} })

  // Determine which projects this user can see
  let projectIds: string[] = []
  if (isAssignedOnly(profile.role)) {
    const { data: byProfileId } = await db.from('project_team_members').select('project_id').eq('profile_id', user.id)
    projectIds = (byProfileId ?? []).map((a: any) => a.project_id).filter(Boolean)
    if (projectIds.length === 0) {
      const conds: string[] = []
      if (profile.email) conds.push(`email.eq.${profile.email}`)
      if (profile.full_name) conds.push(`name.eq.${profile.full_name}`)
      if (conds.length > 0) {
        const { data: byNE } = await db.from('project_team_members').select('project_id').or(conds.join(','))
        projectIds = (byNE ?? []).map((a: any) => a.project_id).filter(Boolean)
      }
    }
  } else {
    const { data: projs } = await db.from('projects').select('id').eq('gc_company_id', profile.company_id)
    projectIds = (projs ?? []).map((p: any) => p.id)
  }

  if (projectIds.length === 0) return NextResponse.json({ stats: {} })

  const [{ data: tasks }, { data: subs }, { data: invoices }] = await Promise.all([
    db.from('project_tasks').select('project_id, status').in('project_id', projectIds),
    db.from('subcontracts').select('project_id, contract_amount').in('project_id', projectIds),
    db.from('invoices').select('project_id, amount, status').in('project_id', projectIds),
  ])

  const stats: Record<string, {
    progressPct: number
    contracted: number
    paid: number
    outstanding: number
    taskTotal: number
    taskDone: number
  }> = {}
  for (const id of projectIds) {
    stats[id] = { progressPct: 0, contracted: 0, paid: 0, outstanding: 0, taskTotal: 0, taskDone: 0 }
  }

  for (const t of tasks ?? []) {
    const s = stats[(t as any).project_id]; if (!s) continue
    s.taskTotal += 1
    if ((t as any).status === 'completed') s.taskDone += 1
  }
  for (const sub of subs ?? []) {
    const s = stats[(sub as any).project_id]; if (!s) continue
    s.contracted += (sub as any).contract_amount ?? 0
  }
  for (const inv of invoices ?? []) {
    const s = stats[(inv as any).project_id]; if (!s) continue
    const amt = (inv as any).amount ?? 0
    if ((inv as any).status === 'paid') s.paid += amt
    else if (['approved', 'pending_approval'].includes((inv as any).status)) s.outstanding += amt
  }
  for (const id of projectIds) {
    const s = stats[id]
    s.progressPct = s.taskTotal === 0 ? 0 : Math.round((s.taskDone / s.taskTotal) * 100)
  }

  return NextResponse.json({ stats })
}
