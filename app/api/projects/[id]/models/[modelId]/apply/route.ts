import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { actorCan } from '@/lib/server-permissions'
import { modelOnSite, siteHouses, modelBundle, housesHave } from '@/lib/site-models-read'
import { planApply, APPLY_PARTS, PART_LABEL, type ApplyPart, type HouseApply } from '@/lib/site-models'
import { typeSortOrder } from '@/lib/inspection-types'
import { toAmount } from '@/lib/schedule-dependencies'
import { taskAssigneeFor, punchNotice } from '@/lib/model-assignee'
import { normalizeAssignees, type TaskAssignee } from '@/lib/task-assignees'
import { notify } from '@/lib/notify'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Ctx = { params: { id: string; modelId: string } }

/** The permission each part writes under. Applying is several acts in one press. */
const PART_PERMISSION: Record<ApplyPart, [string, 'create' | 'edit']> = {
  plans: ['plans', 'create'],
  budget: ['budget', 'edit'],
  inspections: ['inspections', 'edit'],
  punch: ['tasks', 'create'],
}

async function load(db: ReturnType<typeof admin>, siteId: string, modelId: string) {
  const model = await modelOnSite(db, siteId, modelId)
  if (!model) return null
  const [houses, bundle] = await Promise.all([siteHouses(db, siteId), modelBundle(db, model)])
  const has = await housesHave(db, houses.map(h => h.id))
  return { model, houses, bundle, plan: planApply({ modelId: model.id, ...bundle, houses, has }) }
}

/**
 * THE PREVIEW: for every house in the group, what applying this model would
 * add - and why a plan set will not go on a house. Writes nothing. This is the
 * "ask me and I'll select" screen: the person ticks houses and parts here.
 */
export async function GET(request: Request, { params }: Ctx) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'view')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  try {
    const got = await load(db, params.id, params.modelId)
    if (!got) return NextResponse.json({ error: 'That model is not in this development.' }, { status: 404 })
    return NextResponse.json({
      model: got.model,
      houses: got.plan,
      // Which parts this person may write, so the screen can say so up front
      // rather than after a press.
      allowed: APPLY_PARTS.filter(p => actorCan(gate.actor, ...PART_PERMISSION[p])),
    })
  } catch (e: any) {
    console.error('[models/apply] preview failed', e?.message)
    return NextResponse.json({ error: 'Could not work out what applying would add.' }, { status: 500 })
  }
}

/**
 * THE APPLY: the SAME plan as the preview, recomputed now (so a second press
 * adds nothing twice), written for the ticked houses and parts only.
 */
export async function POST(request: Request, { params }: Ctx) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject<{ id: string; name: string | null }>(db, gate.actor, params.id, 'id, name')
  if ('denied' in owned) return owned.denied

  const body = await request.json().catch(() => ({}))
  const houseIds = new Set<string>(Array.isArray(body?.house_ids) ? body.house_ids.map(String) : [])
  const parts: ApplyPart[] = (Array.isArray(body?.parts) ? body.parts : []).filter((p: unknown): p is ApplyPart => APPLY_PARTS.includes(p as ApplyPart))
  if (!houseIds.size) return NextResponse.json({ error: 'Tick at least one house.' }, { status: 400 })
  if (!parts.length) return NextResponse.json({ error: 'Tick at least one thing to apply.' }, { status: 400 })
  const refused = parts.filter(p => !actorCan(gate.actor, ...PART_PERMISSION[p]))
  if (refused.length) {
    return NextResponse.json({ error: `You do not have permission to add ${refused.map(p => PART_LABEL[p].toLowerCase()).join(' or ')}. Untick ${refused.length === 1 ? 'it' : 'them'} and apply the rest.` }, { status: 403 })
  }

  let got: Awaited<ReturnType<typeof load>>
  try {
    got = await load(db, params.id, params.modelId)
  } catch (e: any) {
    console.error('[models/apply] load failed', e?.message)
    return NextResponse.json({ error: 'Could not read the model or the houses, so nothing was applied.' }, { status: 500 })
  }
  if (!got) return NextResponse.json({ error: 'That model is not in this development.' }, { status: 404 })

  const { data: me } = await db.from('profiles').select('full_name').eq('id', gate.actor.userId).maybeSingle()
  const who = (me as any)?.full_name ?? null

  const results: { houseId: string; houseName: string; added: Record<ApplyPart, number>; errors: string[] }[] = []
  const told: Told = new Map()
  // Putting a teammate on a house's team is the Team tab's act, so it is only
  // done for somebody who may do that; anybody else assigns by name, which
  // My Jobs still matches (lib/task-assignees.ts, taskIdsFor).
  const ctx: ApplyCtx = { who, userId: gate.actor.userId, mayStaff: actorCan(gate.actor, 'team', 'edit'), told }
  for (const h of got.plan.filter(p => houseIds.has(p.houseId))) {
    results.push(await applyToHouse(db, h, parts, ctx))
  }

  for (const [userId, t] of Array.from(told.entries())) {
    const { message, link } = punchNotice({ count: t.count, houses: Array.from(t.houses.values()), siteId: params.id, siteName: owned.project.name, sub: t.sub })
    await notify({ db, userIds: [userId], type: 'task_assigned', title: 'Punch items assigned', message, link })
  }
  return NextResponse.json({ results })
}

