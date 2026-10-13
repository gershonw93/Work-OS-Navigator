import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { permitProblem } from '@/lib/permit-rules'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Adding and editing a permit - the ONE home for both.
//
// Moved out of `POST /api/projects/[id]/permits` and
// `PATCH /api/projects/[id]/permits/[permitId]` unchanged, so the MCP server
// (Claude) files a permit through exactly the code the Permits tab does: the
// same `permitProblem` rule (a blank permit is not a permit; a status that
// claims something carries it), asked against the row AS IT WILL BE on an
// edit, the same whitelist and the same activity line. The routes keep the
// gate and the form/file reading; the upload is handed in as `uploadFile` so
// it still happens only after the checks pass.
// ─────────────────────────────────────────────────────────────────────────────

export interface PermitFields {
  permit_type: string | null
  permit_number?: string | null
  description?: string | null
  status?: string | null
  issued_date?: string | null
  expiry_date?: string | null
  issuing_authority?: string | null
  inspector_name?: string | null
  inspector_phone?: string | null
  notes?: string | null
}

/** The columns an edit may set. A whitelist with a field missing fails like a rejection, so every form field is here. */
export const PERMIT_EDIT_FIELDS = [
  'permit_type',
  'permit_number',
  'description',
  'status',
  'issued_date',
  'expiry_date',
  'issuing_authority',
  'inspector_name',
  'inspector_phone',
  'notes',
] as const

export async function createPermit(
  db: SupabaseClient,
  { userId, projectId, fields, uploadFile, via }: {
    userId: string; projectId: string; fields: PermitFields
    uploadFile?: () => Promise<{ url: string | null } | { error: string }>; via?: string
  },
): Promise<WriteResult> {
  const {
    permit_type, permit_number = null, description = null, status = null, issued_date = null,
    expiry_date = null, issuing_authority = null, inspector_name = null, inspector_phone = null, notes = null,
  } = fields

  const { data: profile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', userId)
    .single()

  // A BLANK PERMIT IS NOT A PERMIT. A fully empty submit filed one reading
  // "Building / pending" - neither word typed by anybody, both of them the
  // form's dropdown defaults. Asked here as well as on the form because the
  // form is not the only door, and the rule is pure so the two cannot disagree.
  const problem = permitProblem({
    permit_type, permit_number, description, issuing_authority,
    status, issued_date, expiry_date,
  })
  if (problem) return { status: 400, body: { error: problem } }

  let file_url: string | null = null
  if (uploadFile) {
    const uploaded = await uploadFile()
    if ('error' in uploaded) return { status: 500, body: { error: uploaded.error } }
    file_url = uploaded.url
  }

  const { data: permit, error } = await db
    .from('permits')
    .insert({
      project_id: projectId,
      permit_type,
      permit_number: permit_number || null,
      description: description || null,
      status: status || 'pending',
      issued_date: issued_date || null,
      expiry_date: expiry_date || null,
      issuing_authority: issuing_authority || null,
      inspector_name: inspector_name || null,
      inspector_phone: inspector_phone || null,
      notes: notes || null,
      file_url,
    })
    .select()
    .single()

  if (error) return { status: 500, body: { error: error.message } }

  const actorName = withVia((profile as any)?.full_name ?? 'Someone', via)
  const activityMessage = `Permit added: ${permit_type}${permit_number ? ' #' + permit_number : ''}`
  await logActivity(
    db,
    projectId,
    actorName,
    'permit_added',
    activityMessage,
    { permit_id: permit.id, permit_type, permit_number },
  )

  return { status: 201, body: { permit } }
}

export async function updatePermit(
  db: SupabaseClient,
  // `userId` and `via` are taken for the same shape as every other write here;
  // a permit edit records no name today, so neither is read yet.
  { projectId, permitId, body }: { userId: string; projectId: string; permitId: string; body: any; via?: string },
): Promise<WriteResult> {
  const updates: Record<string, unknown> = {}
  for (const key of PERMIT_EDIT_FIELDS) {
    if (key in body) updates[key] = body[key]
  }

  if (Object.keys(updates).length === 0) {
    return { status: 400, body: { error: 'No valid fields to update' } }
  }

  // THE SAME RULE ON THE SAME RECORD. Creating a blank permit was refused and
  // editing one down to blank was not, which is one door short - and the edit
  // form sends every field, so clearing the number on an "active" permit was a
  // single keystroke away. Asked against the row AS IT WILL BE: what the patch
  // sets if it sets it, and what is stored otherwise, so changing the notes on
  // a permit is not refused for a field the patch never mentioned.
  const { data: current } = await db
    .from('permits')
    .select('permit_type, permit_number, description, issuing_authority, status, issued_date, expiry_date')
    .eq('id', permitId)
    .eq('project_id', projectId)
    .maybeSingle()
  const after = { ...(current ?? {}), ...updates } as Parameters<typeof permitProblem>[0]
  const problem = permitProblem(after)
  if (problem) return { status: 400, body: { error: problem } }

  const { data: permit, error } = await db
    .from('permits')
    .update(updates)
    .eq('id', permitId)
    .eq('project_id', projectId)
    .select()
    .single()

  if (error) return { status: 500, body: { error: error.message } }
  return { status: 200, body: { permit } }
}
