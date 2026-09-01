// ─────────────────────────────────────────────────────────────────────────────
// The rules for what a field may contain, in one place.
//
// THE BUG THAT MADE THIS NECESSARY. Asking a client for -$500 created a $500
// outstanding request. The route sanitised the input first:
//
//     amount = Number(String(body.amount).replace(/[^0-9.]/g, ''))
//     if (amount <= 0) return error
//
// The guard is correct. It never fired, because the sanitiser had already
// eaten the minus sign - so by the time anything checked, the negative was a
// positive. **Cleaning input before checking it destroys the evidence the
// check needed.** Eight places shared that regex.
//
// A reviewer put the diagnosis better than the bug report did: "sub bills
// correctly block negatives, so the guard exists in one place and not the
// others." The rules were never missing. They were scattered, and nothing made
// them apply.
//
// Pure and total: every function takes whatever a form or a JSON body actually
// hands over - a string, a number, null, undefined - and answers with a value
// AND a reason. Pure because these are the rules that decide whether money is
// right, and rules that need a browser to test are rules nobody tests.
// ─────────────────────────────────────────────────────────────────────────────

export interface Checked<T> {
  ok: boolean
  /** The cleaned value. Only meaningful when ok. */
  value: T
  /** Why not, in words a user can act on. Absent when ok. */
  error?: string
}

const fail = <T>(value: T, error: string): Checked<T> => ({ ok: false, value, error })
const pass = <T>(value: T): Checked<T> => ({ ok: true, value })

/**
 * A money amount typed by a person.
 *
 * KEEPS THE SIGN, then judges it. That is the whole fix: `$1,200.50`, `1200.5`
 * and `-500` all have to survive cleaning intact, so that the rule below is
 * deciding about what was actually typed rather than about a laundered copy.
 *
 * Accounting parentheses count as negative - `(500)` is how a bookkeeper writes
 * -500, and reading it as 500 would be the same class of mistake all over.
 */
export function money(
  raw: unknown,
  opts: { allowZero?: boolean; allowNegative?: boolean; label?: string } = {},
): Checked<number> {
  const label = opts.label ?? 'amount'
  const text = String(raw ?? '').trim()
  if (!text) return fail(0, `Enter ${label === 'amount' ? 'an amount' : `a ${label}`}.`)

  // (500) means -500 to anybody who has done a set of books.
  const parenthesised = /^\(.*\)$/.test(text)
  const body = parenthesised ? text.slice(1, -1) : text

  // Remove only the decorations a person legitimately types around a figure -
  // a currency symbol, thousands separators, whitespace. The minus and the
  // decimal point survive, which is the point of this function existing.
  const cleaned = body.replace(/[$£€\s,]/g, '')

  // Then require what is left to BE a number, rather than deleting whatever is
  // not one. Stripping every non-digit turns "undefined-500" into "-500", so
  // the field reported a NEGATIVE amount for a value that was never a number -
  // sending somebody to fix a minus sign they never typed. That is this file's
  // own mistake in miniature: cleaning input destroys the evidence the check
  // needed. Judge the whole string or reject it.
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(cleaned)) {
    return fail(0, `That is not a number. Enter ${label === 'amount' ? 'an amount' : `a ${label}`} like 1200 or 1,200.50.`)
  }

  const n = Number(cleaned)
  if (!Number.isFinite(n)) return fail(0, `That is not a number.`)

  const signed = parenthesised ? -Math.abs(n) : n

  if (signed < 0 && !opts.allowNegative) {
    // Names the ACTUAL problem. The sub-bill form said "Enter an amount or
    // percent" for a negative, which sends somebody hunting in the wrong field.
    return fail(signed, `That is a negative ${label}. Enter a positive number.`)
  }
  if (signed === 0 && !opts.allowZero) {
    return fail(0, `Enter ${label === 'amount' ? 'an amount' : `a ${label}`} greater than zero.`)
  }
  // Fractions of a cent are always a typo or a floating-point artefact.
  return pass(Math.round(signed * 100) / 100)
}

/**
 * A percentage. Same reasoning as money, different bounds.
 *
 * Over 100 is allowed by default: a change order CAN be 150% of a line, and
 * refusing it would be the app inventing a rule the trade does not have.
 */
export function percent(
  raw: unknown,
  opts: { allowZero?: boolean; max?: number } = {},
): Checked<number> {
  const m = money(raw, { allowZero: opts.allowZero, label: 'percentage' })
  if (!m.ok) return m
  if (opts.max != null && m.value > opts.max) {
    return fail(m.value, `That is over ${opts.max}%.`)
  }
  return m
}

/**
 * An email address.
 *
 * Deliberately not RFC-complete - a regex that accepts every legal address
 * rejects nothing anybody mistypes. This catches the mistakes people actually
 * make: no @, nothing before or after it, no dot in the domain, a stray space.
 */
export function email(raw: unknown, opts: { required?: boolean } = {}): Checked<string> {
  const text = String(raw ?? '').trim()
  if (!text) return opts.required ? fail('', 'Enter an email address.') : pass('')
  if (/\s/.test(text)) return fail(text, 'An email address cannot contain spaces.')
  if (!text.includes('@')) return fail(text, 'That is missing the @.')
  const [local, domain, ...rest] = text.split('@')
  if (rest.length) return fail(text, 'That has more than one @.')
  if (!local) return fail(text, 'That is missing the part before the @.')
  if (!domain || !domain.includes('.')) return fail(text, 'That domain does not look right - it needs a dot, like .com.')
  if (/^\.|\.$|\.\./.test(domain)) return fail(text, 'That domain does not look right.')
  return pass(text.toLowerCase())
}

