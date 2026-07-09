import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

type Hit = {
  id: string
  title: string
  subtitle?: string | null
  href: string
}

type Group = { key: string; label: string; items: Hit[] }

// Escape PostgREST `or()` reserved chars in the raw query so a search like
// "a,b" or "50%" can't break the filter string.
function esc(q: string) {
  return q.replace(/[,()*]/g, ' ').trim()
}

export async function GET(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const raw = (url.searchParams.get('q') ?? '').trim()
  if (raw.length < 2) return NextResponse.json({ groups: [] })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  const companyId = profile?.company_id
  if (!companyId) return NextResponse.json({ groups: [] })

  const q = esc(raw)
  if (!q) return NextResponse.json({ groups: [] })
  const like = `%${q}%`
  const PER = 6 // max hits per category

  // Company's projects (as GC or as owner). Everything else scopes through these.
  const { data: projRows } = await db
    .from('projects')
    .select('id, name, address, client')
    .or(`gc_company_id.eq.${companyId},created_by_company_id.eq.${companyId}`)
  const projects = projRows ?? []
  const projectIds = projects.map(p => p.id)
  const projName = new Map(projects.map(p => [p.id, p.name]))
  const inList = projectIds.length ? projectIds : ['00000000-0000-0000-0000-000000000000']

  const ql = q.toLowerCase()
  // Each category runs independently; a failure (e.g. a column that doesn't
  // exist yet pre-migration) yields an empty group instead of a 500.
  const safe = async (fn: () => Promise<Hit[]>): Promise<Hit[]> => {
    try { return await fn() } catch { return [] }
  }

  const [
    projectHits, budgetHits, materialHits, invoiceHits, subHits,
    rfiHits, taskHits, changeOrderHits, customerHits, directoryHits, teamHits,
  ] = await Promise.all([
    // Projects
    safe(async () => projects
      .filter(p => [p.name, p.address, p.client].some(v => (v ?? '').toLowerCase().includes(ql)))
      .slice(0, PER)
      .map(p => ({ id: p.id, title: p.name, subtitle: [p.client, p.address].filter(Boolean).join(' · ') || null, href: `/projects/${p.id}` }))),

    // Budget line items
    safe(async () => {
      const { data } = await db.from('budget_line_items')
        .select('id, description, cost_code, category, project_id')
        .in('project_id', inList)
        .or(`description.ilike.${like},cost_code.ilike.${like},category.ilike.${like},notes.ilike.${like}`)
        .limit(PER)
      return (data ?? []).map((b: any) => ({
        id: b.id, title: b.description || b.category || 'Budget line',
        subtitle: [b.cost_code, projName.get(b.project_id)].filter(Boolean).join(' · ') || null,
        href: `/projects/${b.project_id}/budget`,
      }))
    }),

    // Material receipts
    safe(async () => {
      const { data } = await db.from('material_purchases')
        .select('id, store_name, category, notes, amount, project_id')
        .in('project_id', inList)
        .or(`store_name.ilike.${like},category.ilike.${like},notes.ilike.${like}`)
        .limit(PER)
      return (data ?? []).map((m: any) => ({
        id: m.id, title: m.store_name || 'Material receipt',
        subtitle: [m.amount != null ? `$${Number(m.amount).toLocaleString()}` : null, projName.get(m.project_id)].filter(Boolean).join(' · ') || null,
        href: `/projects/${m.project_id}/materials`,
      }))
    }),

    // Invoices
    safe(async () => {
      const { data } = await db.from('invoices')
        .select('id, invoice_number, company_name, description, amount, project_id')
        .in('project_id', inList)
        .or(`invoice_number.ilike.${like},company_name.ilike.${like},description.ilike.${like}`)
        .limit(PER)
      return (data ?? []).map((i: any) => ({
        id: i.id, title: `Invoice ${i.invoice_number || ''}`.trim(),
        subtitle: [i.company_name, projName.get(i.project_id)].filter(Boolean).join(' · ') || null,
        href: `/projects/${i.project_id}/invoices`,
      }))
    }),

    // Subcontracts
    safe(async () => {
      const { data } = await db.from('subcontracts')
        .select('id, scope, trade, project_id, companies(name)')
        .in('project_id', inList)
        .or(`scope.ilike.${like},trade.ilike.${like}`)
        .limit(PER)
      return (data ?? []).map((s: any) => ({
        id: s.id, title: s.companies?.name || s.trade || 'Subcontract',
        subtitle: [s.trade, projName.get(s.project_id)].filter(Boolean).join(' · ') || null,
        href: `/projects/${s.project_id}/team`,
      }))
    }),

    // RFIs
    safe(async () => {
      const { data } = await db.from('rfis')
        .select('id, rfi_number, subject, project_id')
        .in('project_id', inList)
        .or(`subject.ilike.${like},description.ilike.${like}`)
        .limit(PER)
      return (data ?? []).map((r: any) => ({
        id: r.id, title: `RFI #${r.rfi_number ?? ''} ${r.subject ?? ''}`.trim(),
        subtitle: projName.get(r.project_id) || null,
        href: `/projects/${r.project_id}/rfis`,
      }))
    }),

    // Tasks
    safe(async () => {
      const { data } = await db.from('project_tasks')
        .select('id, title, description, project_id')
        .in('project_id', inList)
        .or(`title.ilike.${like},description.ilike.${like}`)
        .limit(PER)
      return (data ?? []).map((t: any) => ({
        id: t.id, title: t.title || 'Task',
        subtitle: projName.get(t.project_id) || null,
        href: `/projects/${t.project_id}/tasks`,
      }))
    }),

    // Change orders
    safe(async () => {
      const { data } = await db.from('change_orders')
        .select('id, title, description, project_id')
        .in('project_id', inList)
        .or(`title.ilike.${like},description.ilike.${like}`)
        .limit(PER)
      return (data ?? []).map((c: any) => ({
        id: c.id, title: c.title || 'Change order',
        subtitle: projName.get(c.project_id) || null,
        href: `/projects/${c.project_id}/change-orders`,
      }))
    }),

    // Customers
    safe(async () => {
      const { data } = await db.from('customers')
        .select('id, name, contact_name, email, phone, billing_address')
        .eq('gc_company_id', companyId)
        .or(`name.ilike.${like},contact_name.ilike.${like},email.ilike.${like},phone.ilike.${like},billing_address.ilike.${like}`)
        .limit(PER)
      return (data ?? []).map((c: any) => ({
        id: c.id, title: c.name,
        subtitle: [c.contact_name, c.email, c.phone].filter(Boolean).join(' · ') || null,
        href: `/customers/${c.id}`,
      }))
    }),

    // Directory (companies I've added or work with)
    safe(async () => {
      const { data } = await db.from('companies')
        .select('id, name, trade, contact_email, phone')
        .eq('added_by_company_id', companyId)
        .or(`name.ilike.${like},trade.ilike.${like},contact_email.ilike.${like},phone.ilike.${like}`)
        .limit(PER)
      return (data ?? []).map((c: any) => ({
        id: c.id, title: c.name,
        subtitle: [c.trade, c.contact_email, c.phone].filter(Boolean).join(' · ') || null,
        href: `/directory`,
      }))
    }),

    // Team members (profiles in the same company)
    safe(async () => {
      const { data } = await db.from('profiles')
        .select('id, full_name, email, phone, role')
        .eq('company_id', companyId)
        .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
        .limit(PER)
      return (data ?? []).map((p: any) => ({
        id: p.id, title: p.full_name || p.email || 'Teammate',
        subtitle: [p.email, p.phone].filter(Boolean).join(' · ') || null,
        href: `/settings`,
      }))
    }),
  ])

  const groups: Group[] = [
    { key: 'projects', label: 'Projects', items: projectHits },
    { key: 'budget', label: 'Budget lines', items: budgetHits },
    { key: 'materials', label: 'Material receipts', items: materialHits },
    { key: 'invoices', label: 'Invoices', items: invoiceHits },
    { key: 'subcontracts', label: 'Subcontracts', items: subHits },
    { key: 'rfis', label: 'RFIs', items: rfiHits },
    { key: 'tasks', label: 'Tasks', items: taskHits },
    { key: 'change-orders', label: 'Change orders', items: changeOrderHits },
    { key: 'customers', label: 'Customers', items: customerHits },
    { key: 'directory', label: 'Directory', items: directoryHits },
    { key: 'team', label: 'Team members', items: teamHits },
  ].filter(g => g.items.length > 0)

  return NextResponse.json({ groups })
}
