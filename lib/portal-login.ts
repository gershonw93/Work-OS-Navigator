// A free login for a job's client, proved by their inbox.
//
// "approvals must come with a free login". The portal link is a bearer token a
// GC may text or forward, so it cannot be what agrees to spend money. Approving
// a change order needs a session for the address on the job's customer record,
// started by a six-digit code sent to that address - the only proof that the
// person pressing Approve reads that inbox. No password: the code is the login,
// and the session it starts stays in the browser for next time.
//
// PURE - the numbers and the comparisons. Hashing needs a server secret and
// lives in lib/portal-login-server.ts.

/** A code lives this long. Long enough to switch to the mail app and back. */
export const CODE_TTL_MINUTES = 10
/** Wrong guesses before a code is dead. A million codes, five guesses. */
export const MAX_ATTEMPTS = 5
/** Codes one address can be sent in an hour - a forwarded link must not become a way to flood an inbox. */
export const CODES_PER_HOUR = 5

/** Case and spacing never decide whether two addresses are the same person. */
export function sameEmail(a: string | null | undefined, b: string | null | undefined): boolean {
  const f = (s: string | null | undefined) => (s ?? '').trim().toLowerCase()
  return !!f(a) && f(a) === f(b)
}

/** "sam@example.com" -> "s**@example.com": enough to recognise, not enough to harvest. */
export function maskEmail(email: string): string {
  const [user, domain] = email.trim().split('@')
  if (!domain) return '***'
  return `${user.slice(0, 1)}${'*'.repeat(Math.max(2, Math.min(user.length - 1, 6)))}@${domain}`
}

/** Six digits, as typed. Spaces and dashes a person adds are forgiven. */
export function normalizeCode(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const digits = input.replace(/[\s-]/g, '')
  return /^\d{6}$/.test(digits) ? digits : null
}

export interface StoredCode { expires_at: string; attempts: number; used_at: string | null }

/** Why this stored code cannot be tried, or null. */
export function codeProblem(row: StoredCode | null, now: Date): string | null {
  if (!row) return 'Ask for a code first.'
  if (row.used_at) return 'That code has been used. Ask for a new one.'
  if (new Date(row.expires_at).getTime() <= now.getTime()) return 'That code has expired. Ask for a new one.'
  if (row.attempts >= MAX_ATTEMPTS) return 'Too many wrong tries. Ask for a new code.'
  return null
}

export function codeRateProblem(sentInLastHour: number): string | null {
  return sentInLastHour >= CODES_PER_HOUR ? 'We have sent several codes already - check your inbox (and spam), or try again in an hour.' : null
}
