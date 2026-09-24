// Deleting an account, from inside the app - the rules both doors ask.
//
// Apple (App Store rule 5.1.1(v)) requires that anybody with an account can
// START deleting it without leaving the app. SyteNav carries a deletion out by
// hand within `DELETION_DAYS` (the same promise /delete-account makes), so the
// in-app control is a REQUEST that is recorded, confirmed to the person, and
// sent to us - and the screen says exactly that, rather than "deleted".

import { SUPPORT_EMAIL } from './support-email'

export type DeletionScope = 'self' | 'company'

/** How long we promise to take. /delete-account says the same number. */
export const DELETION_DAYS = 30

export function isDeletionScope(v: unknown): v is DeletionScope {
  return v === 'self' || v === 'company'
}

/**
 * The one reason a request is refused, or null.
 *
 * `self` needs nothing: every person may ask for their own login to go. A whole
 * company holds everybody else's work too, so it takes the Danger Zone's own
 * permission (`settings_company: delete`) - asked by the route, not only hidden
 * by the screen.
 */
export function deletionProblem(scope: unknown, canDeleteCompany: boolean): string | null {
  if (!isDeletionScope(scope)) return 'Say whether it is your own login or the whole company.'
  if (scope === 'company' && !canDeleteCompany) {
    return 'Only an admin can ask for the whole company account to be deleted. You can still delete your own login.'
  }
  return null
}

/** What the screen and the email say will happen - ONE sentence for both. */
export function deletionPromise(scope: DeletionScope): string {
  return scope === 'company'
    ? `We will delete your company account, every project in it and every teammate's login within ${DELETION_DAYS} days, and email you when it is done.`
    : `We will delete your login and your personal details within ${DELETION_DAYS} days, and email you when it is done. Work you recorded on your company's jobs stays with the company.`
}

/** What reaches our inbox. Plain text: it is read by us, not by a customer. */
export function deletionNotice(r: {
  scope: DeletionScope; email: string; name: string | null; companyName: string | null; requestId: string
}): { subject: string; text: string } {
  const what = r.scope === 'company' ? 'WHOLE COMPANY ACCOUNT' : 'their own login'
  return {
    subject: `Deletion request: ${r.companyName ?? r.email} (${r.scope === 'company' ? 'company' : 'login'})`,
    text: [
      `${r.name || r.email} asked, from inside the app, to delete ${what}.`,
      '',
      `Email: ${r.email}`,
      `Company: ${r.companyName ?? '-'}`,
      `Request id: ${r.requestId} (account_deletion_requests)`,
      '',
      `We promised to do it within ${DELETION_DAYS} days and to email them when it is done.`,
      `Reply to them from ${SUPPORT_EMAIL}.`,
    ].join('\n'),
  }
}
