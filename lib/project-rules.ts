// ─────────────────────────────────────────────────────────────────────────────
// What a new project must have before it can be created.
//
// THE BUG THIS REPLACES. Every required field on the project form was marked
// with the HTML `required` attribute and nothing else. A blank Start Date got
// a browser tooltip and the field's ACCENT ring - which in this theme is lime
// green. A field that had just refused the submit looked exactly like a field
// that had passed.
//
// The tell was Owner / Client: the ONE field with no `required` attribute. It
// was checked in JavaScript, so it had somewhere to put a message, and it
// showed a proper red one. The unvalidated field gave a better error than the
// validated ones - which is the whole argument for not leaving this to the
// browser.
//
// Pure, so the rules can be tested without mounting a form.
// ─────────────────────────────────────────────────────────────────────────────

export interface ProjectDraft {
  name?: string
  address?: string
  client?: string
  startDate?: string
  endDate?: string
  /** 'cost_plus' | 'fixed_price' | 'spec', or null if not answered yet. */
  contractType?: string | null
}

/**
 * A spec build has no client, and the form says so in as many words.
 *
 * THE BUG: picking "Building to sell" showed the card 'No client - you are
 * building it to sell.' and then Create Project refused with 'Pick or enter a
 * client.' The form contradicted itself in two places a thumb apart, and the
 * only way out was to name a client for a job that by definition has none -
 * which then puts a fictional owner on the job, the proposal and the portal.
 *
 * The rule was written before spec builds existed and nobody went back.
 */
export function needsClient(contractType?: string | null): boolean {
  return contractType !== 'spec'
}

/**
 * Field name -> message. Empty object means it is good to send.
 *
 * Keyed by the field's DOM id so a caller can focus the first thing that is
 * wrong; on a form this long the message is otherwise off screen.
 */
export function projectFormErrors(d: ProjectDraft): Record<string, string> {
  const errs: Record<string, string> = {}
  const has = (v?: string) => !!(v ?? '').trim()

  if (!has(d.name)) errs.name = 'Give the project a name.'
  if (!has(d.address)) errs.address = 'Enter the job address.'
  // Not asked of a spec build - see needsClient above.
  if (needsClient(d.contractType) && !has(d.client)) {
    errs.client = 'Pick a client, or add a new one.'
  }
  if (!has(d.startDate)) errs.startDate = 'Enter a start date.'

  // An end date is optional, but one that precedes the start is a typo every
  // time. Compared as YYYY-MM-DD strings, which sort correctly as text and
  // avoid parsing a calendar date into an instant - the mistake lib/dates.ts
  // exists to prevent.
  if (has(d.startDate) && has(d.endDate) && (d.endDate ?? '') < (d.startDate ?? '')) {
    errs.endDate = 'The end date is before the start date.'
  }

  return errs
}
