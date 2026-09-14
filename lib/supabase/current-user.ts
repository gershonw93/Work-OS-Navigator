import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import { checkAuth, type AuthCheck } from '@/lib/supabase/auth-check'

/**
 * Who is asking, resolved ONCE per request.
 *
 * THE BUG THIS EXISTS FOR. Two server layouts wrap every project page - the
 * dashboard shell and the project shell - and both needed the signed-in user
 * and their profile. Each asked separately, so a project page paid for
 * `auth.getUser()` twice, and `auth.getUser()` is not a local read: it
 * validates the token against the auth server, a full network hop. Nothing
 * renders until it comes back, so the cost landed on every navigation and the
 * app "started loading super slow".
 *
 * React's cache() dedupes per request. Next.js does this automatically for
 * fetch() but knows nothing about a Supabase client call, so it has to be
 * asked for explicitly. Both layouts now call these and the pair resolves once.
 *
 * The profile carries every column either caller wants. Two callers selecting
 * two different columns from one row is two round trips for one row.
 */
/**
 * ONE Supabase client per request, not one per question.
 *
 * `lib/supabase/server.ts` swallows cookie writes, because a Server Component
 * is not allowed to set them. So if a client rotates the refresh token, the
 * replacement cannot be persisted - and a SECOND client built moments later
 * reads the cookie and presents the token that was just rotated away. Two
 * clients per request is a way to knock a live session over, and it recurs on
 * the next page load, so signing in again does not clear it.
 *
 * The code before this file existed built one client and asked it both
 * questions. This keeps that, and keeps the round trips saved.
 */
const requestClient = cache(() => createClient())

/**
 * The full answer, including the one a layout MUST NOT flatten.
 *
 * THE BUG THIS EXISTS FOR. Every gate in the app was
 * `const { data: { user } } = await getUser(); if (!user) redirect('/login')`,
 * which cannot tell "nobody is signed in" from "the auth gateway 502'd" - and
 * sends both to the login screen. Reported as "I'm having a hard time logging
 * in now - it's blank or just loading forever": the sign-in itself returned
 * 200 every time and the dashboard behind it bounced straight back, so the
 * only visible symptom was the login page, again. See lib/auth-outcome.ts.
 *
 * TWO attempts here, where middleware takes one. A layout has to render
 * something either way, so a second ask is the cheapest thing it can do with
 * an 'unknown' - and these failures are gateway blips a few hundred
 * milliseconds wide in front of an auth server that answers in three.
 */
export const currentAuth = cache(async (): Promise<AuthCheck> =>
  checkAuth(requestClient(), { attempts: 2, timeoutMs: 3000 }))

/**
 * Just the user, for callers that only want to READ something off it.
 *
 * A GATE MUST NOT USE THIS - it cannot see the difference between no and
 * could-not-ask, which is the whole bug above. Gates call `currentAuth`.
 */
export const currentUser = cache(async () => (await currentAuth()).user)

export interface CurrentProfile {
  id: string
  role: string | null
  company_id: string | null
}

export const currentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const user = await currentUser()
  if (!user) return null
  const { data } = await requestClient()
    .from('profiles').select('id, role, company_id').eq('id', user.id).maybeSingle()
  return (data as CurrentProfile) ?? { id: user.id, role: null, company_id: null }
})
