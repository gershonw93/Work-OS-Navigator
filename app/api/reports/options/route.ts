import { NextResponse } from 'next/server'
import { reportDb } from '@/lib/report-admin-db'
import { reportCtx, allowedSections, companyProjects } from '@/lib/report-load'
import { actorCan } from '@/lib/server-permissions'
import { reachableEmail } from '@/lib/email'

export const runtime = 'nodejs'

/**
 * What the report builder can offer this person: their jobs, customers, subs
 * and suppliers to pick from, the sections they may include, and whether they
 * may save and share. The screen asks once, so the pickers and the route that
 * runs the report agree on what exists.
 */
export async function GET(request: Request) {
  const db = reportDb()
  const gate = await reportCtx(db, request, 'view')
  if ('denied' in gate) return gate.denied
  const { ctx } = gate

  let projects: any[]
  try {
    projects = await companyProjects(db, ctx.companyId)
  } catch {
    return NextResponse.json({ error: 'Could not load your jobs. Try again.' }, { status: 500 })
  }
  const ids = projects.map(p => p.id)

  const subsOnJobs = async () => {
    const out: any[] = []
    for (let i = 0; i < ids.length; i += 150) {
      const res = await db.from('subcontracts').select('company_id').in('project_id', ids.slice(i, i + 150)).limit(10000)
      if (res.error) return res
      out.push(...(res.data ?? []))
    }
    return { data: out, error: null }
  }
  const [customersRes, directoryRes, subsRes] = await Promise.all([
    db.from('customers').select('id, name, email').eq('gc_company_id', ctx.companyId).order('name').limit(5000),
    db.from('companies').select('id, name, type, trade, contact_email').eq('added_by_company_id', ctx.companyId).in('type', ['subcontractor', 'supplier']).order('name').limit(5000),
    subsOnJobs(),
  ])
  const failed = [customersRes, directoryRes, subsRes].find((r: any) => r.error)
  if (failed) {
    console.error('[reports options]', (failed as any).error)
    return NextResponse.json({ error: 'Could not load the pickers for Reports. Try again.' }, { status: 500 })
  }

  // A sub on one of our jobs who is not in our own Directory (they were added
  // by somebody else) is still somebody we can report on.
  const known = new Map<string, any>((directoryRes.data ?? []).map((c: any) => [c.id, c]))
  const extra = Array.from(new Set(((subsRes.data ?? []) as any[]).map(s => s.company_id).filter((id: string | null) => id && !known.has(id))))
  if (extra.length) {
    for (let i = 0; i < extra.length; i += 150) {
      const { data } = await db.from('companies').select('id, name, type, trade, contact_email').in('id', extra.slice(i, i + 150))
      for (const c of data ?? []) known.set((c as any).id, c)
    }
  }
  const companies = Array.from(known.values()).sort((a, b) => String(a.name).localeCompare(String(b.name)))

  return NextResponse.json({
    projects: projects.map(p => ({ id: p.id, name: p.name, status: p.status, customer_id: p.customer_id })),
    // The address to pre-fill when sharing - only one that can actually be
    // written to, never a placeholder.
    customers: (customersRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name, email: reachableEmail(c.email) })),
    subs: companies.filter(c => c.type !== 'supplier').map(c => ({ id: c.id, name: c.name, trade: c.trade, email: reachableEmail(c.contact_email) })),
    suppliers: companies.filter(c => c.type === 'supplier').map(c => ({ id: c.id, name: c.name, trade: c.trade, email: reachableEmail(c.contact_email) })),
    sections: allowedSections(ctx.actor),
    canSave: actorCan(ctx.actor, 'reports', 'create'),
    canDelete: actorCan(ctx.actor, 'reports', 'delete'),
    companyName: ctx.companyName,
    logoUrl: ctx.logoUrl,
  })
}
