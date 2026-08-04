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
