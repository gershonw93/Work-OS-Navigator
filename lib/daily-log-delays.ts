import { dateWords } from './dates'
import { weatherOption } from './weather'

/**
 * WHAT HELD THE JOB UP TODAY, AS A RECORD RATHER THAN A SENTENCE.
 *
 * The daily log has always been able to say the day went badly - in `notes`,
 * or through the `scheduled_delays` / `weather_delays` survey questions. What
 * it could not do is say WHAT was held up in a shape anything else could read.
 *
 * THE LIST AND THE FORM AND THE ROUTE WERE THREE-QUARTERS BUILT AND ABANDONED.
 * `DELAY_TYPES` sat in the page, unused. `addDelay()` was defined and never
 * called. The `delays` column existed in production with no migration and
 * three hand-typed rows in it - one of them a `Material Delivery` - written by
 * a form that no longer exists. This is that feature finished, and the list
 * lives in `lib/` this time because the page is not the only thing that needs
 * it: the route validates against it, and `SURVEY_QUESTIONS` next door is
 * already duplicated in the page and the PDF route with DIFFERENT labels, plus
 * a third wrong spelling in the seed. That is what a hardcoded list in a page
 * becomes.
 */

export const DELAY_TYPES = [
  'Weather',
  'Material Delivery',
  'Equipment',
  'Labor Shortage',
  'Inspection',
  'Design Change',
  'Other',
] as const

export type DelayType = (typeof DELAY_TYPES)[number]

export interface LogDelay {
  type: string
  description: string
  /**
   * THE SCHEDULE LINE THIS HELD UP, when the person filing knew which one.
   *
   * OPTIONAL ON PURPOSE, and never guessed. There is no foreign key between a
   * daily log and a schedule line - they share only a project, and a log has
   * one date against a line's date RANGE. Matching on that would eventually
   * move the wrong trade's dates and email the wrong sub, which is the failure
   * `inspector-link.ts` and `geocode-match.ts` both exist to refuse.
   *
   * The person on site knows which delivery was late. Nobody else does, and no
   * amount of arithmetic recovers it afterwards. So it is asked at log time,
   * and when it is absent the connection is simply not offered.
   */
  schedule_item_id?: string | null
  /**
   * WHAT THAT LINE WAS CALLED WHEN THE LOG WAS FILED.
   *
   * Denormalised ON PURPOSE, the same shape as `subs_on_site` in this very
   * column family, which stores `{ company_id, name }` side by side. A jsonb id
   * carries no foreign key and therefore no `ON DELETE` rule, so a schedule
   * line deleted next March leaves this id pointing at nothing - and a log is a
   * RECORD OF A DAY, which must still read correctly long after the plan it
   * referred to has been rewritten.
   *
   * With the label the record survives ("Material Delivery - Delivery - ACME
   * Supply"); the dangling id simply stops the handoff being offered, which is
   * the same outcome as never having picked a line and is already the safe
   * default. That is the trade: referential integrity on a pointer the bridge
   * treats as optional, in exchange for a record a schedule edit cannot damage.
   */
  schedule_item_label?: string | null
}

/** The shortest a description can be and still say more than the type does. */
export const MIN_DELAY_DESCRIPTION = 4

/**
 * What is wrong with this delay row, or null.
 *
 * Asked by the FORM and by the ROUTE - the `quickAddProblem` pattern. Named
 * apart from `missingDelay` in `lib/schedule-delay.ts`, which asks a different
 * question about a different record: that one is "how many days late is this
 * schedule line", this one is "what does this log row say".
 */
export function logDelayProblem(delay: Partial<LogDelay> | null | undefined): string | null {
  const type = String(delay?.type ?? '').trim()
  if (!type) return 'Pick what held things up.'
  if (!isDelayType(type)) return 'That is not one of the delay types.'

  const description = String(delay?.description ?? '').trim()
  if (!description) return 'Say what happened.'
  if (description.length < MIN_DELAY_DESCRIPTION) {
    return 'Say a bit more - the type on its own is what the list already says.'
  }
  return null
}

export function isDelayType(value: unknown): value is DelayType {
  return (DELAY_TYPES as readonly string[]).includes(String(value ?? '').trim())
}

/**
 * Clean the delay rows off a request body.
 *
 * ASKED BY THE ROUTE, because the browser sends this. A row that fails the
 * rule is DROPPED rather than refusing the whole log: the log is somebody's
 * record of a day on a site, often filed from a phone at the end of it, and
 * losing all of it over one half-typed delay row is the wrong trade.
 */
export function cleanDelays(raw: unknown): LogDelay[] {
  if (!Array.isArray(raw)) return []
  const out: LogDelay[] = []
  for (const item of raw) {
    const delay: LogDelay = {
      type: String((item as any)?.type ?? '').trim(),
      description: String((item as any)?.description ?? '').trim(),
      schedule_item_id: String((item as any)?.schedule_item_id ?? '').trim() || null,
      schedule_item_label: String((item as any)?.schedule_item_label ?? '').trim() || null,
    }
    if (logDelayProblem(delay)) continue
    out.push(delay)
  }
  return out
}

