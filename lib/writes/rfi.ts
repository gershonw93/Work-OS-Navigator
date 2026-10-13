import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { audienceFor } from '@/lib/notification-audience'
import { notify } from '@/lib/notify'
import { friendlyDbError } from '@/lib/db-error'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Asking an RFI and editing / answering one - the ONE home for both.
//
// Moved out of `POST /api/projects/[id]/rfis` and
// `PATCH /api/projects/[id]/rfis/[rfiId]` unchanged, so the MCP server (Claude)
// writes an RFI through exactly the code the RFIs tab and a sub's job page do:
// the same blank-subject refusal, the same numbering, the same status sets and
// the same "an edit is not an answer" rule. The routes keep the gate
// (`rfiSide` / `rfiGcGate` - which side of the job the caller is on, their
// `rfis` permission and the billing lock); this is everything after it.
//
// WHO ASKED IS NOT IN THE BODY. The company an RFI is filed under is decided by
// the route from the caller's side (`asker`), never read from the request - the
// escalation lib/rfi-access.ts exists to close.
// ─────────────────────────────────────────────────────────────────────────────

export const CO_STATUSES = new Set(['pending', 'approved', 'denied', 'revision_requested'])
export const RFI_STATUSES = new Set(['open', 'answered', 'closed'])

export async function createRfi(
  db: SupabaseClient,
  { userId, projectId, body, asker, via }: {
    userId: string
    projectId: string
    body: any
    /** The caller's company when they are a sub on the job; both null for the GC's own staff. */
    asker: { company_id: string | null; company_name: string | null }
    via?: string
  },
): Promise<WriteResult> {
  const user = { id: userId }
  const {
    subject,
    description,
    is_change_order,
    change_order_description,
    change_order_items,
    change_order_amount,
    attachments,
  } = body ?? {}

  // Same rule as the form, on the route - the sub's job page posts here too.
  if (typeof subject !== 'string' || !subject.trim()) {
    return { status: 400, body: { error: 'Give the RFI a subject.' } }
  }

  const { company_id, company_name } = asker
  const { data: me } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
  const askedBy: string | null = me?.full_name ?? null

  // Auto-assign rfi_number by counting existing RFIs for this project
  const { count } = await db
    .from('rfis')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  const rfi_number = (count ?? 0) + 1

  const { data: rfi, error } = await db
    .from('rfis')
    .insert({
      project_id: projectId,
      rfi_number,
      subject,
      description: description ?? null,
      is_change_order: is_change_order ?? false,
      change_order_description: change_order_description ?? null,
      change_order_items: change_order_items ?? null,
      change_order_amount: change_order_amount ?? null,
      change_order_status: is_change_order ? 'pending' : null,
      submitted_by_name: askedBy,
      company_name,
      company_id,
      attachments: attachments ?? null,
      status: 'open',
    })
    .select()
    .single()

  if (error) {
    console.error('[rfis] insert failed', { project: projectId, error: error.message })
    return { status: 500, body: { error: friendlyDbError(error) } }
  }

  const actorName = withVia(company_name ?? askedBy ?? 'Someone', via)
  await logActivity(
    db,
    projectId,
    actorName,
    'rfi_submitted',
    `RFI #${rfi_number}: ${subject}`,
    { rfi_id: rfi.id, rfi_number, subject, company_name, is_change_order },
  )

  // Notify GC team members about the new RFI
  const { data: project } = await db
    .from('projects')
    .select('name, gc_company_id')
    .eq('id', projectId)
    .single()
  if (project?.gc_company_id) {
    // Was EVERY profile at the GC company - the labourer, the read-only
    // bookkeeper, everyone. An RFI needs answering by whoever the company
    // decided answers RFIs, and telling the rest is how the bell stops being
    // read. Defaults to whoever can edit RFIs, which is close to who was
    // meaningfully being reached before.
    const audience = await audienceFor({
      db, companyId: project.gc_company_id, type: 'rfi_submitted', exclude: user.id,
    })
    if (audience.length) {
      await notify({
        db,
        userIds: audience,
        type: 'rfi',
        title: `New RFI #${rfi_number}`,
        message: `${actorName} submitted RFI: ${subject}`,
        link: `/projects/${projectId}/rfis`,
      })
    }
  }

  return { status: 201, body: { rfi } }
}

export async function updateRfi(
  db: SupabaseClient,
  { userId, projectId, rfiId, body, via }: { userId: string; projectId: string; rfiId: string; body: any; via?: string },
): Promise<WriteResult> {
  const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).maybeSingle()
  const { response, status, change_order_status, subject, description } = body ?? {}

  if (status !== undefined && !RFI_STATUSES.has(status)) {
    return { status: 400, body: { error: 'That is not an RFI status.' } }
  }
  if (change_order_status !== undefined && !CO_STATUSES.has(change_order_status)) {
    return { status: 400, body: { error: 'That is not a change order decision.' } }
  }
  if (subject !== undefined && (typeof subject !== 'string' || !subject.trim())) {
    return { status: 400, body: { error: 'Give the RFI a subject.' } }
  }

  const updates: Record<string, any> = {}
  // THE EDIT DIALOG SENDS subject AND description, and this whitelist did not
  // have them: the route dropped both, answered 200, and stamped the RFI as
  // responded by whoever pressed Save - a correction recorded as an answer.
  if (subject !== undefined) updates.subject = subject.trim()
  if (description !== undefined) updates.description = description || null

  // Only an actual answer or decision says who responded and when.
  const isAnswer = response !== undefined || status !== undefined || change_order_status !== undefined
  if (response !== undefined) updates.response = response
  if (status !== undefined) updates.status = status
  if (change_order_status !== undefined) updates.change_order_status = change_order_status
  if (isAnswer) {
    // "Dana via Claude" when Claude typed it: the card prints who answered.
    updates.responded_by_name = profile?.full_name ? withVia(profile.full_name, via) : null
    updates.responded_at = new Date().toISOString()
  }
  if (!Object.keys(updates).length) {
    return { status: 400, body: { error: 'Nothing to change.' } }
  }

  const { data: rfi, error } = await db
    .from('rfis')
    .update(updates)
    .eq('id', rfiId)
    .eq('project_id', projectId)
    .select()
    .maybeSingle()

  if (error) {
    console.error('[rfis] update failed', { rfi: rfiId, error: error.message })
    return { status: 500, body: { error: friendlyDbError(error) } }
  }
  if (!rfi) return { status: 404, body: { error: 'RFI not found' } }

  if (isAnswer) {
    const actorName = withVia(profile?.full_name ?? 'Someone', via)
    const action = change_order_status
      ? `Change order ${change_order_status.replace('_', ' ')} on RFI #${rfi.rfi_number}`
      : `RFI #${rfi.rfi_number} marked ${status ?? rfi.status}`
    await logActivity(db, projectId, actorName, 'rfi_answered', action, {
      rfi_id: rfi.id, rfi_number: rfi.rfi_number, status, change_order_status,
    })
  }

  return { status: 200, body: { rfi } }
}
