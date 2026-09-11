// ─────────────────────────────────────────────────────────────────────────────
// What a Quick add is missing, and whether that is a phone number.
//
// THE BUG. There is a row in `companies` right now that reads:
//
//     name: "John"   type: "inspector"   phone: "Dohr"
//
// ...with the `noemail+<timestamp>@placeholder.com` signature the Quick add
// form stamps on everything it creates. Somebody's surname went into the phone
// box, and the form saved it without a word - it validated nothing, and its
// Save button was `disabled` until a name was typed, so it had never told
// anybody what it wanted in the first place.
//
// It does not stay in the database as an untidy row, either. The inspections
// card offers every inspector's number as a tap-to-call link, so that record
// became `<a href="tel:Dohr">` on every inspection on the job - a control that
// looks like a phone number and dials nothing.
//
// Pure and shared, so the form and the route ask the same question: a form is
// not where invalid records are prevented.
// ─────────────────────────────────────────────────────────────────────────────

const hasDigit = (s: string) => /[0-9]/.test(s)

/**
 * A PHONE NUMBER HAS A DIGIT IN IT. That is the whole test, deliberately.
 *
 * Anything stricter refuses real numbers: this app already holds
 * `(201) 555-0143`, `386-756-1105`, `314.434.1200` and `+1 201 555 0143`, and a
 * jurisdiction's line is as often "321-638-0808 x2231" as not. The failure to
 * catch was a WORD, and a word has no digits in it.
 */
export function quickAddProblem(name: unknown, phone: unknown): string | null {
  if (!name || !String(name).trim()) {
    return 'Give them a name - that is what everything else hangs off.'
  }
  const p = typeof phone === 'string' ? phone.trim() : ''
  if (p && !hasDigit(p)) {
    return `"${p}" does not look like a phone number. If it is part of their name, put it in the name box.`
  }
  return null
}

/** True when the typed name is already one of the options in front of you. */
export function alreadyListed(query: unknown, names: readonly (string | null | undefined)[]): boolean {
  const q = String(query ?? '').trim().toLowerCase()
  if (!q) return false
  return names.some(n => String(n ?? '').trim().toLowerCase() === q)
}
