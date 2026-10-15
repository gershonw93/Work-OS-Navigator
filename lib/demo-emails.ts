import { addDaysIso } from './inspection-status'
import { dayWords } from './dates'
import { TRIAL_DAYS } from './plans'
import {
  inviteEmail, platformInviteEmail, teamInviteEmail, vendorInviteEmail, subWelcomeEmail,
  passwordResetEmail, welcomeEmail, clientPortalEmail, tokenLinkEmail,
  awardEmail, scheduleShiftEmail, scheduleUnblockedEmail, scopeChangeEmail,
  deletionRequestEmail, weeklySummaryEmail, portalLoginCodeEmail,
} from './email'
import { summarizeWeek, weekEnding } from './weekly-summary'
import { deletionPromise } from './account-deletion'
import { SUPPORT_EMAIL } from './support-email'

// ─────────────────────────────────────────────────────────────────────────────
// The demo board's OTHER half: the emails that never go through `notify()`.
//
// THE GAP. `/admin/demo` sends any live notification type, and eleven templates
// in `lib/email.ts` are not one - a route sends them directly, because they
// have no audience to configure and no preference to honour. The welcome email
// is the clearest case: it is the first thing a customer ever receives, and the
// only way to see it was to complete a real signup. The console exists exactly
// so nobody has to stage a real event to read the copy, and half the copy was
// out of its reach.
//
// SAME RULES AS `lib/demo-notification.ts`, which this sits beside:
//
//   * PURE AND SEPARATE, so the product's own paths cannot reach the sample
//     copy by accident. The super-admin route is the only caller.
//   * THE DATES ARE COMPUTED, NOT WRITTEN. A sample reading "due Sep 12" in
//     November is the one detail an audience notices.
//
// AND ONE RULE OF ITS OWN: these do NOT respect anybody's notification
// settings, because the real sends do not either. The screen has to say so, or
// "I turned that off and still got one" arrives as a bug report about a product
// working exactly as designed.
// ─────────────────────────────────────────────────────────────────────────────

export interface DemoEmail {
  /** Stable key. Stored in `demo_notification_log` as `email:<key>`. */
  key: string
  /** What the picker calls it. */
  label: string
  /** When the product actually sends this one - shown under the option. */
  when: string
  build: (today: string) => { subject: string; text: string; html: string }
}

const PROJECT = 'Fairview Terrace Residence'
const SUB = 'Maplewood Framing Co'
const GC = 'Brightline Construction'
const PERSON = 'Dana Whitfield'
const APP = 'https://app.sytenav.com'

/** "Fri Oct 9", from a plain offset. Never the object, never "null". */
const say = (iso: string): string => dayWords(iso, { weekday: true }) ?? iso

/**
 * Every transactional template, with sample data.
 *
 * ONE ENTRY PER SENDER. The pin derives the expected set by reading the
 * exported `*Email` functions out of `lib/email.ts` and subtracting the ones a
 * catalog type covers, so a twelfth template cannot quietly arrive with no way
 * to look at it - the same shape as the pin that makes a new live notification
 * type fail the suite until it has demo copy.
 */
