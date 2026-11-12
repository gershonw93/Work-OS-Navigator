import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor, actorCan, type ActorPerms } from './server-permissions'
import { jobSide, type JobSide } from './job-access'
import { billingLock } from './api-guard'
import { ASSIGNED_ONLY_ROLES } from './permissions'
import { pmAllowedRole, PM_DEFAULT_COLUMNS, PM_LINK_TYPES, type PmCard, type PmColumn } from './project-management'

// ─────────────────────────────────────────────────────────────────────────────
// The gate and the reads for Project Management.
//
// THE PRIVACY RULE, WHICH EVERY ROUTE DEPENDS ON: these routes run on the
// service role, so nothing but the route stands between one person's board and
// another's. `owner` below is the CALLER'S OWN id, resolved from their token,
// and every query on pm_columns / pm_cards filters on it. An id from the URL or
// the body names a row to look for AMONG THE CALLER'S OWN - it is never enough
// on its own. Pinned in lib/__tests__/project-management.ts, which counts the
// queries in each route and demands the owner filter on every one.
//
// There is no admin path, no `as_user`, and no permission to grant: the
// screen promises an admin cannot see it.
// ─────────────────────────────────────────────────────────────────────────────

export const pmDb = (): SupabaseClient =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export type PmGate =
  | { actor: ActorPerms; owner: string; side: JobSide | null }
  | { denied: NextResponse }

const refuse = (error: string, status: number) => ({ denied: NextResponse.json({ error }, { status }) })

/**
 * Who is asking, whether their role has Project Management at all, and - when
 * a job is named - whether they are on it. `write` applies the billing lock:
 * a read-only account can still read its boards.
 */
export async function pmGate(
  db: SupabaseClient,
  request: Request,
  projectId: string | null,
  opts: { write?: boolean } = {},
): Promise<PmGate> {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return refuse('Unauthorized', 401)
  const actor = await getActor(db, token)
  if (!actor) return refuse('Unauthorized', 401)
  if (!pmAllowedRole(actor.role)) return refuse('Project Management is not part of Field Mode.', 403)
  if (opts.write) {
    const locked = await billingLock(db, actor.companyId)
    if (locked) return { denied: locked }
  }
  if (!projectId) return { actor, owner: actor.userId, side: null }
  const on = await jobSide(db, actor, projectId)
  if ('denied' in on) return on
  return { actor, owner: actor.userId, side: on.side }
}

export const COLUMN_COLS = 'id, name, position, is_done'
export const CARD_COLS = 'id, project_id, column_id, title, notes, due_date, priority, labels, checklist, link_type, link_id, link_label, position, completed_at, created_at'

/** The caller's columns on a job, seeding the four starters on a first visit. */
export async function readColumns(db: SupabaseClient, owner: string, projectId: string): Promise<PmColumn[] | null> {
  const read = () => db.from('pm_columns').select(COLUMN_COLS)
    .eq('owner_id', owner).eq('project_id', projectId).order('position')
  let { data, error } = await read()
  if (error) { console.error('[pm] columns read failed', error.message); return null }
  if (!data?.length) {
    // Two first visits at once: the unique name index fails the second insert
    // whole, and the re-read below finds what the first one wrote.
    const { error: seedError } = await db.from('pm_columns').insert(
      PM_DEFAULT_COLUMNS.map((c, i) => ({ owner_id: owner, project_id: projectId, name: c.name, is_done: c.is_done, position: i })),
    )
    if (seedError && seedError.code !== '23505') { console.error('[pm] seed failed', seedError.message); return null }
    ;({ data, error } = await read())
    if (error) { console.error('[pm] columns re-read failed', error.message); return null }
  }
  return (data ?? []) as PmColumn[]
}

export async function readCards(db: SupabaseClient, owner: string, projectId: string): Promise<PmCard[] | null> {
  const { data, error } = await db.from('pm_cards').select(CARD_COLS)
    .eq('owner_id', owner).eq('project_id', projectId).order('position')
  if (error) { console.error('[pm] cards read failed', error.message); return null }
  return (data ?? []) as PmCard[]
}

/** Write `position` 0..n over the caller's own cards, in the order given. */
export async function renumberCards(db: SupabaseClient, owner: string, ids: string[]): Promise<boolean> {
  const results = await Promise.all(ids.map((id, i) =>
    db.from('pm_cards').update({ position: i }).eq('owner_id', owner).eq('id', id)))
  const failed = results.find(r => r.error)
  if (failed?.error) console.error('[pm] renumber failed', failed.error.message)
  return !failed
}

// ── Links to a record on the job ─────────────────────────────────────────────

/**
 * May this person link a card to a record of this type on this job?
 *
 * Only on their own company's job, only with the permission to view that kind
 * of record, and not for the assigned-only roles - what THEY may see inside a
 * job is narrower than the job, and that scoping lives in each screen. Same
 * refusal the Claude connection makes, for the same reason: a picker must not
 * list a record its reader could not open.
 */
export function mayLink(gate: { actor: ActorPerms; side: JobSide | null }, type: string): boolean {
  const t = PM_LINK_TYPES[type]
  if (!t || gate.side !== 'gc') return false
  if (ASSIGNED_ONLY_ROLES.includes(gate.actor.role)) return false
  return actorCan(gate.actor, t.resource, 'view')
}

export interface LinkOption { id: string; label: string }

const short = (v: unknown, n = 80) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, n)

/** The records of one type on a job, as the picker shows them. Null when the read failed. */
export async function linkOptions(db: SupabaseClient, projectId: string, type: string): Promise<LinkOption[] | null> {
  const q = (table: string, cols: string) => db.from(table).select(cols).eq('project_id', projectId).limit(500)
  let rows: any[] | null = null
  let error: { message: string } | null = null
  let label: (r: any) => string = () => ''
  if (type === 'task') {
    ({ data: rows, error } = await q('tasks', 'id, title'))
    label = r => short(r.title)
  } else if (type === 'inspection') {
    ({ data: rows, error } = await q('inspections', 'id, type'))
    label = r => `${short(r.type) || 'Inspection'} inspection`
  } else if (type === 'permit') {
    ({ data: rows, error } = await q('permits', 'id, permit_type, permit_number'))
    label = r => [short(r.permit_type) || 'Permit', r.permit_number ? `no. ${short(r.permit_number, 30)}` : ''].filter(Boolean).join(' ')
  } else if (type === 'rfi') {
    ({ data: rows, error } = await q('rfis', 'id, rfi_number, subject'))
    label = r => [r.rfi_number != null ? `RFI ${r.rfi_number}` : 'RFI', short(r.subject)].filter(Boolean).join(': ')
  } else if (type === 'bill') {
    ({ data: rows, error } = await q('invoices', 'id, invoice_number, description'))
    label = r => [r.invoice_number ? `Bill ${short(r.invoice_number, 30)}` : 'Bill', short(r.description, 60)].filter(Boolean).join(': ')
  } else return []
  if (error) { console.error('[pm] link options read failed', { type, error: error.message }); return null }
  return (rows ?? []).map(r => ({ id: r.id as string, label: label(r) })).filter(o => o.label)
    .sort((a, b) => a.label.localeCompare(b.label))
}
