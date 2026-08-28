import type { SupabaseClient } from '@supabase/supabase-js'
import {
  getEffectivePermissions, resolveRoleBase, can,
  type Action, type OverrideMap, type PermMap,
} from './permissions'

// Server-side permission resolution. Mirrors /api/me/permissions exactly, so
// what the UI hides is also what the API refuses: role defaults, this
// company's overrides of those defaults (including custom classes), then any
// per-user overrides on top.

export async function loadCompanyRoleMap(
  db: SupabaseClient,
  companyId: string | null | undefined,
): Promise<Record<string, PermMap>> {
  if (!companyId) return {}
  const { data } = await db.from('company_roles').select('role_key, permissions').eq('company_id', companyId)
  const map: Record<string, PermMap> = {}
  for (const r of data ?? []) map[r.role_key] = r.permissions as PermMap
  return map
}

export interface ActorPerms {
  userId: string
  role: string
  companyId: string | null
  permissions: PermMap
}

/** Resolve the effective permissions of the user behind a bearer token. */
export async function getActor(db: SupabaseClient, token: string | null | undefined): Promise<ActorPerms | null> {
  if (!token) return null
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return null

  // permission_overrides may not exist on older deployments - degrade to role only.
  let role = (user.user_metadata?.role as string) ?? 'read_only'
  let overrides: OverrideMap | null = null
  let companyId: string | null = null

  const { data: full, error } = await db
    .from('profiles')
    .select('role, permission_overrides, company_id')
    .eq('id', user.id)
    .single()

  if (!error && full) {
    role = full.role ?? role
    overrides = (full.permission_overrides ?? null) as OverrideMap | null
    companyId = full.company_id ?? null
  } else {
    const { data: basic } = await db.from('profiles').select('role, company_id').eq('id', user.id).single()
    if (basic?.role) role = basic.role
    companyId = basic?.company_id ?? null
  }

  const companyRoleMap = await loadCompanyRoleMap(db, companyId)
  const base = resolveRoleBase(role, companyRoleMap)

  return {
    userId: user.id,
    role,
    companyId,
    permissions: getEffectivePermissions(role, overrides, base),
  }
}

export function actorCan(actor: ActorPerms | null, resource: string, action: Action = 'view'): boolean {
  if (!actor) return false
  return can(actor.permissions, resource, action)
}

/**
 * Everyone at a company who can actually DO something - the people worth
 * telling about it.
 *
 * THE BUG THIS EXISTS FOR. A sub submitting a bill fired "Invoice X is pending
 * your approval" at `[user.id]` - the person who had just created it. So the
 * sub was told to approve their own bill and the GC was told nothing, which is
 * a bill sitting unapproved until somebody happens to open the tab.
 *
 * The obvious repair - notify everyone at the GC - is the other mistake: a
 * labourer and a field supervisor both have `invoices: N` and cannot open the
 * page the notification links to. A notification you cannot act on is how
 * people learn to ignore notifications.
 *
 * Same resolution as getActor (role defaults -> this company's overrides of
 * them -> per-user overrides), so who gets told and who is allowed in cannot
 * disagree.
 */
export async function usersWhoCan(
  db: SupabaseClient,
  companyId: string | null | undefined,
  resource: string,
  action: Action = 'edit',
): Promise<string[]> {
  if (!companyId) return []

  // permission_overrides may not exist on older deployments - fall back to
  // role alone rather than returning nobody, which would silently restore the
  // "no one is told" bug this function exists to fix.
  // Independent questions, asked together. Back to back they were one avoidable
  // round trip on the path that creates a bill.
  let rows: { id: string; role: string | null; permission_overrides?: unknown }[] = []
  const [{ data, error }, companyRoleMap] = await Promise.all([
    db.from('profiles').select('id, role, permission_overrides').eq('company_id', companyId),
    loadCompanyRoleMap(db, companyId),
  ])
  if (!error && data) rows = data as any
  else {
    const { data: basic } = await db.from('profiles').select('id, role').eq('company_id', companyId)
    rows = (basic ?? []) as any
  }
  if (!rows.length) return []

  return rows
    .filter(r => {
      const base = resolveRoleBase(r.role, companyRoleMap)
      const perms = getEffectivePermissions(r.role, (r.permission_overrides ?? null) as OverrideMap | null, base)
      return can(perms, resource, action)
    })
    .map(r => r.id)
}

/**
 * Projects a user is explicitly assigned to, plus the project_team_members
 * rows that represent them (used to scope "my tasks").
 *
 * Assignment is recorded by profile_id where available and otherwise by
 * email/name, so both are checked - same resolution the projects list uses.
 */
export async function getAssignment(
  db: SupabaseClient,
  userId: string,
): Promise<{ projectIds: string[]; memberIds: string[] }> {
  const { data: profile } = await db
    .from('profiles').select('email, full_name').eq('id', userId).single()

  const { data: byProfileId } = await db
    .from('project_team_members').select('id, project_id').eq('profile_id', userId)

  let rows = byProfileId ?? []

  if (rows.length === 0 && profile) {
    const conditions: string[] = []
    if (profile.email) conditions.push(`email.eq.${profile.email}`)
    if (profile.full_name) conditions.push(`name.eq.${profile.full_name}`)
    if (conditions.length > 0) {
      const { data: byNameEmail } = await db
        .from('project_team_members').select('id, project_id').or(conditions.join(','))
      rows = byNameEmail ?? []
    }
  }

  return {
    projectIds: Array.from(new Set(rows.map((r: any) => r.project_id).filter(Boolean))),
    memberIds: Array.from(new Set(rows.map((r: any) => r.id).filter(Boolean))),
  }
}
