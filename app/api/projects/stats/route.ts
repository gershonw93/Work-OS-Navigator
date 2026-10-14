import { createClient } from '@supabase/supabase-js'
import { vendorPosition } from '@/lib/escrow'
import { toAmount } from '@/lib/schedule-dependencies'
import { NextResponse } from 'next/server'
import { isAssignedOnly } from '@/lib/permissions'
import { myJobs } from '@/lib/my-jobs'
import { requirePermission, denied } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request) {
  // The Projects list's strip. Scoped below to the jobs the caller can see:
  // their assigned ones for an assigned-only role, the company's otherwise.
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'view')
  if (denied(gate)) return gate.denied
  const user = { id: gate.actor.userId }

  const { data: profile } = await db.from('profiles').select('company_id, role, email, full_name').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ stats: {} })

  // Determine which projects this user can see
  let projectIds: string[] = []
  if (isAssignedOnly(profile.role)) {
    // One home for this - see lib/my-jobs.ts. The name fallback here was
    // unscoped too, so the stats strip could count another company's job.
    projectIds = (await myJobs(db, user.id, profile)).projectIds
  } else {
    const { data: projs } = await db.from('projects').select('id').eq('gc_company_id', profile.company_id)
    projectIds = (projs ?? []).map((p: any) => p.id)
  }

  if (projectIds.length === 0) return NextResponse.json({ stats: {} })

  const [{ data: tasks }, { data: subs }, { data: invoices }] = await Promise.all([
    db.from('project_tasks').select('project_id, status').in('project_id', projectIds),
    db.from('subcontracts').select('project_id, contract_amount').in('project_id', projectIds),
    db.from('invoices').select('project_id, amount, status, client_paid, escrow_paid').in('project_id', projectIds),
  ])

  const stats: Record<string, {
    progressPct: number
    contracted: number
    paid: number
    outstanding: number
    awaitingApproval: number
    taskTotal: number
    taskDone: number
  }> = {}
  for (const id of projectIds) {
    stats[id] = { progressPct: 0, contracted: 0, paid: 0, outstanding: 0, awaitingApproval: 0, taskTotal: 0, taskDone: 0 }
  }

  for (const t of tasks ?? []) {
    const s = stats[(t as any).project_id]; if (!s) continue
    s.taskTotal += 1
    if ((t as any).status === 'completed') s.taskDone += 1
  }
  for (const sub of subs ?? []) {
    const s = stats[(sub as any).project_id]; if (!s) continue
    s.contracted += toAmount((sub as any).contract_amount) ?? 0
  }
  // Paid and Outstanding from the ONE rule (lib/escrow.ts vendorPosition).
  // This summed approved + PENDING and left out sent, so a job whose only bill
  // was waiting for approval read "Outstanding $9K" here and $0 on its own
  // Overview, Financial Summary and Master Money. It also added `numeric`
  // amounts with `+`, which concatenates the strings PostgREST sends.
  const byProject = new Map<string, any[]>()
  for (const inv of invoices ?? []) {
    const id = (inv as any).project_id
    if (!byProject.has(id)) byProject.set(id, [])
    byProject.get(id)!.push(inv)
  }
  for (const [id, rows] of Array.from(byProject.entries())) {
    const s = stats[id]; if (!s) continue
    const v = vendorPosition(rows)
    s.paid = v.paid
    s.outstanding = v.outstanding
    s.awaitingApproval = v.awaitingApproval
  }
  for (const id of projectIds) {
    const s = stats[id]
    s.progressPct = s.taskTotal === 0 ? 0 : Math.round((s.taskDone / s.taskTotal) * 100)
  }

  return NextResponse.json({ stats })
}
