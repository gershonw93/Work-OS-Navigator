import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { jobAreas } from '@/lib/job-areas'
import { coverageOf, suggestAuthority, type AuthorityCard } from '@/lib/permit-jurisdiction'

export const runtime = 'nodejs'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * Who this job applies to for each permit type asked (`?types=Building,Sign`),
 * worked out from the job's address and the Directory's township cards
 * (lib/permit-jurisdiction.ts). Also hands back the job's area and the cards,
 * so the form can warn about a pick as it is made without asking again.
 * Reads only. A job whose address the map cannot place still gets the
 * "already used on this job" fallback.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'view')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject<{ id: string; address: string | null; geocoded_address: string | null; parent_project_id: string | null }>(
    db, gate.actor, params.id, 'id, address, geocoded_address, parent_project_id')
  if ('denied' in owned) return owned.denied
  const job = owned.project
  const types = (new URL(request.url).searchParams.get('types') ?? '').split(',').map(t => t.trim()).filter(Boolean).slice(0, 30)

  const jobIds = [job.id, ...(job.parent_project_id ? [job.parent_project_id] : [])]
  const [areas, cardsRes, usedRes] = await Promise.all([
    jobAreas(job.geocoded_address || job.address),
    gate.actor.companyId
      ? db.from('companies').select('id, name, type, extra').eq('added_by_company_id', gate.actor.companyId).eq('type', 'inspector').limit(1000)
      : Promise.resolve({ data: [] as any[], error: null as any }),
    db.from('permits').select('issuing_authority').in('project_id', jobIds),
  ])
  if (cardsRes.error) console.error('[permit-authority] directory read failed', cardsRes.error.message)
  if (usedRes.error) console.error('[permit-authority] permits read failed', usedRes.error.message)

  const cards: AuthorityCard[] = (cardsRes.data ?? []).map((c: any) => ({ id: c.id, name: c.name, ...coverageOf(c.extra) }))
  const used = (usedRes.data ?? []).map((p: any) => p.issuing_authority as string | null)
  const suggestions = Object.fromEntries(types.map(t => [t, suggestAuthority(t, areas, cards, used)]))
  return NextResponse.json({ areas, cards: cards.filter(c => c.covers.length || c.issues.length), suggestions })
}
