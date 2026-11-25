import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from './api-guard'
import { isAssignedOnly, isFieldRole, type Action } from './permissions'
import type { ActorPerms } from './server-permissions'
import { ownJobsRefusal } from './sub-account'
import { notify } from './notify'
import { callLabel, personName } from './service-calls'
import { vendorCompanyIds } from './sub-companies'
import type { TaskLabel, TaskSubtask } from './task-extras'

// ─────────────────────────────────────────────────────────────────────────────
// The server half of service calls: who may touch which call.
//
// THE ROUTES ARE SERVICE-ROLE AND THE TABLES HAVE NO POLICIES, so this file is
// the only thing between one company's calls and another's, and between a crew
// member and the rest of the board:
//
//   - every query names the CALLER's company (`callGate` resolves it from the
//     token - never a body, a query string or a URL), and an id from a request
//     only names a row to look for among that company's own (`loadCall`);
//   - an assigned-only role sees and moves only calls assigned to it, and a
//     call that is somebody else's answers in the words a missing one does;
//   - a light sub account (lib/sub-account.ts) has no calls of its own yet -
//     taking calls from your own customers IS running your own jobs.
// ─────────────────────────────────────────────────────────────────────────────

export const CALL_COLS =
  'id, company_id, call_number, customer_id, customer_name, site_address, site_lat, site_lng, ' +
  'contact_name, contact_phone, contact_email, issue, priority, status, source, gc_project_id, notes, ' +
  'assigned_to, scheduled_start, scheduled_end, completion_notes, completed_at, completed_by, ' +
  'created_by, created_at, updated_at, labels, steps'

export type CallRow = {
  id: string; company_id: string; call_number: number; customer_id: string | null; customer_name: string
  site_address: string; site_lat: number | null; site_lng: number | null
  contact_name: string | null; contact_phone: string | null; contact_email: string | null
  issue: string; priority: string; status: string; source: string; gc_project_id: string | null
  notes: string | null; assigned_to: string | null; scheduled_start: string | null; scheduled_end: string | null
  completion_notes: string | null; completed_at: string | null; completed_by: string | null
  created_by: string | null; created_at: string; updated_at: string
  labels: TaskLabel[] | null; steps: TaskSubtask[] | null
}

export type CallGate = { actor: ActorPerms; companyId: string; crew: boolean } | { denied: NextResponse }

const NOT_FOUND = () => NextResponse.json({ error: 'Service call not found' }, { status: 404 })

export async function callGate(db: SupabaseClient, request: Request, action: Action): Promise<CallGate> {
  const gate = await requirePermission(db, request, 'service-calls', action)
  if (denied(gate)) return gate
  const companyId = gate.actor.companyId
  if (!companyId) return { denied: NextResponse.json({ error: 'No company found for your account.' }, { status: 400 }) }
  const light = await ownJobsRefusal(db, companyId)
  if (light) return { denied: NextResponse.json({ error: light, account: 'light' }, { status: 403 }) }
  return { actor: gate.actor, companyId, crew: isAssignedOnly(gate.actor.role) }
}

/** One call, only from the caller's own company - and, for crew, only their own. */
export async function loadCall(
  db: SupabaseClient, gate: Exclude<CallGate, { denied: NextResponse }>, callId: string,
): Promise<{ call: CallRow } | { denied: NextResponse }> {
  const { data, error } = await db.from('service_calls').select(CALL_COLS)
    .eq('id', callId).eq('company_id', gate.companyId).maybeSingle()
  if (error) {
    console.error('[service-calls] read failed', { callId, error: error.message })
    return { denied: NextResponse.json({ error: 'Could not load that call. Try again.' }, { status: 500 }) }
  }
  const call = data as unknown as CallRow | null
  if (!call) return { denied: NOT_FOUND() }
  if (gate.crew && call.assigned_to !== gate.actor.userId) return { denied: NOT_FOUND() }
  return { call }
}

