import type { SupabaseClient } from '@supabase/supabase-js'

// ─────────────────────────────────────────────────────────────────────────────
// WHEN DID ANYBODY LAST SIGN IN?
//
// `last_sign_in_at` lives in `auth.users`, which PostgREST cannot reach, so it
// comes through the Admin API - AND THE ADMIN API PAGES. The loop is
// load-bearing: without it you see the first 200 accounts and somebody on page
// two is indistinguishable from somebody who has never signed in at all.
//
// This existed twice already - in `/api/admin/stats` and in
// `/api/admin/access-requests`, each with its own copy of the loop and its own
// comment saying it was the same shape as the other one. The onboarding cron
// needed it as well, and a third copy of a paging loop is how one of them
// quietly stops at page one.
// ─────────────────────────────────────────────────────────────────────────────

export interface SignInRow {
  id: string
  email: string | null
  last_sign_in_at: string | null
}

export interface SignIns {
  rows: SignInRow[]
  /**
   * Did we get all of them?
   *
   * A PARTIAL PAGE-THROUGH UNDERCOUNTS EVERY ANSWER TAKEN FROM IT, and a
   * quietly-wrong count is worse than one that says it is unsure. Callers that
   * publish a number say so; callers that make a DECISION from it (the
   * onboarding cron) treat an incomplete read as "do not send", because the
   * missing half is indistinguishable from people who never signed in.
   */
  complete: boolean
}

/** Every account, with when it was last used. Never throws. */
export async function signIns(db: SupabaseClient, maxPages = 20): Promise<SignIns> {
  const rows: SignInRow[] = []
  try {
    for (let page = 1; page <= maxPages; page++) {
      const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
      if (error) {
        console.error('[sign-ins] listUsers failed', error.message)
        return { rows, complete: false }
      }
      const users = data?.users ?? []
      for (const u of users) {
        rows.push({ id: u.id, email: u.email ?? null, last_sign_in_at: u.last_sign_in_at ?? null })
      }
      if (users.length < 200) return { rows, complete: true }
    }
  } catch (e) {
    console.error('[sign-ins] listUsers threw', e)
    return { rows, complete: false }
  }
  // Ran out of pages before running out of users.
  return { rows, complete: false }
}

/** The most recent sign-in among a set of user ids, or null if none ever have. */
export function latestSignIn(rows: SignInRow[], userIds: Iterable<string>): string | null {
  const wanted = new Set(userIds)
  let best: string | null = null
  for (const r of rows) {
    if (!wanted.has(r.id) || !r.last_sign_in_at) continue
    if (!best || r.last_sign_in_at > best) best = r.last_sign_in_at
  }
  return best
}
