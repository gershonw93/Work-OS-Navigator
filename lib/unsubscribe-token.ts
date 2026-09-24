import crypto from 'crypto'
import { normaliseEmail } from './campaign-audience'

// ─────────────────────────────────────────────────────────────────────────────
// THE WAY OUT OF A LIST.
//
// An unsubscribe link has to work from an inbox with no session, months later,
// possibly from an address that never had an account. So it cannot be a lookup
// against a table of one-time tokens somebody has to remember to write: it is
// an HMAC of the address itself, the same shape as `lib/admin-gate.ts`. Nothing
// to mint, nothing to expire, and it cannot be guessed - which matters, because
// a guessable one lets anybody unsubscribe anybody.
//
// IT IS BOUND TO THE ADDRESS IT WAS SENT TO. A token for dana@x.com does not
// verify for sam@x.com, so a forwarded email cannot take somebody else off the
// list - the same rule as an invite link being good only for the address it
// was sent to.
//
// Case-folded through `normaliseEmail`, so `Dana@X.com` and `dana@x.com` are
// one person to the token exactly as they are one row to the suppression table.
// ─────────────────────────────────────────────────────────────────────────────

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev-secret'

export function signUnsubscribe(email: string): string {
  return crypto.createHmac('sha256', SECRET).update(`unsub:${normaliseEmail(email)}`).digest('hex')
}

export function verifyUnsubscribe(email: string, token?: string | null): boolean {
  if (!token) return false
  const expected = signUnsubscribe(email)
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    // Different lengths throw rather than answering false. A tampered token is
    // a failed verification, not a 500.
    return false
  }
}

/** The link that goes in the footer of every campaign, and in the header. */
export function unsubscribeUrl(origin: string, email: string): string {
  const address = normaliseEmail(email)
  return `${origin.replace(/\/+$/, '')}/unsubscribe`
    + `?e=${encodeURIComponent(address)}&t=${signUnsubscribe(address)}`
}
