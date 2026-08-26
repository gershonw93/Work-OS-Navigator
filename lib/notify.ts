// ─────────────────────────────────────────────────────────────────────────────
// The one way to tell somebody something.
//
// Notifications used to be a raw `db.from('notifications').insert(...)` in
// about fifteen route files. Three consequences, all of which this exists to
// end:
//
//   * there was nowhere to consult a preference, which is why there was no
//     working preference - the settings screen had switches that governed
//     nothing because nothing was reading them
//   * `type` is a plain text column, so a typo did not fail. It inserted, and
//     the row was then invisible to every filter and switch that spelled it
//     correctly
//   * every caller decided independently what to do when an insert failed,
//     mostly by not thinking about it
//
// Same contract as sendEmail: THIS NEVER THROWS. Assigning a task must not fail
// because telling somebody about it did. Notifying is a side effect of the work,
// never the work itself.
// ─────────────────────────────────────────────────────────────────────────────

import { canonicalType, effectivePrefs, isSendableType, notificationType, wants, type PrefRow } from '@/lib/notifications'
import { notificationEmail, sendEmail } from '@/lib/email'
import { appOrigin } from '@/lib/app-url'

export interface NotifyInput {
  /** A service-role Supabase client. */
  db: any
  /** Who to tell. Duplicates and blanks are removed. */
  userIds: (string | null | undefined)[]
  /** Must be a 'live' key in lib/notifications.ts. */
  type: string
  /** Short headline. The bell shows it in bold; the email uses it as subject. */
  title?: string | null
  /** One line, in the recipient's terms. Shown in the bell and the email. */
  message: string
  /** App-relative path, e.g. `/projects/abc/tasks`. Optional but wanted. */
  link?: string | null
}

export interface NotifyResult {
  inApp: number
  emailed: number
  skipped: 'unknown_type' | 'no_recipients' | null
  error?: string
}

/**
 * Tell people something, honouring what each of them asked for.
 *
 * One query for preferences and one insert for the whole batch, so notifying
 * thirty people is not thirty round trips. Emails go out concurrently and
 * their failures are counted, not raised.
 */
export async function notify(input: NotifyInput): Promise<NotifyResult> {
  const empty: NotifyResult = { inApp: 0, emailed: 0, skipped: null }

  try {
    // A type nobody can receive is a programming mistake, not a runtime state.
    // Refusing it here is what makes the catalog authoritative rather than
    // decorative - and it is exactly the check that would have caught
    // `new_task` vs `task_assigned`.
    if (!isSendableType(input.type)) {
      return { ...empty, skipped: 'unknown_type' }
    }

    const userIds = Array.from(new Set(input.userIds.filter((u): u is string => !!u)))
    if (!userIds.length) return { ...empty, skipped: 'no_recipients' }

    const [{ data: prefRows }, { data: people }] = await Promise.all([
      input.db.from('notification_preferences')
        .select('user_id, type, in_app, email')
        .in('user_id', userIds).eq('type', canonicalType(input.type)),
      input.db.from('profiles').select('id, email, full_name').in('id', userIds),
    ])

    const byUser = new Map<string, PrefRow[]>()
    for (const r of (prefRows ?? []) as (PrefRow & { user_id: string })[]) {
      byUser.set(r.user_id, [...(byUser.get(r.user_id) ?? []), r])
    }
    const prefsFor = (id: string) => effectivePrefs(byUser.get(id))

    // ── In-app ───────────────────────────────────────────────────────────────
    const inAppUsers = userIds.filter(id => wants(prefsFor(id), input.type, 'inApp'))
    let inApp = 0
    if (inAppUsers.length) {
      const rows = inAppUsers.map(id => ({
        user_id: id,
        type: canonicalType(input.type),
        title: input.title ?? null,
        message: input.message,
        link: input.link ?? null,
        read: false,
      }))
      const { error } = await input.db.from('notifications').insert(rows)
      if (!error) inApp = rows.length
    }

    // ── Email ────────────────────────────────────────────────────────────────
    const emailUsers = (people ?? []).filter((p: any) =>
      p?.email && wants(prefsFor(p.id), input.type, 'email'))

    const t = notificationType(input.type)
    const url = input.link ? `${appOrigin()}${input.link}` : null

    const results = await Promise.all(emailUsers.map(async (p: any) => {
      const { subject, text, html } = notificationEmail({
        name: p.full_name,
        eyebrow: t?.group ?? 'SyteNav',
        heading: input.title || t?.label || 'Update',
        message: input.message,
        url,
        settingsUrl: `${appOrigin()}/settings`,
      })
      const r = await sendEmail({ to: p.email, subject, text, html })
      return r.sent
    }))

    return { inApp, emailed: results.filter(Boolean).length, skipped: null }
  } catch (e) {
    // Deliberately swallowed. See the header: the caller's real work has
    // already succeeded by the time we get here.
    return { ...empty, error: e instanceof Error ? e.message : 'notify failed' }
  }
}
