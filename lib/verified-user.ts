import type { SupabaseClient, User, UserResponse } from '@supabase/supabase-js'
import { needsSecondStep } from '@/lib/two-step'

/**
 * `db.auth.getUser(token)`, plus the second step.
 *
 * EVERY API ROUTE ASKS THIS, NEVER `auth.getUser` DIRECTLY. Routes are
 * service-role and middleware skips `/api/`, so the token is the only thing
 * standing between a request and the data - and a password alone mints a
 * perfectly valid token. For somebody who turned two-step on, a token that has
 * not done the code (`aal1`) answers here exactly as no token does: user null,
 * so every route's existing `if (!user) 401` refuses it without being told why.
 *
 * Same SHAPE as `getUser`'s answer, so it is a drop-in at every call site,
 * including the ones that destructure `error`. `two-step.ts` (the suite)
 * fails on any `auth.getUser(` left under `app/api`.
 *
 * With no token (a route reading the cookie session) the token is read off
 * that session, because the level lives on the token.
 */
export async function verifiedUser(
  db: SupabaseClient,
  token?: string | null,
): Promise<UserResponse> {
  const res = token ? await db.auth.getUser(token) : await db.auth.getUser()
  const user = res.data.user as User | null
  if (!user) return res

  let accessToken = token ?? null
  if (!accessToken) {
    const { data } = await db.auth.getSession()
    accessToken = data.session?.access_token ?? null
  }

  if (needsSecondStep(user, accessToken)) {
    return { data: { user: null }, error: null } as unknown as UserResponse
  }
  return res
}
