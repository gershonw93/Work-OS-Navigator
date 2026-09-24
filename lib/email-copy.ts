import { NUDGES } from './onboarding-nudges'
import { trialCopy, TRIAL_WARNING_DAYS_LEFT } from './trial-warning'
import { TRIAL_DAYS } from './plans'

// ─────────────────────────────────────────────────────────────────────────────
// The words, editable without a deploy - and WITHOUT becoming a second home.
//
// THE RULE THIS HAD TO NOT BREAK. "One fact, ONE home" is the oldest rule in
// this repo, and a table of email copy is exactly the shape it warns about: two
// places that both exist, both compile, and only one of which is what actually
// sends. So the database is never a SOURCE here - it is an OVERRIDE. Every
// slug has a default written in code, that default is what ships, and a stored
// row replaces it only while somebody has deliberately put one there. The
// console shows which is which and can put a slug back.
//
// THE RULES STAY IN CODE. `lib/onboarding-nudges.ts` decides WHEN a nudge goes
// and WHETHER it goes at all - the milestone conditions, the active-recently
// silence, the handover to the trial warnings. None of that is editable here,
// and that is the point: a console that can edit conditions is a console that
// can send "create your first job" to somebody with three of them, which is
// the failure the whole sequence was designed around. Copy is editable.
// Behaviour is not.
//
// MERGE TAGS ARE A CLOSED SET, CHECKED AT THE WRITE. A stored sentence cannot
// interpolate anything the sender does not supply, so an unknown tag is
// refused when it is saved rather than printed to a customer - "a value that is
// present and WRONG is worse than one that is missing", and `{{frist_name}}`
// reaching an inbox is the wrong kind of present.
// ─────────────────────────────────────────────────────────────────────────────

/** Every tag a stored sentence may use, with what it means. */
export const MERGE_TAGS = [
  { tag: '{{first_name}}', label: 'First name', sample: 'Dana' },
  { tag: '{{company}}', label: 'Their company', sample: 'Whitfield Builders' },
  { tag: '{{trial_days}}', label: 'Trial length', sample: String(TRIAL_DAYS) },
  { tag: '{{trial_end}}', label: 'Trial end date', sample: 'Fri Oct 9' },
  { tag: '{{days_left}}', label: 'Days left in the trial', sample: '3' },
] as const

export type MergeValues = Partial<Record<string, string>>

const TAG_RE = /\{\{\s*([a-z_]+)\s*\}\}/g

/** The tags in a piece of text, whether we know them or not. */
export function tagsIn(text: string): string[] {
  return Array.from(text.matchAll(TAG_RE)).map(m => m[1])
}

/**
 * Fill the tags in.
 *
 * A tag we were given no value for is left ALONE rather than blanked: an empty
 * space where a name should be reads as a bug to the person holding it, and a
 * visible `{{first_name}}` reads as a bug to us - which is the one we want,
 * because we are the ones who can fix it. Unknown tags cannot get this far
 * anyway; `copyProblem` refuses them at the door.
 */
export function applyTags(text: string, values: MergeValues): string {
  return text.replace(TAG_RE, (whole, name: string) => values[name] ?? whole)
}

export interface CopyFields {
  /** The email subject, and for a notification the bell headline too. */
  subject: string
  /** The body. Blank lines separate paragraphs. */
  body: string
  /** The button. Null where the template does not have one. */
  cta?: string | null
}

export interface CopySlug {
  slug: string
  label: string
  group: 'Welcome' | 'First 15 days' | 'Trial ending'
  /** When the product actually sends it - shown beside the editor. */
  when: string
  /** Whether this one has a button whose label can be edited. */
  hasCta: boolean
  /** Which tags make sense here. A tag offered where nothing fills it is a trap. */
  tags: string[]
  fallback: CopyFields
}

const NUDGE_TAGS = ['first_name', 'company']
const TRIAL_TAGS = ['first_name', 'company', 'trial_days', 'trial_end', 'days_left']

/**
 * Every editable slug, with its code default.
 *
 * DERIVED from the modules that own the behaviour, never retyped - so a nudge
 * added to `NUDGES` appears here with its own copy already in place, and the
 * two cannot drift into disagreeing about how many there are.
 */
