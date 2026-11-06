// ─────────────────────────────────────────────────────────────────────────────
// How a township takes permit applications - a setting on its Directory card.
//
// "for permit contacts it should have a setting on how to apply - in person or
// in email and it will reflect here so u cant email them only with a warning."
// Many townships still take an application only at the counter or on their own
// website; emailing one of those is a wasted week. So the card says how, and
// Email it SAYS so before it sends - it still sends, because a clerk who has
// told you "just email it" is a fact the card cannot know.
//
// Stored in `companies.extra` beside the jurisdiction and the inspection types
// (an inspector-type card's extra fields), MERGED on edit like those.
// Pure: read by the Directory, the edit route and the Email it route.
// ─────────────────────────────────────────────────────────────────────────────

export type ApplyMethod = 'email' | 'in_person' | 'portal'

export const APPLY_METHODS: { value: ApplyMethod; label: string }[] = [
  { value: 'email', label: 'By email' },
  { value: 'in_person', label: 'In person' },
  { value: 'portal', label: 'On their website' },
]

export function cleanApplyMethod(v: unknown): ApplyMethod | null {
  return v === 'email' || v === 'in_person' || v === 'portal' ? v : null
}

/** Only an http(s) link - anything else would be a link that goes nowhere, or somewhere worse. */
export function cleanApplyUrl(v: unknown): string | null {
  const s = typeof v === 'string' ? v.trim() : ''
  if (!s) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`
  try {
    const u = new URL(withScheme)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch { return null }
}

export interface ApplyHow { method: ApplyMethod; url: string | null }

/** What a card's extra says about applying, or null when nobody has said. */
export function applyHowOf(extra: unknown): ApplyHow | null {
  const e = (extra && typeof extra === 'object' ? extra : {}) as Record<string, unknown>
  const method = cleanApplyMethod(e.apply_method)
  if (!method) return null
  return { method, url: method === 'portal' ? cleanApplyUrl(e.apply_url) : null }
}

/** The line the Directory card prints. */
export function applyLabel(how: ApplyHow | null): string | null {
  if (!how) return null
  return APPLY_METHODS.find(m => m.value === how.method)!.label
}

/**
 * What Email it says before sending to a township that does not take email.
 * Null when they do, or when nobody has said - an unset card warns nobody.
 */
export function emailWarning(how: ApplyHow | null, name: string): string | null {
  if (!how || how.method === 'email') return null
  const who = name.trim() || 'This township'
  // Short and blunt - the long, polite version was read past.
  return how.method === 'in_person'
    ? `${who} does NOT accept applications by email - only in person.`
    : `${who} does NOT accept applications by email - only on their website.`
}
