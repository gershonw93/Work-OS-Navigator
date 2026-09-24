// Platform owner(s) allowed to impersonate ANY account for customer support.
// Keep this list tiny - these emails can log in as anyone, across all companies.
export const SUPER_ADMIN_EMAILS = [
  'gershon@clicktokmarketing.com',
]

export function isSuperAdmin(email: string | null | undefined): boolean {
  if (!email) return false
  return SUPER_ADMIN_EMAILS.map(e => e.toLowerCase()).includes(email.toLowerCase())
}

/**
 * The super admins' profile ids, for telling US something.
 *
 * `SUPER_ADMIN_EMAILS` is the list, and it is a list of ADDRESSES - which is
 * the right shape for a gate (an email comes off a verified token) and the
 * wrong shape for `notify()`, which needs profile ids. This is the one place
 * that crossing happens.
 *
 * NEVER THROWS, and an empty answer is a normal one: a deployment whose owner
 * has no profile row yet is a real state, and the thing being reported is
 * always a side effect of somebody else's work. A request that failed to reach
 * us must not fail the request.
 */
export async function superAdminProfileIds(db: {
  from: (t: string) => any
}): Promise<string[]> {
  const emails = SUPER_ADMIN_EMAILS.map(e => e.toLowerCase())
  if (!emails.length) return []
  try {
    const { data, error } = await db.from('profiles').select('id, email').in('email', emails)
    if (error) {
      console.error('[super-admin] could not resolve profile ids', error.message)
      return []
    }
    return ((data ?? []) as { id: string }[]).map(r => r.id)
  } catch (e) {
    console.error('[super-admin] could not resolve profile ids', e)
    return []
  }
}
