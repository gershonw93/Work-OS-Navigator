// ─────────────────────────────────────────────────────────────────────────────
// Emailing a permit set to the township - "Email it", beside "I sent it".
//
// Asked for right after "Send to Toms River Township" was renamed "I sent it"
// because SyteNav sent nothing. This is the version that DOES send: the
// township gets a link to the files (the same token link as the Sharing tab,
// so they can send the approved permit or their comments straight back onto
// the permit), the GC is copied, and a reply goes to the GC - never to our
// support inbox. Only an email that actually left is logged as a submission.
//
// Pure: the rules, the suggested address and the words. The route sends.
// ─────────────────────────────────────────────────────────────────────────────

import { isEmailAddress, isPlaceholderEmail } from './contact-email'
import { inspectorContactId } from './inspector-link'

export interface AddressContact {
  id?: string | null
  name?: string | null
  type?: string | null
  contact_email?: string | null
}
export interface RecentShare {
  recipient_email?: string | null
  /** The issuing authority on the permit the share was sent from. */
  authority?: string | null
  created_at?: string | null
}
export interface Suggested {
  email: string
  /** Where it came from, so the screen can say so and the save box knows whether to offer. */
  source: 'directory' | 'last_sent'
  contactId: string | null
}

const reachable = (a: string | null | undefined): a is string =>
  !!a && isEmailAddress(a) && !isPlaceholderEmail(a)

const key = (v: string | null | undefined) => (v ?? '').trim().toLowerCase().replace(/\s+/g, ' ')

/**
 * The address to start the To box on. The Directory contact whose name IS the
 * issuing authority - exact, one match, the same rule as an inspector link,
 * because the wrong township's inbox is worse than an empty box - and failing
 * that, the last address a permit with that authority was emailed to.
 */
export function suggestAddress(
  authority: string | null | undefined,
  contacts: AddressContact[],
  recent: RecentShare[],
): Suggested | null {
  if (!key(authority)) return null
  const id = inspectorContactId(authority, contacts as any)
  const hit = id ? contacts.find(c => c.id === id) : null
  if (hit && reachable(hit.contact_email)) return { email: hit.contact_email.trim(), source: 'directory', contactId: hit.id ?? null }
  const last = [...recent]
    .filter(r => key(r.authority) === key(authority) && reachable(r.recipient_email))
    .sort((a, b) => String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')))[0]
  if (last) return { email: (last.recipient_email as string).trim(), source: 'last_sent', contactId: hit?.id ?? null }
  return null
}

/** Asked by the dialog AND the route before anything is uploaded or sent. */
export function emailProblem(input: { to?: string | null; cc?: string[] | null }): string | null {
  const to = (input.to ?? '').trim()
  if (!to) return 'Add the township\'s email address.'
  if (!isEmailAddress(to) || isPlaceholderEmail(to)) return `"${to}" does not look like an email address.`
  for (const c of input.cc ?? []) {
    const a = (c ?? '').trim()
    if (a && (!isEmailAddress(a) || isPlaceholderEmail(a))) return `The copy address "${a}" does not look like an email address.`
  }
  return null
}

/** Split what was typed into the extra-copies box: commas, semicolons, spaces or new lines. */
export function splitAddresses(text: string | null | undefined): string[] {
  return (text ?? '').split(/[\s,;]+/).map(s => s.trim()).filter(Boolean)
}

/** The letter. Words only - the layout is `tokenLinkEmail`'s. */
export function permitEmailCopy({ permitType, job, senderName, companyName, round, message }: {
  permitType: string
  /** The job's address, or its name when it has none. */
  job: string
  senderName: string | null | undefined
  companyName: string | null | undefined
  /** 1 for the application, 2+ for a resubmission. */
  round: number
  message?: string | null
}): { heading: string; lines: string[] } {
  const who = [senderName?.trim(), companyName?.trim() ? `at ${companyName.trim()}` : ''].filter(Boolean).join(' ') || 'Your applicant'
  const what = round > 1 ? 'the revised documents' : 'the application'
  const heading = `${permitType} permit${round > 1 ? ' - revised documents' : ' application'} - ${job}`
  const lines = [
    `${who} has sent ${what} for the ${permitType} permit at ${job}.`,
    ...(message?.trim() ? [message.trim()] : []),
    'Open the link to download the files. You can send comments, a corrections list or the approved permit back on the same page - or reply to this email.',
  ]
  return { heading, lines }
}
