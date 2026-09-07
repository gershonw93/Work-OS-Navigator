import { SupabaseClient } from '@supabase/supabase-js'

/**
 * Write one entry to a project's Job History.
 *
 * NEVER THROWS, and that is the whole contract. It used to `await` the insert
 * bare, so a history write that failed - a dropped connection, a column added
 * in one environment and not another - took the caller's whole request down
 * with it. That is exactly backwards: the history is a record OF the action,
 * and it must not be able to prevent one. `notify()` has had this contract for
 * a while; this is the same reasoning applied to the other observer.
 *
 * It became urgent rather than theoretical when inspections went from logging
 * two events to logging eight. Eight chances per request to fail an inspection
 * over a note about an inspection.
 *
 * A swallowed failure is still logged to the server console, because "the
 * history is quietly incomplete" is its own kind of bug and should not be
 * invisible to us as well.
 */
export async function logActivity(
  db: SupabaseClient,
  projectId: string,
  actorName: string,
  type: string,
  message: string,
  metadata?: Record<string, unknown>,
  actorId?: string,
) {
  try {
    const { error } = await db.from('project_activity').insert({
      project_id: projectId,
      actor_name: actorName,
      type,
      message,
      metadata: metadata ?? null,
      ...(actorId ? { actor_id: actorId } : {}),
    })
    if (error) console.error(`[job-history] ${type} not recorded:`, error.message)
  } catch (e) {
    console.error(`[job-history] ${type} not recorded:`, e)
  }
}
