// The demo control board's copy: a convincing notification of any live type,
// dated from today, tied to no real record at all.
//
// WHY IT EXISTS: live demos. "Select a user and select a notification, it
// pushes an email and app notification with makeshift text that looks real
// based on the current date." Waiting for a real inspection to fall two
// business days out is not a demo, it is a stakeout.
//
// WHY IT IS PURE AND SEPARATE: the sample copy must never be reachable from
// the product's own paths. A module the app cannot import by accident cannot
// leak a fake change order into a real feed - the route that sends this is the
// only caller, and it is super-admin only.
//
// THE DATES ARE COMPUTED, NOT WRITTEN. A demo whose sample says "due Sep 12"
// in November is worse than no demo: it is the one detail an audience notices.
// Everything below is relative to the day it is sent.

import { addDaysIso, addBusinessDaysIso } from './inspection-status'
import { dateWords } from './dates'
import { isSendableType, notificationType, NOTIFICATION_TYPES } from './notifications'
import { trialCopy } from '@/lib/trial-warning'
import { NUDGES } from '@/lib/onboarding-nudges'

export interface DemoNotification {
  /** The bell headline, and the email subject. */
  title: string
  /** One line, in the recipient's terms. */
  message: string
  /** Where it goes. A demo that lands on a 404 is a demo of a 404. */
  link: string
}

/** A name that is obviously a sample to us and unremarkable to an audience. */
const PROJECT = 'Fairview Terrace Residence'
const SUB = 'Maplewood Framing Co'

/** "Tue Oct 24", from a plain offset. Falls back to the raw date, never to ''. */
const say = (iso: string): string => dateWords(iso)?.withWeekday ?? iso

/**
 * Sample copy for one notification type, dated from `today`.
 *
 * Returns null for a type the catalog will not send - the picker is built from
 * the catalog, so this is a guard against a stale key rather than a normal
 * path, and null is what stops the route inventing its own wording.
 */
