import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

// ─────────────────────────────────────────────────────────────────────────────
// QuickBooks tokens, encrypted at rest.
//
// A refresh token is the key to somebody's books for a hundred days, and it
// sat in `quickbooks_connections` as plain text - readable by anything holding
// the service role, by every database backup, and by anybody who ever ran a
// `select *` on that table to debug a sync. Intuit's production review asks
// how tokens are stored, and "in a column" is not an answer.
//
// AES-256-GCM with a key that lives only in the environment
// (`QBO_TOKEN_KEY`, 32 bytes as base64 or hex - or any passphrase, which is
// hashed to 32 bytes). The database then holds `enc:v1:<iv>:<tag>:<data>`, and
// the database alone opens nothing.
//
// A value WITHOUT the prefix is read as legacy plain text, so the sandbox row
// that predates this keeps working and is re-written encrypted on its next
// refresh. On production a missing key means QuickBooks is NOT CONFIGURED
// (see `qboConfigured`) - storing a real file's token in clear because a
// variable was forgotten is the failure this exists to prevent.
// ─────────────────────────────────────────────────────────────────────────────

const PREFIX = 'enc:v1:'

/** The 32-byte key, or null when none is set. Pure over its argument. */
export function tokenKey(raw: string | undefined | null = process.env.QBO_TOKEN_KEY): Buffer | null {
  const v = String(raw ?? '').trim()
  if (!v) return null
  if (/^[0-9a-f]{64}$/i.test(v)) return Buffer.from(v, 'hex')
  const b64 = Buffer.from(v, 'base64')
  if (b64.length === 32 && /^[A-Za-z0-9+/=_-]+$/.test(v)) return b64
  return createHash('sha256').update(v).digest()
}

export function isEncryptedToken(value: string | null | undefined): boolean {
  return String(value ?? '').startsWith(PREFIX)
}

/** Encrypt for storage. With no key, the value is returned as is - the caller decides whether that is allowed. */
export function sealToken(plain: string, key: Buffer | null = tokenKey()): string {
  if (!key) return plain
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  return `${PREFIX}${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`
}

/**
 * Decrypt a stored token. Plain text (legacy) passes through.
 *
 * THROWS on a sealed value that cannot be opened - the wrong key, a rotated
 * key, a truncated column. Returning the ciphertext instead would send
 * `enc:v1:...` to Intuit as a bearer and the failure would read as "QuickBooks
 * rejected the token", which sends somebody to reconnect a connection that is
 * fine and a key that is not.
 */
export function openToken(stored: string, key: Buffer | null = tokenKey()): string {
  if (!isEncryptedToken(stored)) return stored
  if (!key) throw new Error('QuickBooks tokens are encrypted but QBO_TOKEN_KEY is not set on the server')
  const [ivB64, tagB64, dataB64] = stored.slice(PREFIX.length).split(':')
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'))
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'))
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8')
}
