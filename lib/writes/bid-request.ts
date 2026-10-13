import type { SupabaseClient } from '@supabase/supabase-js'
import { coerceLines } from '@/lib/item-list'
import type { WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Starting and editing a bid request (Request Quotes) - the ONE home for both.
//
// Moved out of `POST /api/projects/[id]/bid-requests` and
// `PATCH /api/projects/[id]/bid-requests/[reqId]` unchanged, so the MCP server
// (Claude) writes a request through the same scope columns, the same
// pre-migration fallback and the same existing-plan attachment the Request
// Quotes tab does. The routes keep the gate and reading the form; NEW FILES
// STAY IN THE ROUTE (uploaded after this returns the row), the same split as
// the daily log.
//
// MAKING A REQUEST TELLS NOBODY. Inviting subs is a separate route that sends
// email (`.../invites`), so a request on its own is a draft only the GC sees.
// ─────────────────────────────────────────────────────────────────────────────

export interface BidRequestFields {
  title: string | null
  trade?: string | null
  description?: string | null
  due_date?: string | null
  package_type?: string | null
  material_by?: string | null
  included?: unknown[]
  excluded?: unknown[]
  ask_for?: unknown[]
  item_list?: unknown[]
}

export async function createBidRequest(
  db: SupabaseClient,
  { userId, projectId, fields, existingAttachments }: {
    userId: string; projectId: string; fields: BidRequestFields
    /** Plans already on the job, attached by URL - no re-upload. */
    existingAttachments?: { file_url: string; file_name?: string }[]
    via?: string
  },
): Promise<WriteResult> {
  const title = fields.title
  if (!title) return { status: 400, body: { error: 'Title is required' } }

  const base = {
    project_id: projectId,
    title,
    trade: fields.trade || null,
    description: fields.description || null,
    due_date: fields.due_date || null,
    created_by: userId,
  }
  // The scope questions. Stored on the request so it keeps saying what it said
  // when it went out.
  const withScope = {
    ...base,
    package_type: fields.package_type || 'turnkey',
    material_by: fields.material_by || 'sub',
    included: Array.isArray(fields.included) ? fields.included : [],
    excluded: Array.isArray(fields.excluded) ? fields.excluded : [],
    ask_for: Array.isArray(fields.ask_for) ? fields.ask_for : [],
    item_list: coerceLines(Array.isArray(fields.item_list) ? fields.item_list : []),
  }

  let { data: req, error } = await db.from('bid_requests').insert(withScope).select().single()
  // Pre-migration fallback: scope columns may not exist yet.
  if (error && (error as any).code === '42703') {
    const retry = await db.from('bid_requests').insert(base).select().single()
    req = retry.data; error = retry.error
  }
  if (error) return { status: 500, body: { error: error.message } }

  // Attach already-saved project plans (no re-upload)
  const rows = (existingAttachments ?? []).filter(e => e?.file_url)
    .map(e => ({ bid_request_id: req.id, file_url: e.file_url, file_name: e.file_name ?? null }))
  if (rows.length) await db.from('bid_request_attachments').insert(rows)

  return { status: 200, body: { request: req } }
}

export async function updateBidRequest(
  db: SupabaseClient,
  { projectId, reqId, body }: { userId: string; projectId: string; reqId: string; body: any; via?: string },
): Promise<WriteResult> {
  const updates: Record<string, any> = {}
  for (const k of ['title', 'trade', 'description', 'due_date', 'status']) if (k in body) updates[k] = body[k] || null
  const { data, error } = await db.from('bid_requests').update(updates).eq('id', reqId).eq('project_id', projectId).select().single()
  if (error) return { status: 500, body: { error: error.message } }
  return { status: 200, body: { request: data } }
}

/**
 * Is this bid request on this job? The invite routes act on `reqId` and the
 * job check covers `params.id`, so without this a job you own plus a request
 * on somebody else's reached their subs. A failed read is not a "no".
 */
export async function bidRequestOnJob(db: SupabaseClient, projectId: string, reqId: string): Promise<WriteResult | null> {
  const { data, error } = await db.from('bid_requests').select('id').eq('id', reqId).eq('project_id', projectId).maybeSingle()
  if (error) return { status: 500, body: { error: error.message } }
  if (!data) return { status: 404, body: { error: 'Bid request not found' } }
  return null
}