/**
 * A US phone number, normalised to (xxx) xxx-xxxx.
 *
 * Stored formatted rather than raw, because every screen that shows one
 * otherwise formats it its own way - the same drift this whole file is about.
 * Anything that is not plausibly a US number is returned untouched rather than
 * mangled: an international number is not an error, it is just not ours to
 * reformat.
 */
export function phone(raw: unknown, opts: { required?: boolean } = {}): Checked<string> {
  const text = String(raw ?? '').trim()
  if (!text) return opts.required ? fail('', 'Enter a phone number.') : pass('')

  const digits = text.replace(/\D/g, '')
  if (digits.length < 7) return fail(text, 'That is too short for a phone number.')
  // +country code, or anything longer than a US number - leave it alone.
  if (text.startsWith('+') || digits.length > 11) return pass(text)
  const ten = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits
  if (ten.length !== 10) return fail(text, 'A US number needs 10 digits.')
  return pass(`(${ten.slice(0, 3)}) ${ten.slice(3, 6)}-${ten.slice(6)}`)
}

const STATES: Record<string, string> = {
  alabama: 'AL', alaska: 'AK', arizona: 'AZ', arkansas: 'AR', california: 'CA',
  colorado: 'CO', connecticut: 'CT', delaware: 'DE', florida: 'FL', georgia: 'GA',
  hawaii: 'HI', idaho: 'ID', illinois: 'IL', indiana: 'IN', iowa: 'IA',
  kansas: 'KS', kentucky: 'KY', louisiana: 'LA', maine: 'ME', maryland: 'MD',
  massachusetts: 'MA', michigan: 'MI', minnesota: 'MN', mississippi: 'MS',
  missouri: 'MO', montana: 'MT', nebraska: 'NE', nevada: 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', ohio: 'OH', oklahoma: 'OK',
  oregon: 'OR', pennsylvania: 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', tennessee: 'TN', texas: 'TX', utah: 'UT', vermont: 'VT',
  virginia: 'VA', washington: 'WA', 'west virginia': 'WV', wisconsin: 'WI',
  wyoming: 'WY', 'district of columbia': 'DC', 'washington dc': 'DC',
  'puerto rico': 'PR',
}
const CODES = new Set(Object.values(STATES))

/**
 * A US state, as a two-letter code.
 *
 * THE BUG: the field was `maxLength={2}`, so typing "New York" left "Ne",
 * upper-cased to "NE" - which is **Nebraska**. Not blank, not an error: a
 * different real state, silently. Truncation that produces a valid-looking
 * wrong answer is the worst possible failure, because nothing downstream can
 * tell it went wrong.
 *
 * A full name is normalised. Something unrecognised is REFUSED rather than cut
 * down to its first two characters.
 */
export function usState(raw: unknown, opts: { required?: boolean } = {}): Checked<string> {
  const text = String(raw ?? '').trim()
  if (!text) return opts.required ? fail('', 'Enter a state.') : pass('')

  const full = STATES[text.toLowerCase().replace(/\s+/g, ' ').replace(/\./g, '')]
  if (full) return pass(full)

  const code = text.toUpperCase()
  if (code.length === 2 && CODES.has(code)) return pass(code)

  return fail(text, `"${text}" is not a state we recognise. Use the two-letter code, like NY.`)
}

/** Every state, for a picker. Sorted by name, which is how people look. */
export const US_STATES: { code: string; name: string }[] = Object.entries(STATES)
  .filter(([name]) => name !== 'washington dc')
  .map(([name, code]) => ({ code, name: name.replace(/\b\w/g, c => c.toUpperCase()) }))
  .sort((a, b) => a.name.localeCompare(b.name))

/**
 * A number as the text a form field shows.
 *
 * THE BUG THIS PREVENTS. `String(x)` on a missing number does not produce an
 * empty box - it produces the literal word in it:
 *
 *     String(undefined)  // "undefined"
 *     String(null)       // "null"
 *     String(NaN)        // "NaN"
 *
 * A money field prefilled that way shows a word where a figure belongs, and
 * because it is a real string the field is happily editable - so somebody
 * types their number onto the end of it and submits "undefined-500". The
 * server then rejects the whole thing over a value the user never typed.
 *
 * Empty is the honest answer for a number that is not there.
 */
export function toAmountInput(n: unknown): string {
  if (n == null || n === '') return ''
  const v = Number(n)
  return Number.isFinite(v) ? String(v) : ''
}

/**
 * Collect field errors into one object, for a form to render inline.
 *
 * Returns null when everything passed, so a caller reads as
 * `const errors = collect({...}); if (errors) return`.
 */
export function collect(fields: Record<string, Checked<unknown>>): Record<string, string> | null {
  const errors: Record<string, string> = {}
  for (const [name, result] of Object.entries(fields)) {
    if (!result.ok && result.error) errors[name] = result.error
  }
  return Object.keys(errors).length ? errors : null
}
