// ─────────────────────────────────────────────────────────────────────────────
// The routing rules, wired to the database.
//
// lib/notification-routing.ts holds the RULES and stays pure. This is the thin
// part that reads what a company configured and turns it into user ids - shared
// by every call site, so "who hears about an inspection" has one answer instead
// of eight hand-rolled ones.
// ─────────────────────────────────────────────────────────────────────────────

import { usersWhoCan } from './server-permissions'
import { canonicalType } from './notifications'
import {
  defaultAudience, isRoutable, resolveRecipients, type RoutingRule,
} from './notification-routing'

export interface AudienceInput {
  db: any
  /** The company whose people we are choosing from - the GC on the job. */
  companyId: string | null | undefined
  type: string
  /** Whoever triggered it. Never told about their own action. */
  exclude?: string | null
}

/**
 * Who at this company should hear about this event.
 *
 * Returns [] rather than throwing on anything unexpected - a notification that
 * cannot work out its audience must not take down the action that triggered it.
 * Marking work ready for inspection has to succeed even if the routing table is
 * unreadable; the same contract every other notification path here follows.
 */
export async function audienceFor(input: AudienceInput): Promise<string[]> {
  const { db, companyId, exclude } = input
  const type = canonicalType(input.type)

  if (!companyId) return []
  // A 'direct' type has no company-side audience by definition. Asking for one
  // is a programming mistake, and answering it would be worse than refusing.
  if (!isRoutable(type)) return []

  try {
    const [{ data: ruleRow }, { data: members }] = await Promise.all([
      db.from('notification_routing')
        .select('type, roles, user_ids')
        .eq('company_id', companyId).eq('type', type).maybeSingle(),
      db.from('profiles').select('id, role').eq('company_id', companyId),
    ])

    const rule: RoutingRule | null = ruleRow
      ? {
          type,
          roles: (ruleRow as any).roles ?? [],
          userIds: (ruleRow as any).user_ids ?? [],
        }
      : null

    // Only asked when nothing is configured - it is a second round trip, and
    // the whole point of a configured rule is that it already knows.
    let fromPermission: string[] = []
    if (!rule) {
      const perm = defaultAudience(type)
      if (perm) fromPermission = await usersWhoCan(db, companyId, perm[0], perm[1])
    }

    return resolveRecipients({
      members: (members ?? []) as any,
      rule,
      fromPermission,
      exclude,
    })
  } catch {
    return []
  }
}
