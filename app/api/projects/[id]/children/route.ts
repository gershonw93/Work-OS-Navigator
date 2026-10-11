import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { attachJobs, detachJob } from '@/lib/development-db'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// The jobs grouped under a site, with each one's budget roll-up. This is the
// only view where a building's units are totalled, so the numbers are computed
// here rather than making the page fetch a budget per unit.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'view')
  if (denied(gate)) return gate.denied
  // THE ROLL-UP IS MONEY - every house's budget and spend, and the group's own
  // main budget. That is the GC's position on the job, and it answered any
  // signed-in user who knew a site id.
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { data: site } = await db
    .from('projects').select('id, name, address').eq('id', params.id).single()

  let { data: rows, error } = await db
    .from('projects')
    .select('id, name, status, unit, floor, address, sellout_amount, lot, block, garage_side, city_water, city_sewer, lat, lng, model_id')
    .eq('parent_project_id', params.id)
    .order('created_at', { ascending: true })

  // Pre-migration fallbacks: sellout may not exist yet, and before that the
  // parent link itself may not - in which case nothing is grouped at all.
  if (error && (error as any).code === '42703') {
    const retry = await db
      .from('projects')
      .select('id, name, status, unit, floor, address')
      .eq('parent_project_id', params.id)
      .order('created_at', { ascending: true })
    if (retry.error) return NextResponse.json({ site: site ?? null, children: [] })
    rows = retry.data as any
    error = null
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = (rows ?? []).map(r => r.id)
  const budgeted = new Map<string, number>()
  const actual = new Map<string, number>()

  if (ids.length) {
    const { data: lines } = await db
      .from('budget_line_items')
      .select('project_id, budgeted_amount, actual_amount')
      .in('project_id', ids)
    for (const l of lines ?? []) {
      budgeted.set(l.project_id, (budgeted.get(l.project_id) ?? 0) + Number(l.budgeted_amount ?? 0))
      actual.set(l.project_id, (actual.get(l.project_id) ?? 0) + Number(l.actual_amount ?? 0))
    }
  }

  // Units sort naturally: 2 before 10, and "3B" beside "3A".
  const children = (rows ?? [])
    .map(r => ({
      ...r,
      budgeted: budgeted.get(r.id) ?? 0,
      actual: actual.get(r.id) ?? 0,
      sellout: (r as any).sellout_amount != null ? Number((r as any).sellout_amount) : null,
    }))
    .sort((a, b) => {
      const key = (r: any) => r.unit ?? r.floor ?? r.name ?? ''
      return String(key(a)).localeCompare(String(key(b)), undefined, { numeric: true, sensitivity: 'base' })
    })

  // THE MAIN BUDGET: the group's own lines (land, roads, sitework - anything
  // every house shares). Added to the houses' total on the Jobs screen, never
  // folded into one house.
  const { data: siteLines, error: siteErr } = await db
    .from('budget_line_items').select('budgeted_amount, actual_amount').eq('project_id', params.id)
  if (siteErr) console.error('[children] site budget read failed', siteErr.message)
  const siteBudget = siteErr ? null : {
    budgeted: (siteLines ?? []).reduce((t, l: any) => t + Number(l.budgeted_amount ?? 0), 0),
    actual: (siteLines ?? []).reduce((t, l: any) => t + Number(l.actual_amount ?? 0), 0),
    lines: (siteLines ?? []).length,
  }

  // Model names, so a row can say which model a house is.
  const { data: models } = await db.from('site_models').select('id, name').eq('site_id', params.id)

  return NextResponse.json({ site: site ?? null, children, siteBudget, models: models ?? [] })
}

/** The development itself: owned by the caller's company, and actually one. */
async function developmentFor(db: any, request: Request, id: string) {
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return { denied: gate.denied }
  const owned = await ownedProject<{ id: string; is_site: boolean | null }>(db, gate.actor, id, 'id, is_site')
  if ('denied' in owned) return { denied: owned.denied }
  if (!owned.project.is_site) {
    return { denied: NextResponse.json({ error: 'That job is not a development.' }, { status: 400 }) }
  }
  return { actor: gate.actor }
}

/**
 * Put jobs you already have into this development - "taking two jobs and
 * applying it to a group". Moving a job between developments is the same
 * call: it simply lands here. Nothing about the jobs themselves changes, and
 * no slot is used - they were already counted, and a development is a folder.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const dev = await developmentFor(db, request, params.id)
  if ('denied' in dev) return dev.denied
  const body = await request.json().catch(() => ({} as any))
  const ids: string[] = Array.isArray(body?.project_ids) ? body.project_ids.map(String) : []
  const out = await attachJobs(db, dev.actor.companyId ?? '', params.id, ids)
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status })
  return NextResponse.json(out)
}

/** Take one job out of this development: `?project=<id>`. The job is kept. */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const dev = await developmentFor(db, request, params.id)
  if ('denied' in dev) return dev.denied
  const projectId = new URL(request.url).searchParams.get('project')
  if (!projectId) return NextResponse.json({ error: 'Which job?' }, { status: 400 })
  const out = await detachJob(db, params.id, projectId)
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status })
  return NextResponse.json(out)
}