export function demoNotification(type: string, today: string): DemoNotification | null {
  if (!isSendableType(type)) return null

  const inDays = (n: number) => say(addDaysIso(today, n))
  const inBusiness = (n: number) => say(addBusinessDaysIso(today, n))

  switch (type) {
    case 'task_assigned':
      return {
        title: 'Task assigned to you',
        message: `Patch and sand the north stairwell before the painters start - due ${inDays(2)} on ${PROJECT}.`,
        link: '/tasks',
      }
    case 'task_updated':
      return {
        title: 'Task updated: Stairwell handrail',
        // The DATE is computed like every other sample here - a demo reading
        // "due Sep 12" in November is the one detail an audience notices.
        message: `${SUB} updated "Stairwell handrail" on ${PROJECT}: status -> In Progress, due date -> ${inDays(3)}.`,
        link: '/tasks',
      }
    case 'scope_change':
      return {
        title: 'Plans changed: A-201 Floor Plans Rev C',
        message: `${SUB} on ${PROJECT}: slab height dropped 1/2" and the pour changed from one center pour to floor-by-floor. Check your rough-in heights before ${inDays(2)}.`,
        link: '/plans',
      }
    case 'signoff_requested':
      return {
        title: 'Sign-off requested',
        message: `${SUB} marked the stairwell punch list complete on ${PROJECT} and is asking you to sign it off.`,
        link: '/tasks',
      }
    case 'invoice_pending':
      return {
        title: 'Invoice waiting for approval',
        message: `${SUB} submitted invoice #1042 for $18,400 on ${PROJECT}. It is over the payment schedule line by $1,900.`,
        link: '/invoices',
      }
    case 'invoice_decision':
      return {
        title: 'Your invoice was approved',
        message: `Invoice #1042 for $18,400 on ${PROJECT} was approved and is scheduled to pay on ${inDays(14)}.`,
        link: '/my-bids',
      }
    case 'access_request':
      return {
        title: 'New access request',
        message: `Dana Whitfield - Whitfield Builders (dana@whitfieldbuilders.com) asked for access on ${inDays(0)}. Approve them and the invite goes out automatically.`,
        link: '/admin/access-requests',
      }
    case 'onboarding_nudge':
      // Off the real list, so a demo cannot show a nudge the product does not
      // send - the same rule as the trial warning below.
      return {
        ...NUDGES[0],
        message: `${NUDGES[0].message} Your trial runs to ${inDays(14)}.`,
        link: NUDGES[0].link,
      }
    case 'trial_ending':
      // The one sample whose copy is not invented here: it comes from the same
      // function the cron writes with, so a demo cannot show a sentence the
      // product does not send. The date moves because `inDays` does.
      return {
        ...trialCopy(3),
        message: `${trialCopy(3).message} Your trial ends on ${inDays(3)}.`,
        link: '/settings?tab=billing',
      }
    case 'new_bid':
      return {
        title: 'Bid received',
        message: `${SUB} sent a quote of $46,800 for Framing on ${PROJECT}. Two of three invited subs have now answered.`,
        link: '/projects',
      }
    case 'bid_invited':
      return {
        title: 'You have been invited to bid',
        message: `Framing on ${PROJECT}, 17 Fairview Terrace. Answers are wanted by ${inBusiness(5)}.`,
        link: '/my-bids',
      }
    case 'bid_reminder':
      return {
        title: 'Reminder: a quote is still open',
        message: `Framing on ${PROJECT} closes ${inBusiness(2)} and we have not had your number yet.`,
        link: '/my-bids',
      }
    case 'bid_awarded':
      return {
        title: 'Your bid was awarded',
        message: `Framing on ${PROJECT} is yours at $46,800. Start date is ${inBusiness(10)}.`,
        link: '/my-bids',
      }
    case 'schedule_shifted':
      return {
        title: 'Your dates moved',
        message: `Framing on ${PROJECT} moved 3 days: was ${inDays(-1)}, now ${inDays(2)}, because Foundation ran long.`,
        link: '/my-jobs',
      }
    case 'schedule_unblocked':
      return {
        title: 'You are clear to start',
        message: `Foundation on ${PROJECT} is finished, so Framing can begin ${inBusiness(1)}.`,
        link: '/my-jobs',
      }
    case 'compliance_expiring':
      return {
        title: 'A document expires soon',
        message: `${SUB}'s general liability certificate expires ${inDays(21)}. They are on two of your active jobs.`,
        link: '/compliance',
      }
    case 'inspection_to_schedule':
      return {
        title: 'An inspection needs booking',
        message: `Framing on ${PROJECT} was requested for ${inBusiness(4)} and nobody has rung the township yet.`,
        link: '/projects',
      }
    case 'inspection_ready':
      return {
        title: 'Work marked ready for inspection',
        message: `${SUB} marked Framing ready on ${PROJECT}. The inspector is booked for ${inBusiness(2)}.`,
        link: '/projects',
      }
    case 'inspection_not_ready':
      return {
        title: 'Inspection not marked ready',
        message: `Framing at ${PROJECT} is booked for ${inBusiness(2)} and nobody has marked the work ready. Finish it, or ring the jurisdiction to move the trip.`,
        link: '/projects',
      }
    case 'inspection_result':
      return {
        title: 'Inspection passed',
        message: `Framing on ${PROJECT} passed on ${inDays(0)}. Insulation can be scheduled.`,
        link: '/projects',
      }
    case 'rfi_submitted':
      return {
        title: 'RFI raised',
        message: `${SUB} raised an RFI on ${PROJECT}: the stair headroom on sheet A-203 does not clear code. An answer is wanted by ${inBusiness(3)}.`,
        link: '/projects',
      }
    default:
      // A live type with no sample yet. NULL rather than a generic sentence:
      // "This is a test notification" on a demo screen is the thing the demo
      // was supposed to avoid, and the pin below makes this branch unreachable.
      return null
  }
}

/** Every live type, with whether a sample exists. The pin reads this. */
export function demoCoverage(today: string): { type: string; label: string; ready: boolean }[] {
  return NOTIFICATION_TYPES
    .filter(t => t.status === 'live')
    .map(t => ({
      type: t.key,
      label: notificationType(t.key)?.label ?? t.key,
      ready: demoNotification(t.key, today) !== null,
    }))
}
