import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Recording a plan sheet whose bytes are already in the `plans` bucket - the
// ONE home for it.
//
// Moved out of `POST /api/projects/[id]/plans/upload` unchanged: sign the path
// for ten years, insert the `project_plans` row with its `storage_path` (the
// plan file route signs THAT fresh per request), remove the stored file if the
// insert is refused, and write the activity line. The route keeps its gate
// (`plans: create` plus the GC's ownership of the job) and both of its ways in;
// the MCP server (Claude) calls this after storing a sheet it was handed.
// ─────────────────────────────────────────────────────────────────────────────

export const PLAN_TYPES = ['architectural', 'structural', 'mep', 'civil', 'landscape', 'other'] as const

export async function recordPlanSheet(
  db: SupabaseClient,
  { userId, projectId, name, planType, folderId, storagePath, via }: {
    userId: string; projectId: string; name: string; planType: string; folderId: string | null; storagePath: string; via?: string
  },
): Promise<WriteResult> {
  const admin = db
  const params = { id: projectId }
  const user = { id: userId }

  // Get a long-lived signed URL (10 years)
  const { data: signedUrlData } = await admin.storage
    .from('plans')
    .createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)

  const { data: plan, error: dbError } = await admin
    .from('project_plans')
    .insert({
      project_id: params.id,
      folder_id: folderId || null,
      name,
      plan_type: planType,
      file_url: signedUrlData?.signedUrl ?? '',
      storage_path: storagePath,
    })
    .select()
    .single()

  if (dbError) {
    // Clean up uploaded file if DB insert fails
    await admin.storage.from('plans').remove([storagePath])
    return { status: 500, body: { error: dbError.message } }
  }

  // Log activity
  const { data: uploader } = await admin.from('profiles').select('full_name').eq('id', user.id).single()
  const actorName = withVia((uploader as any)?.full_name ?? 'Someone', via)
  await logActivity(admin, params.id, actorName, 'plan_uploaded',
    `Uploaded plan "${name}" (${planType})`,
    { plan_id: (plan as any)?.id, name, plan_type: planType }
  )

  return { status: 200, body: { plan } }
}
