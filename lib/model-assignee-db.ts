// Who a model's punch item may go to, read from the database. One reader for
// the editor's dropdown AND the route that saves a pick, so the list offered
// and the list accepted cannot disagree - an id from a body proves nothing.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface AssignablePeople {
  teammates: { id: string; name: string; role: string | null }[]
  companies: { id: string; name: string; trade: string | null; type: string | null }[]
}

/** Never offered as a sub: our own GCs and inspectors are not who does a punch item. */
const NOT_A_SUB = new Set(['gc', 'inspector'])

/**
 * Teammates are everybody with an account at this company. Subs are the
 * Directory's: companies this company added, plus every company holding a
 * subcontract on one of its jobs. A refused read throws - an empty dropdown
 * is a claim that there is nobody.
 */
export async function assignablePeople(db: SupabaseClient, companyId: string): Promise<AssignablePeople> {
  const [team, added, jobs] = await Promise.all([
    db.from('profiles').select('id, full_name, email, role').eq('company_id', companyId).order('full_name'),
    db.from('companies').select('id, name, trade, type').eq('added_by_company_id', companyId),
    db.from('projects').select('id').eq('gc_company_id', companyId),
  ])
  for (const r of [team, added, jobs]) if (r.error) throw new Error(`reading who can be assigned: ${r.error.message}`)

  const jobIds = (jobs.data ?? []).map((j: any) => j.id)
  let onJobs: any[] = []
  if (jobIds.length) {
    const { data, error } = await db.from('subcontracts').select('companies!inner(id, name, trade, type)').in('project_id', jobIds)
    if (error) throw new Error(`reading who can be assigned: ${error.message}`)
    onJobs = (data ?? []).map((s: any) => s.companies).filter(Boolean)
  }

  const companies = new Map<string, AssignablePeople['companies'][number]>()
  for (const c of [...(added.data ?? []), ...onJobs] as any[]) {
    if (!c?.id || c.id === companyId || NOT_A_SUB.has(c.type)) continue
    companies.set(c.id, { id: c.id, name: c.name || 'Unnamed company', trade: c.trade ?? null, type: c.type ?? null })
  }

  return {
    teammates: (team.data ?? []).map((p: any) => ({ id: p.id, name: (p.full_name || p.email || 'Unnamed').trim(), role: p.role ?? null })),
    companies: Array.from(companies.values()).sort((a, b) => a.name.localeCompare(b.name)),
  }
}