export const DEMO_EMAILS: DemoEmail[] = [
  {
    key: 'welcome',
    label: 'Welcome',
    when: 'The moment somebody finishes creating their account.',
    build: today => welcomeEmail({
      name: PERSON,
      appUrl: APP,
      trialDays: TRIAL_DAYS,
      trialEndWords: say(addDaysIso(today, TRIAL_DAYS)),
    }),
  },
  {
    key: 'invite-waitlist',
    label: 'Invite - approved from the waitlist',
    when: 'Approving somebody who asked for access on the pricing page.',
    build: () => inviteEmail({ name: PERSON, inviteUrl: `${APP}/signup?invite=demo` }),
  },
  {
    key: 'invite-platform',
    label: 'Invite - started by us',
    when: 'Inviting somebody from the console who never applied.',
    build: () => platformInviteEmail({ name: PERSON, inviteUrl: `${APP}/signup?invite=demo` }),
  },
  {
    key: 'invite-team',
    label: 'Invite - a teammate',
    when: 'A customer adds somebody to their own company.',
    build: () => teamInviteEmail({
      name: PERSON, companyName: GC, inviterName: 'Sam Oyelaran',
      inviteUrl: `${APP}/signup?invite=demo`,
    }),
  },
  {
    key: 'invite-vendor',
    label: 'Invite - a subcontractor',
    when: 'A GC adds a vendor to their Directory.',
    build: () => vendorInviteEmail({
      name: PERSON, gcName: GC, inviteUrl: `${APP}/signup?invite=demo`,
    }),
  },
  {
    key: 'sub-welcome',
    label: 'Sub account made from a quote link',
    when: 'A sub creates a free account on their quote page to message the GC.',
    build: () => subWelcomeEmail({
      name: PERSON, gcName: GC, signInUrl: `${APP}/login`, askedAbout: 'Framing on Fairview Terrace Residence',
    }),
  },
  {
    key: 'password-reset',
    label: 'Password reset',
    when: 'Somebody asks for a reset link.',
    build: () => passwordResetEmail({ resetUrl: `${APP}/reset-password?token=demo` }),
  },
  {
    key: 'deletion-request',
    label: 'Account deletion request',
    when: 'Somebody presses Delete my account (Settings > Profile, or Me in Field Mode).',
    build: () => deletionRequestEmail({ name: PERSON, promise: deletionPromise('self'), supportEmail: SUPPORT_EMAIL }),
  },
  {
    key: 'portal-login-code',
    label: 'Client sign-in code',
    when: 'A client asks to sign in on their project page - to approve a change order.',
    build: () => portalLoginCodeEmail({ code: '482913', projectName: PROJECT, minutes: 10 }),
  },
  {
    key: 'weekly-summary',
    label: 'Weekly summary',
    when: 'Every Friday afternoon, to whoever the company routes it to (Settings > Notifications). It IS a notification type - this entry previews its letter, which is a page of numbers rather than one line.',
    build: today => {
      const week = weekEnding(today)
      const at = (n: number) => addDaysIso(today, -n)
      const p1 = { id: 'p1', name: PROJECT }, p2 = { id: 'p2', name: 'Lot 14 Oakridge' }, p3 = { id: 'p3', name: 'Harbor St Fit-out' }
      const summary = summarizeWeek({
        week,
        projects: [p1, p2, p3],
        tasks: [
          ...Array.from({ length: 6 }, () => ({ project_id: 'p1', status: 'completed', completed_at: `${at(2)}T15:00:00Z`, due_date: null })),
          { project_id: 'p2', status: 'completed', completed_at: `${at(1)}T15:00:00Z`, due_date: null },
          { project_id: 'p2', status: 'open', completed_at: null, due_date: at(4) },
        ],
        dailyLogs: [at(0), at(1), at(2), at(3)].map(d => ({ project_id: 'p1', log_date: d })),
        inspections: [{ project_id: 'p1', status: 'passed', completed_date: at(3) }],
        rfis: [{ project_id: 'p2', responded_at: `${at(2)}T12:00:00Z` }],
        selections: [{ project_id: 'p1', status: 'chosen', selected_at: `${at(1)}T12:00:00Z`, needed_by: null }],
        delayReports: [{ project_id: 'p2', days: 3, reason: 'Rain on the slab pour', created_at: `${at(2)}T09:00:00Z`, reported_by_name: SUB }],
        scheduleLines: [],
      })
      return weeklySummaryEmail({
        name: PERSON, companyName: GC,
        weekLabel: `${say(week.start)} - ${say(week.end)}`,
        summary, url: `${APP}/dashboard`, settingsUrl: `${APP}/settings?tab=notifications`,
      })
    },
  },
  {
    key: 'client-portal',
    label: 'Client portal link',
    when: 'A GC shares the job with their client.',
    build: () => clientPortalEmail({
      clientName: 'Marguerite Alder',
      projectName: PROJECT,
      senderName: 'Sam Oyelaran',
      companyName: GC,
      portalUrl: `${APP}/portal/demo`,
      note: 'Framing is done and the rough-in inspection is booked - have a look when you get a minute.',
    }),
  },
  {
    key: 'token-link',
    label: 'Quote request / document request',
    when: 'Asking a sub for a price, or for their paperwork.',
    build: today => tokenLinkEmail({
      recipientName: PERSON,
      eyebrow: 'Request for quote',
      heading: `Interior framing at ${PROJECT}`,
      lines: [
        `${GC} would like a price for interior framing at ${PROJECT}.`,
        `The drawings and scope are behind the link. We are looking to award by ${say(addDaysIso(today, 7))}.`,
      ],
      ctaLabel: 'Open the scope',
      url: `${APP}/bid/demo`,
      fromName: 'Sam Oyelaran',
      companyName: GC,
      note: 'Shout if anything in the scope is unclear before you price it.',
    }),
  },
  {
    key: 'award',
    label: 'Award',
    when: 'A sub wins the package.',
    build: () => awardEmail({
      vendorName: SUB, scope: 'Interior framing', projectName: PROJECT, amount: 148_500,
      fromName: 'Sam Oyelaran', companyName: GC,
    }),
  },
  {
    key: 'schedule-shift',
    label: 'Dates moved',
    when: 'A schedule change pushes a sub\'s dates.',
    build: today => scheduleShiftEmail({
      vendorName: SUB,
      projectName: PROJECT,
      lines: [{
        trade: 'Interior framing',
        oldStart: addDaysIso(today, 4),
        newStart: addDaysIso(today, 7),
        shiftDays: 3,
        because: 'Sheetrock',
      }],
      fromName: 'Sam Oyelaran',
      companyName: GC,
    }),
  },
  {
    key: 'schedule-unblocked',
    label: "You're clear to start",
    when: 'The trade ahead finishes and a sub can begin.',
    build: today => scheduleUnblockedEmail({
      vendorName: SUB,
      projectName: PROJECT,
      trade: 'Interior framing',
      predecessorTrade: 'Sheetrock',
      startDate: addDaysIso(today, 1),
      fromName: 'Sam Oyelaran',
      companyName: GC,
    }),
  },
  {
    key: 'scope-change',
    label: 'Drawings changed',
    when: 'A revised plan goes out to the people working off it.',
    build: today => scopeChangeEmail({
      projectName: PROJECT,
      planName: 'A-201 Second Floor Plan - Rev C',
      changedBy: 'Sam Oyelaran',
      message: `The stair opening moved 18" north. Revised sheet attached - please price any change before ${say(addDaysIso(today, 3))}.`,
      recipientName: PERSON,
    }),
  },
]

/** One sample, or null for a key we do not have copy for. */
export function demoEmail(key: string, today: string): { subject: string; text: string; html: string } | null {
  const entry = DEMO_EMAILS.find(e => e.key === key)
  return entry ? entry.build(today) : null
}
