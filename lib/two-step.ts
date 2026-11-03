// TWO-STEP SIGN-IN: one answer to "has this session done the second step?"
//
// Supabase stamps every access token with an assurance level: `aal1` after a
// password, `aal2` after a password AND a code from an authenticator app. A
// person who has turned two-step on is only signed in at `aal2`; everybody
// else is signed in at `aal1`, exactly as before.
//
// THE RULE THAT MAKES IT REAL: this is asked by the SERVER - every API route
// (`lib/verified-user.ts`), middleware, the layouts, and the database itself
// (migration 161's `two_step_ok()`). A code box that only the login SCREEN
// asks for is decoration: the password alone mints a token, and every route
// would answer it.
//
// Pure, and safe in the Edge bundle (middleware imports it): no SDK types, no
// Node APIs.

/** Where somebody who still owes a code is sent. Not `/login/...` - middleware
 * bounces a signed-in visitor off `/login`, and this visitor IS signed in. */
export const TWO_STEP_PATH = '/two-step'

/** What an authenticator app shows. */
export const CODE_LENGTH = 6

interface FactorLike { factor_type?: string; status?: string }
interface UserLike { factors?: FactorLike[] | null }

/**
 * Has this person turned two-step on? Only a VERIFIED authenticator counts:
 * `enroll()` writes an unverified factor the moment the QR code is shown, and
 * somebody who closed the dialog before typing the code has not turned
 * anything on.
 */
export function hasTwoStep(user: UserLike | null | undefined): boolean {
  return !!user?.factors?.some(f => f.status === 'verified' && (f.factor_type ?? 'totp') === 'totp')
}

/**
 * The `aal` claim off an access token, or null when it cannot be read.
 *
 * The token has ALREADY been checked by the auth server (`getUser`) before
 * anything here believes it - this only reads a claim off a token known to be
 * genuine, so decoding without verifying the signature is safe here and
 * nowhere else.
 */
export function tokenAal(token: string | null | undefined): string | null {
  if (!token) return null
  const part = token.split('.')[1]
  if (!part) return null
  try {
    const b64 = part.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    const claims = JSON.parse(atob(padded)) as { aal?: unknown }
    return typeof claims.aal === 'string' ? claims.aal : null
  } catch {
    return null
  }
}

/**
 * Does this session still owe the second step?
 *
 * An UNREADABLE level counts as owing it - for somebody who turned two-step
 * on. The asymmetry is the opposite of `lib/auth-outcome.ts` on purpose: there
 * a wrong "signed out" throws away a working session; here a wrong "done"
 * hands a stolen password the account the person locked.
 */
export function needsSecondStep(user: UserLike | null | undefined, token: string | null | undefined): boolean {
  if (!hasTwoStep(user)) return false
  return tokenAal(token) !== 'aal2'
}

/** Six digits, spaces allowed (apps print "123 456"). Asked by every code box. */
export function cleanCode(raw: string): string {
  return raw.replace(/\s+/g, '')
}

export function codeProblem(raw: string): string | null {
  const code = cleanCode(raw)
  if (!code) return 'Enter the 6-digit code from your authenticator app.'
  if (!/^\d+$/.test(code)) return 'The code is numbers only.'
  if (code.length !== CODE_LENGTH) return `The code is ${CODE_LENGTH} digits.`
  return null
}

/**
 * Where to go once the code is in. Only a path on THIS site - `next` is in the
 * URL, so anything else is an open redirect wearing a sign-in page.
 */
export function twoStepReturnPath(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return '/dashboard'
  if (next === TWO_STEP_PATH || next.startsWith(`${TWO_STEP_PATH}?`)) return '/dashboard'
  return next
}

export function twoStepHref(next: string | null | undefined): string {
  return `${TWO_STEP_PATH}?next=${encodeURIComponent(twoStepReturnPath(next))}`
}

/**
 * The paths middleware sends to the code step while a session owes it. Every
 * top-level folder under `app/(dashboard)` is one of these; `two-step.ts`
 * (the suite) walks the folder and fails on one missing, because a screen
 * that is not on this list renders for a password alone.
 */
export const GATED_PREFIXES = [
  '/dashboard', '/projects', '/directory', '/approvals', '/settings',
  '/budget-templates', '/calendar', '/customers', '/equipment', '/files', '/help',
  '/master-calendar', '/master-money', '/materials', '/my-bids', '/my-jobs',
  '/reports', '/whats-new',
  '/admin', '/field', '/oauth', '/portal-account',
] as const

export function isGatedPath(pathname: string): boolean {
  return GATED_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`))
}