/** The rows that name a schedule line, which are the only ones that can move one. */
export function delaysWithALine(delays: LogDelay[] | null | undefined): LogDelay[] {
  return (delays ?? []).filter(d => !!d.schedule_item_id)
}

/**
 * THE REASON, PRE-FILLED FROM THE LOG - AND IT HAS TO BE HONEST.
 *
 * "the reason is pulling from the weather, can it connect the dots here?" -
 * yes, and this is the sentence that does it. It is a DRAFT: it lands in the
 * Delay dialog's reason box, editable, and nothing sends until somebody
 * presses the button.
 *
 * WHAT IT MAY NOT CLAIM. The weather on a log is five chips somebody tapped,
 * or an open-meteo reading an "Auto-fill weather" button fetched at the time -
 * not a forecast of record, not backfillable for a past date, and with no
 * unique constraint on (project_id, log_date) a day can carry several logs
 * with several answers. So the sentence NAMES THE LOG IT CAME FROM rather than
 * stating the weather as a fact about the day, and the reader can see where to
 * go and check.
 *
 * AND AN UNRECOGNISED CONDITION DROPS THE CLAUSE rather than printing itself.
 * `weatherOption` returns null for a value not in the list, deliberately - the
 * same reason `weatherIcon` refuses to fall back to a default sun. A condition
 * nobody chose, quoted back as the reason a crew was stood down, is worse than
 * no clause at all.
 */
export function delayReasonFromLog(
  delay: Pick<LogDelay, 'type' | 'description'>,
  log: { log_date: string; weather?: string | null },
): string {
  const description = String(delay.description ?? '').trim()
  const type = String(delay.type ?? '').trim()

  const head = description || (type ? `${type} delay` : 'Delay')

  // Only for a WEATHER delay. On a delivery held up by a missing driver, the
  // day's weather is a coincidence, and putting it in the reason would invent
  // a cause.
  const condition = type === 'Weather' ? weatherOption(log.weather)?.label : null
  const withWeather = condition ? `${head} (${condition.toLowerCase()})` : head

  // `dateWords`, never `toLocaleDateString` - this string can reach a sub's
  // inbox through the shift email, and a server must not ask its own machine
  // what day it is.
  //
  // `.withWeekday`, and it returns an OBJECT: interpolating `dateWords(...)`
  // straight into the template type-checks perfectly and prints
  // "[object Object]". THE WEEKDAY IS LOAD-BEARING anyway - "Tue Sep 22" is
  // how a day gets checked against a diary, which a bare date is not.
  const when = dateWords(log.log_date)
  return when
    ? `${withWeather}. From the site log of ${when.withWeekday}.`
    : `${withWeather}.`
}

/**
 * WHAT A LOG HAS TO SAY BEFORE IT MAY BE FILED - asked by the FORM and the ROUTE.
 *
 * THE OLDER BUG: opening the form and pressing Save filed a log with a date and
 * nothing else. It landed in the list, in the count and in the client-facing
 * PDF - a page of blank fields under a heading, which asserts that somebody was
 * on site and reported this.
 *
 * THE NEW ONE, AND WHY THIS IS A FUNCTION NOW: the rule was written out twice,
 * once in the page and once in the route, and NEITHER copy counted a delay. A
 * log whose only content is "the lumber never showed up" - which is exactly the
 * log this whole feature exists to collect - was refused by both. Two hand-kept
 * copies of one rule means adding a field to the form silently fails to add it
 * here, twice, and the failure wears a 400 that names the thing the person just
 * typed.
 *
 * The DATE does not count, and neither does the weather - both are filled in
 * for you, so neither is a report.
 */
export function logSaysSomething(log: {
  notes?: string | null
  safety_observation?: string | null
  quality_observation?: string | null
  issue_description?: string | null
  photos?: number
  attachments?: number
  workers?: number
  subs?: number
  delays?: unknown[] | null
  survey?: Record<string, { answer?: string; description?: string } | null | undefined> | null
}): boolean {
  const words = [log.notes, log.safety_observation, log.quality_observation, log.issue_description]
    .some(v => String(v ?? '').trim() !== '')
  if (words) return true

  if ((log.photos ?? 0) > 0 || (log.attachments ?? 0) > 0) return true
  if ((log.workers ?? 0) > 0 || (log.subs ?? 0) > 0) return true
  if ((log.delays ?? []).length > 0) return true

  // `blankSurvey()` starts every question at 'na' with no note, so an untouched
  // survey is not a report.
  return Object.values(log.survey ?? {}).some(
    v => !!v && (v.answer !== 'na' || String(v.description ?? '').trim() !== ''),
  )
}

/** The one sentence both doors give back when nothing was said. */
export const EMPTY_LOG_PROBLEM =
  'An empty log says somebody was on site and reported nothing. Add a note, a photo, who was there, a delay, or an observation.'
