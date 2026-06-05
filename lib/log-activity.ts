import { SupabaseClient } from '@supabase/supabase-js'

export async function logActivity(
  db: SupabaseClient,
  projectId: string,
  actorName: string,
  type: string,
  message: string,
  metadata?: Record<string, unknown>,
) {
  await db.from('project_activity').insert({
    project_id: projectId,
    actor_name: actorName,
    type,
    message,
    metadata: metadata ?? null,
  })
}