/** Who to tell once the apply is done: per person, how many items on which houses. */
type Told = Map<string, { count: number; houses: Map<string, { id: string; name: string }>; sub: boolean }>
interface ApplyCtx { who: string | null; userId: string; mayStaff: boolean; told: Told }

async function applyToHouse(db: ReturnType<typeof admin>, h: HouseApply, parts: ApplyPart[], ctx: ApplyCtx) {
  const { who, userId } = ctx
  const added: Record<ApplyPart, number> = { plans: 0, budget: 0, inspections: 0, punch: 0 }
  const errors: string[] = []

  if (parts.includes('plans')) {
    for (const p of h.plans) {
      // Its OWN copy of the file: deleting a plan deletes its file, and a file
      // shared by thirty houses would vanish from all thirty.
      const to = `${h.houseId}/model-${Date.now()}-${p.storage_path.split('/').pop()}`
      const { error: cp } = await db.storage.from('plans').copy(p.storage_path, to)
      if (cp) { errors.push(`${p.name}: the file could not be copied`); console.error('[models/apply] copy failed', cp.message); continue }
      const { data: signed } = await db.storage.from('plans').createSignedUrl(to, 60 * 60 * 24 * 365 * 10)
      const { error } = await db.from('project_plans').insert({
        project_id: h.houseId, name: p.name, plan_type: p.plan_type,
        file_url: signed?.signedUrl ?? to, storage_path: to, source_model_plan_id: p.id,
      })
      if (error) { errors.push(`${p.name}: could not be saved`); console.error('[models/apply] plan insert failed', error.message); await db.storage.from('plans').remove([to]); continue }
      added.plans++
    }
  }

  if (parts.includes('budget') && h.budget.length) {
    const { count } = await db.from('budget_line_items').select('id', { count: 'exact', head: true }).eq('project_id', h.houseId)
    const rows = h.budget.map((l, i) => ({
      project_id: h.houseId,
      category: l.category || 'General',
      cost_code: l.cost_code ?? null,
      description: l.description,
      // The model's figure IS the point of a model budget - unlike starting a
      // one-off job from a template, these houses are built to it.
      budgeted_amount: toAmount(l.default_amount) ?? 0,
      committed_amount: 0,
      actual_amount: 0,
      cost_type: l.cost_type || 'hard',
      sort_order: (count ?? 0) + i,
    }))
    const { error } = await db.from('budget_line_items').insert(rows)
    if (error) { errors.push('the budget lines could not be saved'); console.error('[models/apply] budget insert failed', error.message) }
    else added.budget = rows.length
  }

  if (parts.includes('inspections') && h.inspections.length) {
    const { error } = await db.from('project_required_inspections').insert(h.inspections.map((type, i) => ({
      project_id: h.houseId, type, source: 'model', sort_order: typeSortOrder(type, i), created_by: userId,
    })))
    if (error && error.code !== '23505') { errors.push('the required inspections could not be saved'); console.error('[models/apply] inspections insert failed', error.message) }
    else added.inspections = h.inspections.length
  }

  if (parts.includes('punch') && h.punch.length) {
    const { data: made, error } = await db.from('project_tasks').insert(h.punch.map(i => ({
      project_id: h.houseId, title: i.title, kind: 'punch', status: 'open', priority: 'medium',
      source_model_item_id: i.id, created_by: who,
    }))).select('id, source_model_item_id')
    if (error) { errors.push('the punch items could not be saved'); console.error('[models/apply] punch insert failed', error.message) }
    else {
      added.punch = h.punch.length
      const problem = await assignPunch(db, h, (made ?? []) as { id: string; source_model_item_id: string }[], ctx)
      if (problem) errors.push(problem)
    }
  }

  return { houseId: h.houseId, houseName: h.houseName, added, errors }
}

