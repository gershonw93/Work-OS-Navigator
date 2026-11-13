import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { permitHistory } from '@/lib/permit-history'
import { withExpediterFacts } from '@/lib/permit-expediter-db'
import { authoritiesFor } from '@/lib/permit-authorities'
import { createPermit } from '@/lib/writes/permit'
import { answerRound, submitRound } from '@/lib/writes/permit-round'
import { openRound } from '@/lib/permit-rounds'
import { bulkMisfit, bulkProblem, type BulkAction } from '@/lib/permit-board'
import { permitStanding } from '@/lib/permit-rounds'

export const runtime = 'nodejs'
// Twenty houses, each a handful of round trips: inside the default, but a
// bulk that is cut off half way leaves half the houses logged and no answer
// to say which. Room to finish.
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PERMIT_COLS = 'id, project_id, permit_type, permit_number, description, status, issued_date, expiry_date, issuing_authority, inspector_name, inspector_phone, notes, file_url, created_at, expediter_company_id'

/**
 * The development, its houses, and every permit on any of them. A job that
 * is not a development answers `{ isSite: false }` so the Permits tab can ask
 * every job without knowing first which kind it is.
 */
async function development(db: any, actor: any, id: string) {
  // Asked first: the Permits tab asks this of EVERY job, and a job that is not
  // a development has no board whoever is looking - an ownership refusal there
  // would print an error over an ordinary permit list.
  const { data: kind, error: kindErr } = await db.from('projects').select('is_site').eq('id', id).maybeSingle()
  if (kindErr) {
    console.error('[permit-board] project read failed', kindErr.message)
    return { denied: NextResponse.json({ error: 'Could not read this job.' }, { status: 500 }) }
  }
  if (!kind?.is_site) return { notSite: true as const }
  const owned = await ownedProject<{ id: string; is_site: boolean | null; name: string }>(db, actor, id, 'id, is_site, name')
  if ('denied' in owned) return { denied: owned.denied }
  if (!owned.project.is_site) return { notSite: true as const }
  const { data: houses, error } = await db
    .from('projects')
    .select('id, name, unit, floor, lot, block, status')
    .eq('parent_project_id', id)
  if (error) {
    console.error('[permit-board] houses read failed', error.message)
    return { denied: NextResponse.json({ error: 'Could not read the houses in this development.' }, { status: 500 }) }
  }
  const sorted = (houses ?? []).sort((a: any, b: any) => {
    const key = (r: any) => r.lot ?? r.unit ?? r.floor ?? r.name ?? ''
    return String(key(a)).localeCompare(String(key(b)), undefined, { numeric: true, sensitivity: 'base' })
  })
  return { site: owned.project, houses: sorted as any[] }
}


export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'view')
  if (denied(gate)) return gate.denied
  const dev = await development(db, gate.actor, params.id)
  if ('denied' in dev) return dev.denied
  if ('notSite' in dev) return NextResponse.json({ isSite: false })

  // The development's own permits (site work, the subdivision itself) belong
  // on the board too, as their own row.
  const projectIds = [params.id, ...dev.houses.map(h => h.id)]
  const { data: permits, error } = await db.from('permits').select(PERMIT_COLS).in('project_id', projectIds)
  if (error) {
    console.error('[permit-board] permits read failed', error.message)
    return NextResponse.json({ error: 'Could not read the permits.' }, { status: 500 })
  }
  const [{ rounds, items, shares, replies, ok }, authorities] = await Promise.all([
    permitHistory(db, (permits ?? []).map(p => p.id)),
    authoritiesFor(db, gate.actor.companyId, (permits ?? []).map(p => p.issuing_authority)),
  ])
  return NextResponse.json({
    authorities,
    isSite: true,
    site: { id: dev.site.id, name: dev.site.name },
    houses: dev.houses,
    permits: await withExpediterFacts(db, (permits ?? []) as any[], rounds),
    rounds, items, shares, replies, history: ok,
  })
}

