// ─────────────────────────────────────────────────────────────────────────────
// Every kind of notification SyteNav can send, in one place.
//
// WHY A CATALOG. Settings offered eight switches. The app emits SIXTEEN distinct
// type strings. Two matched. One pair - `new_task` in Settings against
// `task_assigned` in the code - was close enough to look deliberate and could
// never have matched.
//
// Worse, the code disagreed with ITSELF. The same event was written under
// different names depending on which route wrote it: `bid` from the sub's side
// and `new_bid` from the GC's; `rfi` and `rfi_submitted`; and three separate
// invoice outcomes that answer one question. A preference keyed on one of those
// names would silently not have governed the others. See TYPE_ALIASES.
//
// That happened because the two lists lived in different files and neither knew
// about the other. Nothing here stops somebody typing a new string into an
// insert - but the send path in lib/notify.ts refuses any type that is not in
// this catalog, and the settings screen renders FROM this catalog, so the two
// cannot drift apart silently the way they did.
//
// Preferences are stored per (person, type). A MISSING ROW MEANS "use the
// default below" - deliberately, so nothing has to be backfilled and a new
// notification type works correctly for existing people the day it ships.
// ─────────────────────────────────────────────────────────────────────────────

export type Channel = 'inApp' | 'email'

export interface NotificationType {
  key: string
  label: string
  /** What actually triggers it, in the recipient's terms. */
  description: string
  group: string
  defaults: Record<Channel, boolean>
  /**
   * 'planned' means the switch is shown but nothing emits it yet. Modelled as
   * data rather than a hardcoded row in the UI, so building the notification
   * later is a one-word change here and the switch starts working.
   */
  status: 'live' | 'planned'
}

/**
 * Email defaults are ON for six, and only six: where not knowing until you next
 * log in has a real cost. Somebody is blocked on your signoff. An insurance
 * certificate lapses. A bill needs approving, or one you sent got paid. A bid
 * you priced was decided. You were invited to quote and the window is open.
 * Everything else is in-app only until somebody asks for it.
 *
 * That restraint is not politeness. It is one sending reputation for the whole
 * domain: teach people to mute SyteNav with notification noise and the password
 * resets and invoices go to spam along with it.
 */
export const NOTIFICATION_TYPES: NotificationType[] = [
  // ── Work ──────────────────────────────────────────────────────────────────
  {
    key: 'task_assigned', label: 'Task assigned to me', group: 'Work',
    description: 'Somebody assigns you a task, or pins one to you from a plan.',
    defaults: { inApp: true, email: false }, status: 'live',
  },
  {
    key: 'signoff_requested', label: 'Sign-off requested', group: 'Work',
    description: 'Someone needs you to sign off on a task before it can close.',
    defaults: { inApp: true, email: true }, status: 'live',
  },
  {
    key: 'milestone', label: 'Milestone reached', group: 'Work',
    description: 'A job hits a milestone you are on.',
    // PLANNED, not live: nothing in the app raises a "milestone reached" event.
    // The only milestones that exist are payment-schedule line types on a
    // subcontract, which are a billing shape, not a moment in a job's life.
    // Found by the dead-switch check, not by anybody noticing - which is the
    // whole problem with a switch over a type nothing emits.
    defaults: { inApp: true, email: false }, status: 'planned',
  },
  {
    key: 'daily_log', label: 'Daily log posted', group: 'Work',
    description: 'A daily log is submitted on one of your jobs.',
    defaults: { inApp: true, email: false }, status: 'planned',
  },

  // ── Money ─────────────────────────────────────────────────────────────────
  {
    key: 'invoice_pending', label: 'Invoice waiting for approval', group: 'Money',
    description: 'A sub sends you a bill that needs approving.',
    defaults: { inApp: true, email: true }, status: 'live',
  },
  {
    // Was three separate strings in three branches of one route -
    // invoice_approved, invoice_sent and invoice_paid. Three names for one
    // question a person has ("what happened to my bill?"), and therefore one
    // switch. ALIASES below keeps the old callers working.
    key: 'invoice_decision', label: 'My invoice approved, released or paid', group: 'Money',
    description: 'A bill you submitted is approved, released for payment, or paid.',
    defaults: { inApp: true, email: true }, status: 'live',
  },
  {
    key: 'change_order', label: 'Change order raised or decided', group: 'Money',
    description: 'A change order is raised, approved or rejected on your job.',
    defaults: { inApp: true, email: false }, status: 'planned',
  },

  // ── Bids ──────────────────────────────────────────────────────────────────
  {
    // TO THE GC. Was sharing the `new_bid` string with the invitation below,
    // which travels the OPPOSITE WAY - to the sub. One switch for both meant a
    // sub who turned off "bid received" would stop being invited to quote.
    key: 'new_bid', label: 'Bid received', group: 'Bids',
    description: 'A sub submits or revises a bid on one of your packages.',
    defaults: { inApp: true, email: false }, status: 'live',
  },
  {
    // TO THE SUB.
    // Email ON despite the restraint above. An invitation to quote that sits
    // in a bell the sub never opens is a job that gets no bids - it fails the
    // GC who sent it as much as the sub who missed it.
    key: 'bid_invited', label: 'Invited to bid', group: 'Bids',
    description: 'A GC invites you to quote a package.',
    defaults: { inApp: true, email: true }, status: 'live',
  },
  {
    key: 'bid_revision', label: 'Bid revision requested', group: 'Bids',
    description: 'A GC asks you to revise a bid you submitted.',
    // PLANNED, not live: there is no "ask for a revision" action anywhere in
    // the quotes flow, so nothing can emit this. A sub revises by opening
    // their link again and re-submitting, which replaces the old quote.
    // Better to say "Coming soon" than to offer a switch over a type that has
    // never once fired.
    defaults: { inApp: true, email: false }, status: 'planned',
  },
  {
    key: 'bid_reminder', label: 'Bid reminder', group: 'Bids',
    description: 'A nudge about a bid you were invited to and have not sent.',
    defaults: { inApp: true, email: false }, status: 'live',
  },
  {
    key: 'bid_awarded', label: 'Bid awarded', group: 'Bids',
    description: 'A package you bid on is awarded - to you or to somebody else.',
    defaults: { inApp: true, email: true }, status: 'live',
  },

  // ── Compliance ────────────────────────────────────────────────────────────
  {
    key: 'compliance_expiring', label: 'Document expiring', group: 'Compliance',
    description: 'An insurance certificate, licence or W-9 is within 30 days of expiry.',
    defaults: { inApp: true, email: true }, status: 'live',
  },
  {
    key: 'inspection_to_schedule', label: 'Inspection to book', group: 'Compliance',
    description: 'An inspection is ready to be scheduled.',
    defaults: { inApp: true, email: false }, status: 'live',
  },
  {
    key: 'inspection_ready', label: 'Work marked ready for inspection', group: 'Compliance',
    description: 'Somebody marks work ready so the inspector can be booked.',
    defaults: { inApp: true, email: false }, status: 'live',
  },
  {
    // The route built this type dynamically - `inspection_${newStatus}` -
    // producing three strings no switch had ever heard of. Aliased below.
    key: 'inspection_result', label: 'Inspection scheduled, passed or failed', group: 'Compliance',
    description: 'An inspection is booked, or comes back passed or failed.',
    defaults: { inApp: true, email: false }, status: 'live',
  },
  {
    key: 'rfi_submitted', label: 'RFI raised', group: 'Compliance',
    description: 'Somebody raises an RFI on one of your jobs.',
    defaults: { inApp: true, email: false }, status: 'live',
  },
  {
    // Raising an RFI notifies; ANSWERING one still notifies nobody. Left
    // planned because the switch should exist before the notification does,
    // not after.
    key: 'rfi_response', label: 'RFI answered', group: 'Compliance',
    description: 'Somebody answers an RFI you raised.',
    defaults: { inApp: true, email: false }, status: 'planned',
  },
]

