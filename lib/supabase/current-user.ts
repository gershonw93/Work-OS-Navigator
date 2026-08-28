import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

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
export const currentUser = cache(async () => {
  const { data: { user } } = await createClient().auth.getUser()
  return user
})

export interface CurrentProfile {
  id: string
  role: string | null
  company_id: string | null
}

export const currentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const user = await currentUser()
  if (!user) return null
  const { data } = await createClient()
    .from('profiles').select('id, role, company_id').eq('id', user.id).maybeSingle()
  return (data as CurrentProfile) ?? { id: user.id, role: null, company_id: null }
})
