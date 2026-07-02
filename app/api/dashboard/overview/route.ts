import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Admin/owner dashboard extras: monthly cash in vs out, this week's items,
// and recent projects with progress. 403 for non-admin roles (page falls back).
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role, full_name').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 403 })
  if (!['admin', 'manager'].includes(profile.role ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  const firstName = (profile.full_name ?? '').trim().split(/\s+/)[0] || null

  const { data: projects } = await db
    .from('projects')
    .select('id, name, status, created_at')
    .or(`gc_company_id.eq.${profile.company_id},created_by_company_id.eq.${profile.company_id}`)
    .order('created_at', { ascending: false })
  const ids = (projects ?? []).map(p => p.id)
  if (!ids.length) return NextResponse.json({ months: [], week: [], recent: [], dueThisWeek: 0, first_name: firstName })

  const now = new Date()
  const windowStart = new Date(now.getFullYear(), now.getMonth() - 7, 1) // last 8 months
  const weekEnd = new Date(now.getTime() + 7 * 86400000)
  const todayIso = now.toISOString().split('T')[0]
  const weekEndIso = weekEnd.toISOString().split('T')[0]

  const [{ data: paymentsIn }, { data: invoicesPaid }, { data: sched }, { data: tasks }, { data: allTasks }] = await Promise.all([
    db.from('client_payments').select('amount, paid_date, created_at').in('project_id', ids),
    db.from('invoices').select('amount, status, updated_at, created_at').in('project_id', ids).eq('status', 'paid'),
    db.from('schedule_items')
      .select('id, project_id, label, start_date, subcontracts(scope, trade, companies(name, type))')
      .in('project_id', ids).gte('start_date', todayIso).lte('start_date', weekEndIso)
      .order('start_date').limit(8),
    db.from('project_tasks')
      .select('id, project_id, title, due_date, status')
      .in('project_id', ids).neq('status', 'completed')
      .gte('due_date', todayIso).lte('due_date', weekEndIso)
      .order('due_date').limit(8),
    db.from('project_tasks').select('project_id, status').in('project_id', ids),
  ])

  // Monthly cash in vs out (last 8 months)
  const months: { label: string; in: number; out: number }[] = []
  const keyOf = (d: Date) => `${d.getFullYear()}-${d.getMonth()}`
  const idx = new Map<string, number>()
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - 7 + i, 1)
    idx.set(keyOf(d), months.length)
    months.push({ label: d.toLocaleDateString(undefined, { month: 'short' }), in: 0, out: 0 })
  }
  for (const p of paymentsIn ?? []) {
    const d = new Date((p.paid_date ?? p.created_at) + (p.paid_date ? 'T00:00:00' : ''))
    if (isNaN(d.getTime()) || d < windowStart) continue
    const i = idx.get(keyOf(d)); if (i !== undefined) months[i].in += Number(p.amount || 0)
  }
  for (const inv of invoicesPaid ?? []) {
    const d = new Date(inv.updated_at ?? inv.created_at)
    if (isNaN(d.getTime()) || d < windowStart) continue
    const i = idx.get(keyOf(d)); if (i !== undefined) months[i].out += Number(inv.amount || 0)
  }

  // This week: schedule items + due tasks, merged and sorted
  const nameById = new Map((projects ?? []).map(p => [p.id, p.name]))
  const week = [
    ...(sched ?? []).map((s: any) => ({
      kind: s.subcontracts?.companies?.type === 'supplier' ? 'delivery' : 'schedule',
      label: s.label || s.subcontracts?.companies?.name || s.subcontracts?.scope || 'Scheduled',
      project: nameById.get(s.project_id) ?? '',
      project_id: s.project_id,
      date: s.start_date,
    })),
    ...(tasks ?? []).map((t: any) => ({
      kind: 'task', label: t.title, project: nameById.get(t.project_id) ?? '', project_id: t.project_id, date: t.due_date,
    })),
  ].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? '')).slice(0, 6)

  const dueThisWeek = (tasks ?? []).length + (sched ?? []).length

  // Recent projects with task-based progress
  const prog = new Map<string, { total: number; done: number }>()
  for (const t of allTasks ?? []) {
    const p = prog.get((t as any).project_id) ?? { total: 0, done: 0 }
    p.total += 1; if ((t as any).status === 'completed') p.done += 1
    prog.set((t as any).project_id, p)
  }
  const recent = (projects ?? []).slice(0, 5).map(p => {
    const s = prog.get(p.id)
    return { id: p.id, name: p.name, status: p.status, pct: s && s.total > 0 ? Math.round((s.done / s.total) * 100) : 0 }
  })

  return NextResponse.json({ months, week, recent, dueThisWeek, first_name: firstName })
}