/**
 * Old type strings, and the catalog entry they really mean.
 *
 * These were found in the code, not invented: the same event was being written
 * under different names from different routes - `bid` from the sub's side and
 * `new_bid` from the GC's, `rfi` and `rfi_submitted` for one thing, and three
 * separate invoice outcomes. A preference keyed on one name silently would not
 * have governed the others.
 *
 * Mapping them is what lets old rows already in the table keep displaying, and
 * lets a caller that has not been migrated yet still land in the right switch.
 */
export const TYPE_ALIASES: Record<string, string> = {
  bid: 'new_bid',
  inspection_scheduled: 'inspection_result',
  inspection_passed: 'inspection_result',
  inspection_failed: 'inspection_result',
  rfi: 'rfi_submitted',
  invoice_approved: 'invoice_decision',
  invoice_sent: 'invoice_decision',
  invoice_paid: 'invoice_decision',
}

/** The catalog key for any type string, old or current. */
export function canonicalType(key: string): string {
  return TYPE_ALIASES[key] ?? key
}

export const NOTIFICATION_GROUPS = ['Work', 'Money', 'Bids', 'Compliance'] as const

const BY_KEY = new Map(NOTIFICATION_TYPES.map(t => [t.key, t]))

export function notificationType(key: string): NotificationType | undefined {
  return BY_KEY.get(canonicalType(key))
}

/** Can anything actually send this? Planned types are switches, not senders. */
export function isSendableType(key: string): boolean {
  return BY_KEY.get(canonicalType(key))?.status === 'live'
}

export type PrefRow = { type: string; in_app: boolean; email: boolean }
export type Prefs = Record<string, Record<Channel, boolean>>

/**
 * Stored preference wins; otherwise the catalog default.
 *
 * Pure, and exported, because this is the rule the whole feature turns on and
 * it should be provable without a database. Rows for types that no longer exist
 * are ignored rather than surfacing a switch for something nobody can receive.
 */
export function effectivePrefs(rows: PrefRow[] | null | undefined): Prefs {
  const out: Prefs = {}
  for (const t of NOTIFICATION_TYPES) out[t.key] = { ...t.defaults }
  for (const r of rows ?? []) {
    const k = canonicalType(r.type)
    if (!BY_KEY.has(k)) continue
    out[k] = { inApp: !!r.in_app, email: !!r.email }
  }
  return out
}

/** Does this person want this type on this channel? */
export function wants(prefs: Prefs, type: string, channel: Channel): boolean {
  const k = canonicalType(type)
  return prefs[k]?.[channel] ?? BY_KEY.get(k)?.defaults[channel] ?? false
}
