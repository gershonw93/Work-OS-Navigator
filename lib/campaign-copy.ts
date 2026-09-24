import { claimProblem, tagsIn, applyTags, paragraphs, type MergeValues } from './email-copy'
import { TRIAL_DAYS } from './plans'
import { segmentByKey, parseAddressList } from './campaign-audience'

// ─────────────────────────────────────────────────────────────────────────────
// What a campaign may say, and to whom.
//
// ASKED BY THE FORM AND BY THE ROUTE, from here. A console is a hole straight
// through the test suite unless the route re-states the rules the pins enforce
// over source files - `claimProblem` is the one that earns its place, because
// the trial-length pin reads .ts and .tsx and cannot see a sentence typed into
// a browser.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The tags a campaign can fill.
 *
 * Deliberately three. The trial tags that the sequenced emails use -
 * {{trial_end}}, {{days_left}} - are facts about ONE person's trial, and a
 * campaign goes to a list: the sender has no way to know they are all on the
 * same day. A tag offered where nothing fills it is how {{days_left}} reaches
 * an inbox looking exactly like that.
 */
export const CAMPAIGN_TAGS = ['first_name', 'company', 'trial_days']

export interface CampaignFields {
  name: string
  subject: string
  body: string
  segment: string
  /** For the 'one address' and 'pasted list' segments. */
  customEmails?: string | null
}

/** Why this campaign cannot be saved or sent, or null if it can. */
export function campaignProblem(f: CampaignFields): string | null {
  const name = (f.name ?? '').trim()
  const subject = (f.subject ?? '').trim()
  const body = (f.body ?? '').trim()

  if (!name) return 'Give it a name, so you can tell it apart from the next one.'
  if (!subject) return 'The subject cannot be empty - it is the only thing some people read.'
  if (subject.length > 120) return 'Keep the subject under 120 characters, or inboxes will cut it off.'
  if (!body) return 'The body cannot be empty.'

  const segment = segmentByKey(f.segment ?? '')
  if (!segment) return 'Pick who this goes to.'

  // AN ADDRESS SEGMENT WITH NO ADDRESSES IS A SEND TO NOBODY, and a campaign
  // that reports "sent" having reached nobody is the same claim as a button
  // that says it did something it did not.
  if (segment.custom) {
    const addresses = parseAddressList(f.customEmails ?? '')
    if (!addresses.length) return 'Put in at least one email address.'
    if (segment.key === 'one-address' && addresses.length > 1) {
      return 'This one is for a single address. Use "A list I paste in" for more than one.'
    }
  }

  const allowed = new Set(CAMPAIGN_TAGS)
  const unknown = Array.from(new Set(tagsIn(`${subject}\n${body}`))).filter(t => !allowed.has(t))
  if (unknown.length) {
    return `Nothing fills in ${unknown.map(t => `{{${t}}}`).join(', ')} here, so it would reach them exactly like that. `
      + `A campaign can use ${CAMPAIGN_TAGS.map(t => `{{${t}}}`).join(', ')}.`
  }

  return claimProblem(`${subject} ${body}`)
}

/** Fill a campaign's tags in for one recipient. */
export function fillCampaign(
  fields: { subject: string; body: string },
  person: { firstName?: string | null; companyName?: string | null },
): { subject: string; paragraphs: string[] } {
  // A MISSING NAME GETS A WORD, NOT A VISIBLE TAG. The general rule is that an
  // unfilled tag stays visible - a bug we can see beats a blank a customer
  // reads as one - but "Hi there" is a sentence an English speaker writes on
  // purpose, and `firstName()` in lib/email.ts has always done exactly this for
  // the greeting. A company with no name is different: there is no neutral word
  // for it, so that one stays visible and we go and fix the row.
  const values: MergeValues = {
    first_name: (person.firstName ?? '').trim().split(/\s+/)[0] || 'there',
    company: (person.companyName ?? '').trim() || undefined,
    trial_days: String(TRIAL_DAYS),
  }
  return {
    subject: applyTags(fields.subject, values),
    paragraphs: paragraphs(applyTags(fields.body, values)),
  }
}