/**
 * One action across many houses: add a permit type to the houses missing it,
 * log a submission, or record a corrections / rejection answer. Each house
 * goes through exactly the write a single permit does, so every rule holds,
 * and each house reports its own outcome - one house refused never takes the
 * others down, and never disappears from the answer.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const dev = await development(db, gate.actor, params.id)
  if ('denied' in dev) return dev.denied
  if ('notSite' in dev) return NextResponse.json({ error: 'That job is not a development.' }, { status: 400 })

  const body = await request.json().catch(() => ({} as any))
  const action = String(body?.action ?? '') as BulkAction
  const permitType = String(body?.permit_type ?? '').trim()
  const ids: string[] = Array.isArray(body?.project_ids) ? Array.from(new Set(body.project_ids.map(String))) : []
  const problem = bulkProblem({ action, permit_type: permitType, project_ids: ids, outcome: body?.outcome ?? null, items: Array.isArray(body?.items) ? body.items.map(String) : [] })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  // Every id must be this development or one of its houses - the ownership
  // check above covered the development, not whatever ids the body names.
  const allowed = new Map<string, string>([[params.id, dev.site.name], ...dev.houses.map(h => [h.id, h.name] as [string, string])])
  const stranger = ids.find(id => !allowed.has(id))
  if (stranger) return NextResponse.json({ error: 'One of those jobs is not in this development.' }, { status: 400 })

  const { data: permits, error } = await db.from('permits')
    .select(PERMIT_COLS).in('project_id', ids).eq('permit_type', permitType)
  if (error) {
    console.error('[permit-board] permits read failed', error.message)
    return NextResponse.json({ error: 'Could not read the permits. Nothing was changed.' }, { status: 500 })
  }
  const byHouse = new Map<string, any[]>()
  for (const p of permits ?? []) byHouse.set(p.project_id, [...(byHouse.get(p.project_id) ?? []), p])

  const results: { project_id: string; name: string; ok: boolean; message: string }[] = []
  for (const projectId of ids) {
    const name = allowed.get(projectId)!
    const mine = byHouse.get(projectId) ?? []
    const say = (ok: boolean, message: string) => results.push({ project_id: projectId, name, ok, message })

    if (action === 'add') {
      if (mine.length) { say(false, `Already has a ${permitType} permit`); continue }
      const r = await createPermit(db, {
        userId: gate.actor.userId, projectId,
        fields: {
          permit_type: permitType, status: 'pending',
          issuing_authority: body?.issuing_authority ?? null, description: body?.description ?? null,
        },
      })
      say(r.status < 300, r.status < 300 ? 'Added' : String(r.body.error))
      continue
    }

    // Submitting and answering are about ONE permit. With none there is
    // nothing to log against; with two, guessing which is how the wrong
    // permit gets marked approved.
    if (!mine.length) { say(false, `No ${permitType} permit yet`); continue }
    if (mine.length > 1) { say(false, `Has ${mine.length} ${permitType} permits - log it on the house`); continue }
    const permit = mine[0]

    if (action === 'submit') {
      // The rule the dialog greys houses out by, asked here too: a permit
      // already with the city, issued or closed is not marked sent again.
      const h = await permitHistory(db, [permit.id])
      if (!h.ok) { say(false, 'Could not read its history'); continue }
      const why = bulkMisfit('submit', permitType, permitStanding(permit, h.rounds, h.items, new Date().toISOString().slice(0, 10)))
      if (why) { say(false, why); continue }
      const r = await submitRound(db, {
        userId: gate.actor.userId, projectId, permitId: permit.id,
        fields: { submitted_on: body?.submitted_on ?? null, expected_by: body?.expected_by ?? null, note: body?.note ?? null },
      })
      say(r.status < 300, r.status < 300 ? 'Logged' : String(r.body.error))
      continue
    }

    // answer
    const { rounds, ok } = await permitHistory(db, [permit.id])
    if (!ok) { say(false, 'Could not read its history'); continue }
    const waiting = openRound(rounds)
    if (!waiting) { say(false, 'Nothing waiting on an answer'); continue }
    const r = await answerRound(db, {
      userId: gate.actor.userId, projectId, permitId: permit.id, roundId: waiting.id,
      fields: {
        outcome: body?.outcome ?? null, outcome_on: body?.outcome_on ?? null,
        note: body?.note ?? null, items: Array.isArray(body?.items) ? body.items.map(String) : [],
      },
    })
    say(r.status < 300, r.status < 300 ? 'Recorded' : String(r.body.error))
  }

  const done = results.filter(r => r.ok).length
  return NextResponse.json({ results, done, skipped: results.length - done })
}
