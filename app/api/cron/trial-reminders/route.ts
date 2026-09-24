import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { audienceFor } from '@/lib/notification-audience'
import { notify } from '@/lib/notify'
import { checkCronAuth } from '@/lib/cron-auth'
import { trialWarning, trialCopy, TRIAL_WARN_FROM } from '@/lib/trial-warning'
import { dateWords } from '@/lib/dates'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// "Your trial ends in three days."
//
// The trial shipped with a banner inside the app three days out, and that is
// the wrong place for this: the company most likely to lose its account to an
// expiring trial is the one that has not opened the app this week, and the
// banner is invisible to precisely them. A deadline with no job behind it
// warns nobody.
//
// THREE LETTERS, at three days, one day and on the last day - days 12, 14 and
// 15 of a fifteen-day trial. `trialWarning()` holds that rule and the banner
// reads the same list, so nobody gets a calm screen on a day we wrote to them.
//
// IT RUNS IN THE MORNING. Vercel cron is UTC and does NOT follow daylight
// saving, so `45 11` is 7:45am Eastern in summer and drifts to 6:45 in winter -
// a one-character change in November, not a bug to rediscover. The inspection
// reminder learned that the hard way at 3:22am.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  // Auth FIRST, before a single read.
  const auth = checkCronAuth({
    secret: process.env.CRON_SECRET,
    authorization: request.headers.get('Authorization'),
    querySecret: new URL(request.url).searchParams.get('secret'),
    isVercelCron: request.headers.get('x-vercel-cron') != null,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = admin()

  // Narrowed in SQL, DECIDED by the shared rule. The window is deliberately
  // wider than the milestones - far enough ahead to catch the rows that need
  // their stamp RESET after a trial was extended, which is a row that is not
  // due a warning at all. A horizon cut to the milestones would filter those
  // out before the rule could see them, which is the exact shape of the bug
  // where a calendar horizon hid the Monday inspection from a business-day
  // rule.
  const { data: rows, error } = await db
    .from('company_billing')
    .select('company_id, status, trial_ends_at, trial_warned_days_left')
    .eq('status', 'trialing')
    .not('trial_ends_at', 'is', null)

  if (error) {
    console.error('[trial-reminders] could not read company_billing', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const now = new Date()
  let warned = 0
  let reset = 0
  let notifications = 0

  for (const row of (rows ?? []) as any[]) {
    const action = trialWarning(row, now)
    if (!action) continue

    if ('reset' in action) {
      // The trial moved. Clearing the stamp is what lets the run-up happen
      // again - without it an extended trial keeps a mark about a date that no
      // longer exists and is never warned again, silently, for ever.
      await db.from('company_billing')
        .update({ trial_warned_days_left: null })
        .eq('company_id', row.company_id)
      reset++
      continue
    }

    const copy = trialCopy(action.send)
    // The people who can actually choose a plan, through the same Who gets told
    // table every other event uses - `settings_billing`, the permission for the
    // ACTION being asked for, not for the record it is about.
    const recipients = await audienceFor({ db, companyId: row.company_id, type: 'trial_ending' })

    if (recipients.length) {
      await notify({
        db, userIds: recipients, type: 'trial_ending',
        title: copy.title,
        // The date as well as the countdown. "In 3 days" is an answer; the date
        // is what somebody checks against a diary.
        message: `${copy.message} Your trial ends on ${dateWords(row.trial_ends_at)}.`,
        link: '/settings?tab=billing',
      })
      notifications += recipients.length
    } else {
      // Worth a line in the log: a company on a trial with nobody routed to
      // hear about its ending is a company that will be locked out with no
      // warning, and that is a support call rather than a mystery.
      console.error('[trial-reminders] nobody is routed to hear this', { company: row.company_id })
    }

    // Stamped whether or not anybody was listening, so a re-run tomorrow does
    // not keep retrying a company that has routed this to nobody.
    await db.from('company_billing')
      .update({ trial_warned_days_left: action.send })
      .eq('company_id', row.company_id)
    warned++
  }

  return NextResponse.json({
    ok: true,
    trials_checked: (rows ?? []).length,
    warned,
    stamps_reset: reset,
    notifications,
    warn_from_days: TRIAL_WARN_FROM,
  })
}
