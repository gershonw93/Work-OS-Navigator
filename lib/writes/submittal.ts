import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Reviewing a submittal - its status and the reviewer's notes - the ONE home.
//
// Moved out of `PATCH /api/projects/[id]/submittals/[submittalId]` unchanged,
// so the MCP server (Claude) records a review through the same whitelist
// (status and review_notes, nothing else), the same status set and the same
// activity line the Submittals tab does. The route keeps the gate
// (`submittals: edit`, the billing lock, and that the job is the caller's
// company's own); this is everything after it.
//
// ADDING one is not here: a submittal IS its document, and the create route
// refuses one without a file. Claude uploads nothing, so it adds none.
// ─────────────────────────────────────────────────────────────────────────────

export const SUBMITTAL_STATUSES = ['pending', 'approved', 'rejected', 'revise']

export async function updateSubmittal(
  db: SupabaseClient,
  { userId, projectId, submittalId, body, via }: { userId: string; projectId: string; submittalId: string; body: any; via?: string },
): Promise<WriteResult> {
  const { data: profile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()

  const updates: Record<string, unknown> = {}
  if (body && 'status' in body) {
    if (!SUBMITTAL_STATUSES.includes(body.status)) {
      return { status: 400, body: { error: 'Invalid status' } }
    }
    updates.status = body.status
  }
  if (body && 'review_notes' in body) updates.review_notes = body.review_notes || null

  if (Object.keys(updates).length === 0) {
    return { status: 400, body: { error: 'No valid fields to update' } }
  }

  const { data: submittal, error } = await db
    .from('submittals')
    .update(updates)
    .eq('id', submittalId)
    .eq('project_id', projectId)
    .select()
    .single()

  if (error) return { status: 500, body: { error: error.message } }

  const newStatus = updates.status as string | undefined
  if (newStatus && newStatus !== 'pending') {
    const actorName = withVia((profile as any)?.full_name ?? 'Someone', via)
    const statusLabel = newStatus === 'revise' ? 'sent back for revision' : newStatus
    await logActivity(
      db,
      projectId,
      actorName,
      `submittal_${newStatus}`,
      `Submittal ${statusLabel}: ${submittal.title}`,
      { submittal_id: submittal.id, title: submittal.title, status: newStatus },
    )
  }

  return { status: 200, body: { submittal } }
}
