import type { SupabaseClient } from '@supabase/supabase-js'
import { expediterFacts, type ExpediterFacts } from './permit-expediter'

// The half of lib/permit-expediter.ts that reads: the expediter companies and
// the subcontracts on these permits' jobs, which is where "hired" lives. ONE
// reader for the permits list and the development board, so the two cannot
// disagree about whether somebody has been hired.
//
// A failed read leaves the facts EMPTY rather than guessing "not hired": an
// unread subcontract would otherwise send a hired expediter's permit back to
// "Hire them", which is a claim about the job, not about the read. The error is
// logged and the permit reads as it would with no expediter on it.

type Row = { id: string; project_id: string; permit_type?: string | null; status?: string | null; expediter_company_id?: string | null }

export async function withExpediterFacts<P extends Row>(
  db: SupabaseClient,
  permits: P[],
  rounds: { permit_id: string; outcome?: string | null }[],
): Promise<(P & ExpediterFacts)[]> {
  const companyIds = Array.from(new Set(permits.map(p => p.expediter_company_id).filter((v): v is string => !!v)))
  if (!companyIds.length) return permits.map(p => ({ ...p, plans_pending: false }))
  const projectIds = Array.from(new Set(permits.map(p => p.project_id)))
  const [companies, subs] = await Promise.all([
    db.from('companies').select('id, name, contact_email').in('id', companyIds),
    db.from('subcontracts').select('id, project_id, company_id, created_at').in('project_id', projectIds).in('company_id', companyIds),
  ])
  if (companies.error || subs.error) {
    console.error('[permit-expediter] read failed', companies.error?.message ?? subs.error?.message)
    return permits.map(p => ({ ...p, expediter_company_id: null, plans_pending: false }))
  }
  const byPermit = new Map<string, { outcome?: string | null }[]>()
  for (const r of rounds) byPermit.set(r.permit_id, [...(byPermit.get(r.permit_id) ?? []), r])
  return expediterFacts(permits, id => byPermit.get(id) ?? [], companies.data ?? [], subs.data ?? [])
}