/**
 * The model's assignee onto each new punch task on this house, and who to
 * tell. The tasks are already saved, so a failure here is reported beside
 * them rather than taking them away - an unassigned task is still the task.
 */
async function assignPunch(
  db: ReturnType<typeof admin>, h: HouseApply, made: { id: string; source_model_item_id: string }[], ctx: ApplyCtx,
): Promise<string | null> {
  const byItem = new Map(h.punch.map(i => [i.id, i]))
  if (!h.punch.some(i => i.assignee_profile_id || i.assignee_company_id || i.assignee_name)) return null

  const [{ data: roster }, { data: subsOnJob }] = await Promise.all([
    db.from('project_team_members').select('id, profile_id').eq('project_id', h.houseId),
    db.from('subcontracts').select('company_id').eq('project_id', h.houseId),
  ])
  const team = [...((roster ?? []) as { id: string; profile_id: string | null }[])]
  const subsHere = new Set(((subsOnJob ?? []) as any[]).map(s => s.company_id))

  const rows: (TaskAssignee & { task_id: string })[] = []
  // Queued, and only counted once the assignee rows are saved - telling
  // somebody about a task that ended up unassigned is a promise not kept.
  const pending: [string, boolean][] = []
  const tell = (userId: string, sub: boolean) => { pending.push([userId, sub]) }
  const count = (userId: string, sub: boolean) => {
    const t = ctx.told.get(userId) ?? { count: 0, houses: new Map(), sub }
    t.count++; t.houses.set(h.houseId, { id: h.houseId, name: h.houseName }); t.sub = t.sub && sub
    ctx.told.set(userId, t)
  }

  for (const task of made) {
    const item = byItem.get(task.source_model_item_id)
    if (!item) continue
    let got = taskAssigneeFor(item, team)
    if (got && 'addMember' in got) {
      const profileId = got.addMember
      const name = String(item.assignee_name ?? '').trim() || null
      let memberId: string | null = null
      if (ctx.mayStaff) {
        const { data: p } = await db.from('profiles').select('full_name, email').eq('id', profileId).maybeSingle()
        const { data: m, error } = await db.from('project_team_members').insert({
          project_id: h.houseId, name: (p as any)?.full_name || name || 'Team member', role: 'Team member',
          email: (p as any)?.email ?? null, profile_id: profileId,
        }).select('id').single()
        if (error) console.error('[models/apply] roster insert failed', error.message)
        else { memberId = (m as any).id; team.push({ id: memberId!, profile_id: profileId }) }
      }
      got = { assignee: memberId ? { member_id: memberId, name } : { name } }
      tell(profileId, false)
    } else if (got) {
      const a = got.assignee
      if (a.member_id) {
        const pid = team.find(r => r.id === a.member_id)?.profile_id
        if (pid) tell(pid, false)
      }
    }
    if (!got) continue
    const [a] = normalizeAssignees([got.assignee])
    if (a) rows.push({ task_id: task.id, member_id: a.member_id ?? null, company_id: a.company_id ?? null, name: a.name ?? null })
  }

  // A sub is told only about a house they hold a contract on - a link to a
  // job they cannot open is a notification that leads nowhere. The task is
  // still theirs; the GC sees it assigned.
  const companies = Array.from(new Set(rows.map(r => r.company_id).filter((c): c is string => !!c && subsHere.has(c))))
  if (companies.length) {
    const { data: ps } = await db.from('profiles').select('id, company_id').in('company_id', companies)
    for (const p of (ps ?? []) as any[]) {
      for (const r of rows) if (r.company_id === p.company_id) tell(p.id, true)
    }
  }

  if (!rows.length) return null
  const { error } = await db.from('project_task_assignees').insert(rows)
  if (error) {
    console.error('[models/apply] assignee insert failed', error.message)
    return 'the punch items were added but could not be assigned'
  }
  for (const [u, sub] of pending) count(u, sub)
  return null
}
