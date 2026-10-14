import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The "is this yours" questions behind the PERSONAL routes - the ones that
 * need only a sign-in because they only ever touch the caller's own rows.
 *
 * Every route here runs on the service-role client, so RLS does not apply and
 * an id taken from the URL is answered for whoever asks unless the route
 * itself checks it. These are those checks, pure enough to test with a fake
 * db (`lib/__tests__/lockdown-personal.ts`).
 */

/**
 * The caller's company's invitation to an old-system bid package, or null.
 *
 * Null for a caller with NO company as well: `.eq('company_id', null)` is not
 * `IS NULL` in PostgREST, and a guard that relies on how a null compares is a
 * guard nobody can read.
 */
export async function invitationToPackage(
  db: SupabaseClient,
  companyId: string | null | undefined,
  packageId: string,
): Promise<{ id: string; status: string | null } | null> {
  if (!companyId || !packageId) return null
  const { data, error } = await db
    .from('bid_invitations')
    .select('id, status')
    .eq('bid_package_id', packageId)
    .eq('company_id', companyId)
    .limit(1)
  if (error) {
    console.error('[invitationToPackage] read failed', { packageId, error: error.message })
    return null
  }
  return ((data ?? [])[0] as { id: string; status: string | null } | undefined) ?? null
}

/**
 * The role an accepted invite writes onto a profile.
 *
 * "Never downgrade a role the company set deliberately" is about THAT company.
 * A profile carrying a role from a DIFFERENT company (or from none) is not a
 * deliberate setting by the company that just invited them - keeping it let an
 * admin somewhere else, invited as read-only, arrive as an admin here: a role
 * nobody at the inviting company granted.
 */
export function acceptedRole(
  existing: { role?: string | null; company_id?: string | null } | null | undefined,
  invite: { role?: string | null; company_id: string },
): string | null {
  const invited = invite.role ?? 'read_only'
  if (!existing) return invited
  if (existing.role && existing.company_id === invite.company_id) return null // keep it
  return invited
}

/** PostgREST treats `%` and `_` as wildcards in ilike; keep them literal. */
export const escapeLike = (v: string): string => v.replace(/[\\%_]/g, m => `\\${m}`)