/** The people a call can be given to: this company's own, never anybody else's. */
export async function crewOf(db: SupabaseClient, companyId: string): Promise<{ id: string; name: string; role: string | null }[] | null> {
  const { data, error } = await db.from('profiles').select('id, full_name, email, role').eq('company_id', companyId)
  if (error) {
    console.error('[service-calls] crew read failed', error.message)
    return null
  }
  return ((data ?? []) as { id: string; full_name: string | null; email: string | null; role: string | null }[])
    .map(p => ({ id: p.id, name: personName(p), role: p.role }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function actorName(db: SupabaseClient, userId: string): Promise<string | null> {
  const { data } = await db.from('profiles').select('full_name, email').eq('id', userId).maybeSingle()
  return data ? personName(data as any) : null
}

export async function logEvent(
  db: SupabaseClient, callId: string, ev: { kind: string; status?: string | null; note?: string | null; actorId: string; actorName: string | null },
) {
  const { error } = await db.from('service_call_events').insert({
    call_id: callId, kind: ev.kind, status: ev.status ?? null, note: ev.note ?? null,
    actor_id: ev.actorId, actor_name: ev.actorName,
  })
  if (error) console.error('[service-calls] event not written', { callId, kind: ev.kind, error: error.message })
}

/**
 * Tell a crew member a call is theirs, or that its time moved. Never the
 * person who made the change (they know), and a call taken away tells nobody:
 * the bell is for work you have to do.
 */
export async function tellAssignee(db: SupabaseClient, call: CallRow, actorId: string, moved: boolean) {
  if (!call.assigned_to || call.assigned_to === actorId) return
  const { data: who } = await db.from('profiles').select('role').eq('id', call.assigned_to).maybeSingle()
  // NO DATE OR TIME IN THE MESSAGE. The server does not know which clock the
  // crew member reads, and the date half of a UTC timestamp is the wrong day
  // for an evening call on the east coast - a value present and wrong. The
  // link opens the call, which shows when in the reader's own zone.
  await notify({
    db,
    userIds: [call.assigned_to],
    type: 'service_call_assigned',
    title: `${moved ? 'Time changed on' : 'Service call'} ${callLabel(call.call_number)}${moved ? '' : ' assigned to you'}`,
    message: `${call.issue} at ${call.site_address}. Customer: ${call.customer_name}. Open it for the time.`,
    link: isFieldRole((who as any)?.role) ? `/field/calls/${call.id}` : `/service-calls/${call.id}`,
  })
}

// ── what a request may set ───────────────────────────────────────────────────

/**
 * The fields a form may send, and nothing else - a whitelist, so a status, a
 * completion stamp or another company's id cannot arrive in a body. Status
 * moves have their own route; `scheduled` is DERIVED from having somebody and
 * a time (`withDerivedStatus`), never typed.
 */
export const EDITABLE = [
  'customer_id', 'customer_name', 'site_address', 'contact_name', 'contact_phone', 'contact_email',
  'issue', 'priority', 'source', 'gc_project_id', 'notes', 'assigned_to', 'scheduled_start', 'scheduled_end',
] as const

export function pickFields(body: any): Partial<Record<(typeof EDITABLE)[number], string | null>> {
  const out: Record<string, string | null> = {}
  for (const k of EDITABLE) {
    if (body?.[k] === undefined) continue
    const v = body[k]
    out[k] = v === null || v === '' ? null : String(v).trim()
  }
  return out as any
}

/** `new` <-> `scheduled` follows from whether a call has somebody and a time. */
export function withDerivedStatus(status: string, next: { assigned_to?: string | null; scheduled_start?: string | null }): string {
  const booked = !!next.assigned_to && !!next.scheduled_start
  if (status === 'new' && booked) return 'scheduled'
  if (status === 'scheduled' && !booked) return 'new'
  return status
}

/**
 * Every id a body names, checked against the caller's own company. A refusal
 * sentence, or null. The person must be this company's, the customer this
 * company's, and a contractor job one this company holds a subcontract on.
 */
export async function referenceProblem(
  db: SupabaseClient, companyId: string,
  f: { assigned_to?: string | null; customer_id?: string | null; gc_project_id?: string | null },
): Promise<string | null> {
  if (f.assigned_to) {
    const { data } = await db.from('profiles').select('id').eq('id', f.assigned_to).eq('company_id', companyId).maybeSingle()
    if (!data) return 'That person is not on your team.'
  }
  if (f.customer_id) {
    const { data } = await db.from('customers').select('id').eq('id', f.customer_id).eq('gc_company_id', companyId).maybeSingle()
    if (!data) return 'That customer is not one of yours.'
  }
  if (f.gc_project_id) {
    const mine = await vendorCompanyIds(db, companyId)
    if (mine === null) return 'Could not check that job just now. Try again.'
    const { data } = await db.from('subcontracts').select('id').eq('project_id', f.gc_project_id).in('company_id', mine).limit(1)
    if (!data?.length) return 'That is not a contractor job you are working on.'
  }
  return null
}


// `pickExtras` (labels and steps) is pure and lives in lib/service-calls.ts,
// so its rules can be tested without a server.
export { pickExtras } from './service-calls'
