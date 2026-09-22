// ─────────────────────────────────────────────────────────────────────────────
// IS THERE AN ADDRESS, AND IS IT ONE THAT REACHES A PERSON?
//
// Split out of `lib/email.ts` so a SCREEN can ask it. That file is the mail
// sender - SendGrid, the API key, the templates - and importing it into a
// client component to answer "does this sub have an address?" drags the whole
// sender into the browser bundle. These two questions are pure strings.
// `lib/email.ts` re-exports them, so every existing caller is unaffected.
// ─────────────────────────────────────────────────────────────────────────────

/** Cheap sanity check - a bad address is worth catching before an HTTP call. */
export function isEmailAddress(value: string | null | undefined): boolean {
  if (!value) return false
  const v = value.trim()
  return v.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)
}

/**
 * THE ADDRESS THE APP INVENTED FOR SOMEBODY WHO HAS NONE.
 *
 * `companies.contact_email` is NOT NULL, so five different forms wrote
 * `noemail+<timestamp>@placeholder.com` rather than leave it out. It is a
 * well-formed address that reaches nobody, which is the worst of both: it
 * passes `isEmailAddress`, so every screen that asks "can we write to them?"
 * answered yes.
 *
 * REPORTED, and it is the kind that leaves a false record rather than an
 * error: a sub with no address was listed on both review screens as an
 * emailable recipient, with the invented address shown and NO "no address on
 * file" warning. Pressing Notify would have logged them as TOLD while the
 * letter went to a dead domain - so the sub never hears their gate opened,
 * and the job history says they were informed. A line with no sub AT ALL was
 * correctly flagged; only the no-address case was silent.
 *
 * The guard already existed on exactly ONE door - the quote-award route wrote
 * `isEmailAddress(to) && !to.startsWith('noemail+')` inline - which is this
 * repo's most expensive recurring shape: a rule that exists on one door and
 * not the others. This is that rule, with one home.
 */
const PLACEHOLDER_LOCAL = 'noemail+'
const PLACEHOLDER_DOMAIN = '@placeholder.com'

export function isPlaceholderEmail(value: string | null | undefined): boolean {
  const v = (value ?? '').trim().toLowerCase()
  if (!v) return false
  return v.startsWith(PLACEHOLDER_LOCAL) || v.endsWith(PLACEHOLDER_DOMAIN)
}

/**
 * The address to write to, or NULL because there is not one.
 *
 * Every caller deciding whether somebody can be CONTACTED asks this, never
 * `isEmailAddress` - that answers a different question (is this string
 * shaped like an address), and a placeholder passes it.
 */
export function reachableEmail(value: string | null | undefined): string | null {
  const v = (value ?? '').trim()
  if (!isEmailAddress(v)) return null
  if (isPlaceholderEmail(v)) return null
  return v
}
