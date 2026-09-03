// ─────────────────────────────────────────────────────────────────────────────
// Who gets told when something happens.
//
// THE GAP. lib/notifications.ts says what the events are and each person can
// mute the ones they do not want. Nothing said who gets told in the FIRST
// place: `notify()` takes `userIds`, so the decision was hand-rolled at twenty
// call sites. Some of it was good - "whoever can approve a bill hears about one
// waiting". Some of it was this, in the inspections route:
//
//     if (!recipients.size && proj?.gc_company_id) {
//       const { data: office } = await db.from('profiles')...eq('company_id', ...)
//       for (const p of office ?? []) recipients.add(p.id)
//     }
//
// Ten office staff, ten notifications, every time somebody marks work ready.
//
// THE LINE THIS DESIGN TURNS ON. Some recipients are STRUCTURAL and must never
// be configurable - the person a task is assigned to, the sub invited to bid,
// whoever asked for the inspection. Route those by role and the feature breaks
// silently: the assignee stops being told they were assigned something, and
// nothing errors. So a 'direct' type is refused here outright rather than
// merely left out of the settings screen, because a screen is a thing somebody
// can add a row to later.
//
// Pure, like lib/committed.ts and lib/pay-app-rules.ts - these decide whether
// somebody hears that money moved, and rules needing a server to test are rules
// nobody tests.
// ─────────────────────────────────────────────────────────────────────────────

import { canonicalType, notificationType, type PermissionRef } from './notifications'

/** What a company has configured for one event. No row means the default. */
export interface RoutingRule {
  type: string
  /** Roles that should hear it, e.g. ['admin', 'project_manager']. */
  roles: string[]
  /** Specific people, named regardless of role. */
  userIds: string[]
}

export type Decision =
  | { ok: true; value: RoutingRule }
  | { ok: false; error: string }

/**
 * Is this event's audience something a company may configure?
 *
 * False for every 'direct' type, and for a type the catalogue does not know.
 */
export function isRoutable(type: string): boolean {
  return notificationType(canonicalType(type))?.audience === 'team'
}

/** The permission a 'team' type falls back to. Null when it is not routable. */
export function defaultAudience(type: string): PermissionRef | null {
  const t = notificationType(canonicalType(type))
  if (!t || t.audience !== 'team') return null
  return t.defaultAudience ?? null
}

/**
 * Check a rule on its way into the database.
 *
 * REFUSES AN EMPTY AUDIENCE rather than storing it. "Nobody" is almost always a
 * mistake, and it is the kind that fails silently forever - the notification
 * simply stops arriving and there is nothing to see. Somebody who genuinely
 * wants an event off turns it off per person, which is what the existing
 * preference switches are for.
 */
export function checkRule(input: {
  type: string
  roles?: unknown
  userIds?: unknown
}): Decision {
  const type = canonicalType(String(input.type ?? ''))
  const t = notificationType(type)

  if (!t) return { ok: false, error: 'That is not a notification we send.' }
  if (t.audience !== 'team') {
    return {
      ok: false,
      error: `"${t.label}" always goes to the person it is about, so there is nobody to choose.`,
    }
  }

  const roles = clean(input.roles)
  const userIds = clean(input.userIds)

  if (!roles.length && !userIds.length) {
    return {
      ok: false,
      error: 'Pick at least one role or person. Leaving it empty would stop the notification without saying so.',
    }
  }

  return { ok: true, value: { type, roles, userIds } }
}

const clean = (v: unknown): string[] =>
  Array.isArray(v)
    ? Array.from(new Set(v.map(x => String(x ?? '').trim()).filter(Boolean)))
    : []

/**
 * The final recipient list, from the parts the database returned.
 *
 * Kept separate from the query so the rules can be tested without one. The
 * actor is removed last and always: there is no point telling somebody about
 * the thing they just did, and it is the difference between a useful bell and
 * one people stop opening.
 */
/**
 * Structural recipients, plus whoever the company routed the event to.
 *
 * THE BUG THIS EXISTS TO STOP. Three inspection paths each hand-rolled this
 * union, and one of them got it backwards:
 *
 *     if (scheduler_profile_id) {
 *       const bookers = new Set([scheduler_profile_id])
 *       for (const id of await audienceFor({ ... })) bookers.add(id)
 *
 * The assigned person GATED the routed audience instead of joining it, so
 * requesting an inspection with nobody assigned told nobody at all - including
 * the four people the settings screen promises will hear about it, and
 * including a rule a company had explicitly saved. The settings screen refuses
 * to store an empty audience because that "would stop the notification without
 * saying so"; this did exactly that through a different door.
 *
 * So the union lives here, once, and every path calls it. Pure, and importable
 * from a client component - which is what stops the request form from deriving
 * the same answer a second time in the browser to show who will be told.
 *
 * The actor is removed LAST and always. Doing it inside `audienceFor` only
 * covers the routed half; the create route seeded itself with the scheduler
 * afterwards, so assigning an inspection to yourself notified you.
 */
export function withStructural(
  routed: string[],
  structural: (string | null | undefined)[],
  actor?: string | null,
): string[] {
  const ids = new Set<string>()
  // Blanks are dropped rather than added: a missing assignee is `undefined` or
  // '' at half these call sites, and an empty-string user id is a row that
  // matches nobody and errors nowhere.
  for (const id of structural) {
    const v = String(id ?? '').trim()
    if (v) ids.add(v)
  }
  for (const id of routed) {
    const v = String(id ?? '').trim()
    if (v) ids.add(v)
  }
  if (actor) ids.delete(actor)
  return Array.from(ids)
}

export function resolveRecipients(input: {
  /** Everybody in the company, with their role. */
  members: { id: string; role?: string | null }[]
  /** The configured rule, or null to use `fromPermission`. */
  rule: RoutingRule | null
  /** Who the permission default resolves to. Used only when `rule` is null. */
  fromPermission: string[]
  /** Whoever triggered it. */
  exclude?: string | null
}): string[] {
  const { members, rule, fromPermission, exclude } = input

  const ids = new Set<string>()
  if (rule) {
    const roles = new Set(rule.roles)
    for (const m of members) if (m.role && roles.has(m.role)) ids.add(m.id)
    // Named people are added whatever their role - that is the point of naming
    // somebody. A person who no longer works here is simply not in `members`,
    // so a stale id resolves to nobody rather than to an error.
    const known = new Set(members.map(m => m.id))
    for (const id of rule.userIds) if (known.has(id)) ids.add(id)
  } else {
    for (const id of fromPermission) ids.add(id)
  }

  if (exclude) ids.delete(exclude)
  return Array.from(ids)
}
