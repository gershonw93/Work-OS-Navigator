// The server half of the client's free login: hashing (needs a secret), and
// resolving "is the person holding this session the job's client?".

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { sameEmail } from './portal-login'

function secret(): string {
  const s = process.env.PORTAL_LOGIN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!s) throw new Error('No secret to hash login codes with')
  return s
}

/** Six random digits from the CSPRNG. */
export function makeCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}

/** Only this is stored - keyed to the job and the address, so a hash is useless anywhere else. */
export function hashCode(code: string, projectId: string, email: string): string {
  return createHmac('sha256', secret()).update(`${projectId}:${email.trim().toLowerCase()}:${code}`).digest('hex')
}

export function codeMatches(code: string, projectId: string, email: string, storedHash: string): boolean {
  const a = Buffer.from(hashCode(code, projectId, email), 'hex')
  const b = Buffer.from(storedHash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

/** The address a job's client signs in as: the one on its customer record, or null. */
export async function clientEmailFor(db: any, customerId: string | null | undefined): Promise<string | null> {
  if (!customerId) return null
  const { data } = await db.from('customers').select('email').eq('id', customerId).maybeSingle()
  const e = ((data as any)?.email ?? '').trim()
  return e || null
}

/**
 * Who is signed in on this request, if it is the job's client - or why not.
 * The address is compared against the AUTHENTICATED user, never a body.
 */
export async function signedInClient(db: any, request: Request, clientEmail: string | null):
  Promise<{ ok: true; email: string } | { ok: false; reason: 'no_session' | 'no_email_on_file' | 'wrong_person'; email?: string }> {
  if (!clientEmail) return { ok: false, reason: 'no_email_on_file' }
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { ok: false, reason: 'no_session' }
  const { data } = await db.auth.getUser(token)
  const email = data?.user?.email ?? null
  if (!email) return { ok: false, reason: 'no_session' }
  if (!sameEmail(email, clientEmail)) return { ok: false, reason: 'wrong_person', email }
  return { ok: true, email }
}
