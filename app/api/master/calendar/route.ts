import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Cross-project calendar: schedule items + task due dates across all the
// company's projects. Admin/manager only. Each item links to its project.
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ items: [], projects: [] })
  if (!['admin', 'manager'].includes(profile.role ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })

  const { data: projects } = await db
    .from('projects')
    .select('id, name')
    .or(`gc_company_id.eq.${profile.company_id},created_by_company_id.eq.${profile.company_id}`)

  const ids = (projects ?? []).map(p => p.id)
  if (!ids.length) return NextResponse.json({ items: [], projects: [] })
  const nameById = new Map((projects ?? []).map(p => [p.id, p.name]))

  const [{ data: sched }, { data: tasks }, { data: inspections }] = await Promise.all([
    db.from('schedule_items').select('id, project_id, start_date, end_date, label, color, subcontract_id, subcontracts(scope, trade, companies(name))').in('project_id', ids),
    db.from('project_tasks').select('id, project_id, title, due_date, status').in('project_id', ids).not('due_date', 'is', null),
    db.from('inspections').select('id, project_id, type, trade, status, scheduled_date').in('project_id', ids).not('scheduled_date', 'is', null),
  ])

  const items: any[] = []
  for (const s of sched ?? []) {
    const sub: any = (s as any).subcontracts
    const title = s.label || sub?.companies?.name || sub?.scope || sub?.trade || 'Scheduled'
    items.push({
      id: `s_${s.id}`, kind: 'schedule', project_id: s.project_id, project_name: nameById.get(s.project_id) ?? '',
      title, start: s.start_date, end: s.end_date ?? s.start_date, color: s.color ?? 'blue',
      href: `/projects/${s.project_id}/schedule`,
    })
  }
  for (const t of tasks ?? []) {
    items.push({
      id: `t_${t.id}`, kind: 'task', project_id: t.project_id, project_name: nameById.get(t.project_id) ?? '',
      title: t.title, start: t.due_date, end: t.due_date, color: t.status === 'completed' ? 'green' : 'amber',
      done: t.status === 'completed', href: `/projects/${t.project_id}/tasks`,
    })
  }

  for (const ins of inspections ?? []) {
    const done = ins.status === 'passed' || ins.status === 'failed'
    items.push({
      id: `i_${ins.id}`, kind: 'inspection', project_id: ins.project_id, project_name: nameById.get(ins.project_id) ?? '',
      title: `${ins.type ?? 'Inspection'}${ins.trade ? ` (${ins.trade})` : ''}`, start: ins.scheduled_date, end: ins.scheduled_date,
      color: ins.status === 'failed' ? 'red' : ins.status === 'passed' ? 'green' : 'purple',
      done, href: `/projects/${ins.project_id}/inspections`,
    })
  }

  return NextResponse.json({ items, projects: projects ?? [] })
}
