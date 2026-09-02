import { createClient } from '@/lib/supabase/client'

/**
 * Authenticated GET for admin pages - attaches the current session's bearer token.
 *
 * THE BUG THIS CAUSED. This used to return `null` for every kind of failure, and
 * every caller wrote `d?.users ?? []`. So a 500 rendered as "No users found." -
 * a confident, wrong, and completely silent answer. The Platform Console's Users
 * tab sat blank next to an Overview counting 27 users, and it took a database
 * catalog query to work out why, because the screen itself claimed there was
 * simply nobody there.
 *
 * Loading, empty and failed are three different facts (CLAUDE.md). Two of them
 * were being spelled the same way. The result now carries the error, so a page
 * can say "this did not load" instead of "there is nothing here".
 */
export interface AdminResult<T> {
  data: T | null
  /** Null when the call succeeded. A sentence, already fit to show. */
  error: string | null
}

export async function adminGet<T>(path: string): Promise<AdminResult<T>> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { data: null, error: 'You are not signed in.' }

  try {
    const res = await fetch(path, { headers: { Authorization: `Bearer ${session.access_token}` } })
    if (!res.ok) {
      // The route's own message when it sent one - it is written for a person
      // and names the actual problem. The status is the fallback, never the
      // whole story.
      const body = await res.json().catch(() => ({} as any))
      return { data: null, error: body?.error ?? `That did not load (${res.status}).` }
    }
    return { data: (await res.json()) as T, error: null }
  } catch (e: any) {
    return { data: null, error: e?.message ?? 'Could not reach the server.' }
  }
}