export const COPY_SLUGS: CopySlug[] = [
  {
    slug: 'welcome',
    label: 'Welcome',
    group: 'Welcome',
    when: 'The moment somebody finishes creating their account.',
    hasCta: true,
    tags: ['first_name', 'company', 'trial_days', 'trial_end'],
    fallback: {
      subject: `Welcome to SyteNav - your first {{trial_days}} days are free`,
      body: [
        `Hi {{first_name}}, your account is ready. Your first {{trial_days}} days are free - the whole product, no card taken and nothing to cancel - and that runs to {{trial_end}}.`,
        'Put in a job you are actually running rather than a test one. Everything in SyteNav hangs off a job: the budget, the subs you award, the bills they send you and what you invoice the client. The first real one is what makes the rest of it mean anything.',
        'If you get stuck, reply to this email. It comes to me.',
      ].join('\n\n'),
      cta: 'Create your first job',
    },
  },
  ...NUDGES.map((n): CopySlug => ({
    slug: `nudge:${n.key}`,
    label: n.title,
    group: 'First 15 days',
    when: `Day ${n.day}, and only if they have not done it yet.`,
    hasCta: false,
    tags: NUDGE_TAGS,
    fallback: { subject: n.title, body: n.message, cta: null },
  })),
  ...TRIAL_WARNING_DAYS_LEFT.map((left): CopySlug => {
    const c = trialCopy(left)
    return {
      slug: `trial:${left}`,
      label: c.title,
      group: 'Trial ending',
      when: left === 0 ? 'The last day of the trial.'
        : left === 1 ? 'The day before it ends.'
        : `${left} days before it ends.`,
      hasCta: false,
      tags: TRIAL_TAGS,
      fallback: { subject: c.title, body: c.message, cta: null },
    }
  }),
]

export const copySlug = (slug: string): CopySlug | null =>
  COPY_SLUGS.find(s => s.slug === slug) ?? null

/**
 * Why this copy cannot be saved, or null if it can.
 *
 * ASKED BY THE ROUTE AND BY THE FORM, from here, so a refusal lands on the
 * field rather than arriving as a failed request.
 *
 * THE TRIAL LENGTH CHECK IS THE ONE THAT EARNS ITS PLACE. `lib/plans.ts` is the
 * one home for `TRIAL_DAYS`, and the pin that keeps every public page honest
 * about it reads SOURCE FILES - it cannot see a sentence somebody typed into a
 * console. Without this, the console is a hole straight through that rule: a
 * stored "your first 30 days are free" would sail past every suite and land in
 * a customer's inbox.
 */
export function copyProblem(slug: string, fields: CopyFields): string | null {
  const spec = copySlug(slug)
  if (!spec) return 'That is not an email we send.'

  const subject = fields.subject.trim()
  const body = fields.body.trim()
  if (!subject) return 'The subject cannot be empty - it is the only thing some people read.'
  if (subject.length > 120) return 'Keep the subject under 120 characters, or inboxes will cut it off.'
  if (!body) return 'The body cannot be empty.'
  if (spec.hasCta && !(fields.cta ?? '').trim()) return 'The button needs a label.'

  const allowed = new Set(spec.tags)
  const unknown = Array.from(new Set(tagsIn(`${subject}\n${body}\n${fields.cta ?? ''}`)))
    .filter(t => !allowed.has(t))
  if (unknown.length) {
    return `Nothing fills in ${unknown.map(t => `{{${t}}}`).join(', ')} here, so it would reach them exactly like that. `
      + `This one can use ${spec.tags.map(t => `{{${t}}}`).join(', ')}.`
  }

  return claimProblem(`${subject} ${body}`, { countsDown: spec.tags.includes('days_left') })
}

/**
 * A claim in stored copy that the product cannot honour, or null.
 *
 * SHARED BY EVERY SENTENCE SOMEBODY CAN TYPE INTO A CONSOLE - the nine
 * transactional emails and a campaign body alike. `plans-and-landing.ts` keeps
 * every public page honest about `TRIAL_DAYS` by scanning SOURCE FILES, and it
 * cannot see a sentence typed into a browser; each new console is a fresh hole
 * through that pin unless it asks this. A campaign saying "your first 30 days
 * are free" is the same lie as a pricing page saying it, sent to more people.
 *
 * A number of days that is not OUR number of days, written as a digit or not at
 * all: a word cannot be interpolated, so a word is always wrong here.
 */
export function claimProblem(text: string, opts: { countsDown?: boolean } = {}): string | null {
  // `countsDown` is for copy that legitimately names a shrinking number - the
  // trial warnings say "3 days left", and that is the whole point of them.
  if (opts.countsDown) return null
  const wrongDays = Array.from(text.matchAll(/\b(\d+)[- ]days?\b/g))
    .map(m => Number(m[1]))
    .filter(n => n !== TRIAL_DAYS)
  if (wrongDays.length) {
    return `This says ${wrongDays[0]} days, and the trial is ${TRIAL_DAYS}. Use {{trial_days}} so it stays right if we ever change it.`
  }
  return null
}

/** The body as paragraphs, which is how every template wants it. */
export const paragraphs = (body: string): string[] =>
  body.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean)

/** Fill a slug's copy with the sample values, for the preview. */
export function withSamples(fields: CopyFields): CopyFields {
  const values: MergeValues = {}
  for (const t of MERGE_TAGS) values[t.tag.replace(/[{}\s]/g, '')] = t.sample
  return {
    subject: applyTags(fields.subject, values),
    body: applyTags(fields.body, values),
    cta: fields.cta ? applyTags(fields.cta, values) : fields.cta,
  }
}
