// What makes an invite un-sendable, asked in ONE place.
//
// The form asks it before sending and the route asks it before inserting, with
// the same function, for the reason `quickAddProblem` exists: a server's answer
// can only ever arrive as a message about a whole request that did not happen,
// and by then the person has lost what they typed. The route still has to ask,
// because the form is not the only thing that can post.
//
// It returns the SENTENCE, not a boolean - naming the field is the whole point,
// and a caller that only gets `false` has to invent its own wording, which is
// how two screens end up disagreeing about the same rule.
//
// Deliberately loose on the email: anything with a name, an @ and a dot after
// it. A stricter pattern refuses real addresses (plus-tags, long TLDs, an
// apostrophe in a surname) and the cost of letting a typo through is a bounce
// the admin can see, while the cost of refusing a real one is an invite that
// cannot be sent at all.

export interface InvitePerson {
  firstName: string
  lastName: string
  email: string
}

/** The reason this invite cannot be sent, or null when it can. */
export function invitePersonProblem(p: InvitePerson): string | null {
  const first = p.firstName.trim()
  const last = p.lastName.trim()
  const email = p.email.trim()

  if (!first) return 'A first name is needed - it is what the email opens with.'
  if (!last) return 'A last name is needed.'
  if (!email) return 'An email address is needed - it is where the invite goes.'

  // No spaces, one @, and a dot somewhere after it.
  if (/\s/.test(email)) return 'That email address has a space in it.'
  const at = email.indexOf('@')
  if (at < 1 || at !== email.lastIndexOf('@')) return 'That does not look like an email address.'
  const domain = email.slice(at + 1)
  if (domain.indexOf('.') < 1 || domain.endsWith('.')) return 'That email address has no domain on it.'

  return null
}

/** The one place a first and a last name become the single `name` we store. */
export function inviteFullName(p: Pick<InvitePerson, 'firstName' | 'lastName'>): string {
  return `${p.firstName.trim()} ${p.lastName.trim()}`.trim()
}
