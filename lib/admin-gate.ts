import crypto from 'crypto'

// Server-only helpers for the /admin PIN gate.
// The cookie is an HMAC of the user's id, so it can't be forged client-side and
// is bound to the specific super-admin who entered the PIN.
export const ADMIN_GATE_COOKIE = 'workos_admin_gate'

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev-secret'

export function signGate(userId: string): string {
  return crypto.createHmac('sha256', SECRET).update(userId).digest('hex')
}

export function verifyGate(userId: string, token?: string | null): boolean {
  if (!token) return false
  const expected = signGate(userId)
  try {
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))
  } catch {
    return false
  }
}
