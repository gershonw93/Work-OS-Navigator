import { createSign } from 'node:crypto'
import { normalizePrivateKey } from './pem'
import type { PushMessage, PushResult } from './push'
import { ANDROID_CHANNEL_ID } from './fcm-channel'

// ─────────────────────────────────────────────────────────────────────────────
// Sending a notification to an ANDROID phone - Firebase Cloud Messaging, v1.
//
// The Apple half is lib/push.ts, and this is its twin on purpose: same
// PushMessage in, same PushResult out, same contract - NEVER THROWS, "not
// configured" is a normal state (every preview deploy, and production until
// the Firebase project exists), and tokens the service calls dead come back in
// `dead` for the caller to delete.
//
// Before this file, `device-token` would happily store an Android token and
// `pushToPhones` would hand it to APNs, which cannot deliver to an Android
// phone and never will. Every notification to an Android user went nowhere,
// silently, with the Settings card reporting a registered phone.
//
// No npm package, for the same reason as the Apple sender: a service-account
// JWT is RS256 and one form POST, and Node signs RS256 out of the box.
// firebase-admin would be a dependency holding a key that writes to every
// Android user's lock screen, to save forty lines.
//
// ONE ENVIRONMENT VARIABLE: FCM_SERVICE_ACCOUNT, the service-account JSON
// Firebase gives you (Project settings -> Service accounts -> Generate new
// private key). Raw JSON or base64 of it - a dashboard field that mangles one
// usually leaves the other alone. The project id is read out of the JSON, so
// there is no second variable to disagree with it.
// ─────────────────────────────────────────────────────────────────────────────

const SEND_BUDGET_MS = 8000
const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const SCOPE = 'https://www.googleapis.com/auth/firebase.messaging'

export { ANDROID_CHANNEL_ID } from './fcm-channel'

/** The error a local key problem is reported under. Not Google's. */
export const FCM_KEY_UNREADABLE = 'unreadable FCM key'

export interface FcmConfig {
  projectId: string
  clientEmail: string
  privateKey: string
}

/**
 * Is Android push set up in this environment? Null when not, never a throw.
 *
 * A present-but-unparseable variable is ALSO null here, deliberately: it is
 * reported, but as "not configured", because the alternative is a notify()
 * that throws on every bill approval over a typo in a dashboard.
 */
export function fcmConfig(env: NodeJS.ProcessEnv = process.env): FcmConfig | null {
  const raw = env.FCM_SERVICE_ACCOUNT?.trim()
  if (!raw) return null
  let json: any = null
  try { json = JSON.parse(raw) } catch {
    try { json = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')) } catch { return null }
  }
  const projectId = String(json?.project_id ?? '').trim()
  const clientEmail = String(json?.client_email ?? '').trim()
  const privateKey = normalizePrivateKey(json?.private_key)
  if (!projectId || !clientEmail || !privateKey) return null
  return { projectId, clientEmail, privateKey }
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/** The signed assertion Google trades for an access token. Pure, for tests. */
export function fcmAssertion(cfg: FcmConfig, now = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(JSON.stringify({
    iss: cfg.clientEmail, scope: SCOPE, aud: TOKEN_URL, iat: now, exp: now + 3600,
  }))
  const signature = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(cfg.privateKey)
  return `${header}.${claims}.${b64url(signature)}`
}

/**
 * Google's access tokens live an hour. Cached for fifty minutes, keyed by the
 * service account so a rotated key is not answered with the old one's token.
 */
let cached: { who: string; token: string; expires: number } | null = null
export function _resetFcmToken() { cached = null }

async function accessToken(cfg: FcmConfig, signal: AbortSignal): Promise<string> {
  if (cached && cached.who === cfg.clientEmail && Date.now() < cached.expires) return cached.token
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: fcmAssertion(cfg),
    }),
    signal,
  })
  const body: any = await res.json().catch(() => ({}))
  if (!res.ok || !body?.access_token) {
    // Google's own words ("invalid_grant: Invalid JWT Signature"), prefixed so
    // the Settings card can say whose they are.
    throw new Error(`FCM auth ${res.status} ${body?.error ?? ''}${body?.error_description ? `: ${body.error_description}` : ''}`.trim())
  }
  cached = { who: cfg.clientEmail, token: body.access_token, expires: Date.now() + 50 * 60 * 1000 }
  return body.access_token
}

/**
 * What Google is actually sent.
 *
 * `data` values must be STRINGS - FCM refuses the whole message over a number
 * or a null in there, which is why nothing optional is put in unless it is set.
 * `link` rides in `data` for the same reason it rides beside `aps` on iOS: it
 * comes back to the app untouched on a tap, and the tap listener in
 * lib/use-push.ts reads `notification.data.link` on both platforms.
 */
export function fcmPayload(token: string, m: PushMessage): Record<string, unknown> {
  const data: Record<string, string> = {}
  if (m.link) data.link = m.link
  if (m.type) data.type = m.type
  return {
    message: {
      token,
      notification: { title: m.title, body: m.body },
      ...(Object.keys(data).length ? { data } : {}),
      android: {
        // HIGH = deliver now, wake the phone. The Android twin of APNs
        // priority 10 - "normal" lets Doze sit on it for hours.
        priority: 'HIGH',
        ttl: '3600s',
        notification: { channel_id: ANDROID_CHANNEL_ID, sound: 'default' },
      },
    },
  }
}

/**
 * What a response from FCM means for the token that produced it.
 *
 * Same rule as classifyApns: `dead` means THIS PHONE is gone and only that.
 * UNREGISTERED is the app uninstalled or the token rotated; SENDER_ID_MISMATCH
 * is a token minted for a different Firebase project, which this key can never
 * reach. A 400 INVALID_ARGUMENT is dead only when Google says it is the TOKEN -
 * the same status comes back for a malformed payload, and deleting every
 * phone's row over our own bug would turn a fixable mistake into a permanent
 * one. Auth failures (401/403) are never dead: they are our key, not the phone.
 * Nor is a bare 404 with no FcmError code: that is what a WRONG PROJECT ID
 * answers, for every phone at once, and reading it as dead would empty the table.
 */
export function classifyFcm(status: number, errorCode?: string, message?: string): 'sent' | 'dead' | 'failed' {
  if (status === 200) return 'sent'
  if (errorCode === 'UNREGISTERED' || errorCode === 'SENDER_ID_MISMATCH') return 'dead'
  if (status === 400 && errorCode === 'INVALID_ARGUMENT' && /registration token/i.test(message ?? '')) return 'dead'
  return 'failed'
}

export interface FcmAttempt {
  token: string
  outcome: 'sent' | 'dead' | 'failed'
  status: number
  /** FCM's errorCode (UNREGISTERED, QUOTA_EXCEEDED...), or the RPC status. */
  reason?: string
}

async function sendOne(cfg: FcmConfig, bearer: string, token: string, m: PushMessage, signal: AbortSignal): Promise<FcmAttempt> {
  try {
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${cfg.projectId}/messages:send`, {
      method: 'POST',
      headers: { authorization: `Bearer ${bearer}`, 'content-type': 'application/json' },
      body: JSON.stringify(fcmPayload(token, m)),
      signal,
    })
    if (res.ok) return { token, outcome: 'sent', status: res.status }
    const body: any = await res.json().catch(() => ({}))
    const err = body?.error ?? {}
    const detail = (Array.isArray(err.details) ? err.details : [])
      .find((d: any) => typeof d?.errorCode === 'string')
    const code = detail?.errorCode ?? err.status
    return { token, outcome: classifyFcm(res.status, code, err.message), status: res.status, reason: code }
  } catch {
    return { token, outcome: 'failed', status: 0, reason: 'connection' }
  }
}

/** "FCM 403 PERMISSION_DENIED", deduplicated - same shape as the Apple one. */
export function summariseFcmRefusals(failed: FcmAttempt[]): string {
  const seen = new Set<string>()
  for (const f of failed) {
    const parts = [f.status ? String(f.status) : '', f.reason ?? ''].filter(Boolean)
    seen.add(`FCM ${parts.length ? parts.join(' ') : 'no status and no reason'}`)
  }
  return Array.from(seen).join(', ')
}

/** Send one message to a set of Android phones. Never throws. */
export async function sendFcm(tokens: string[], message: PushMessage): Promise<PushResult> {
  const cfg = fcmConfig()
  if (!cfg) return { sent: 0, dead: [], failed: 0, skipped: 'not_configured' }

  const unique = Array.from(new Set(tokens.filter(Boolean)))
  if (!unique.length) return { sent: 0, dead: [], failed: 0, skipped: 'no_devices' }

  // One budget for the whole send, auth included - the same 8 seconds the
  // Apple sender and every QuickBooks push get.
  const abort = new AbortController()
  const timer = setTimeout(() => abort.abort(), SEND_BUDGET_MS)
  try {
    let bearer: string
    try {
      bearer = await accessToken(cfg, abort.signal)
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'could not sign in to Google'
      // Signing failed locally (OpenSSL) vs Google refusing the assertion:
      // the first never left the building and must not be reported as Google's.
      const local = !/^FCM auth/.test(msg) && !/abort/i.test(msg)
      return {
        sent: 0, dead: [], failed: 0, skipped: null,
        error: local ? `${FCM_KEY_UNREADABLE}: ${msg}` : (/abort/i.test(msg) ? 'FCM took too long' : msg),
      }
    }

    const results = await Promise.all(unique.map(t => sendOne(cfg, bearer, t, message, abort.signal)))
    const failed = results.filter(r => r.outcome === 'failed')
    return {
      sent: results.filter(r => r.outcome === 'sent').length,
      dead: results.filter(r => r.outcome === 'dead').map(r => r.token),
      failed: failed.length,
      skipped: null,
      error: failed.length ? summariseFcmRefusals(failed) : undefined,
    }
  } catch (e) {
    return { sent: 0, dead: [], failed: 0, skipped: null, error: e instanceof Error ? e.message : 'FCM push failed' }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Google's bare codes, turned into the thing to go and change. Additive, like
 * apnsReasonHelp: anything not listed still reaches the screen verbatim.
 */
export function fcmReasonHelp(error: string | undefined): string | null {
  const e = String(error ?? '')
  if (e.includes(FCM_KEY_UNREADABLE)) {
    return 'This is SyteNav\'s key, not Google - the Firebase service-account key in the '
      + 'deployment settings cannot be read, so nothing was sent. Re-paste FCM_SERVICE_ACCOUNT '
      + 'as the whole JSON file Firebase downloaded (or base64 of it).'
  }
  if (/FCM auth|invalid_grant|UNAUTHENTICATED|PERMISSION_DENIED|THIRD_PARTY_AUTH_ERROR/.test(e)) {
    return 'Google would not accept SyteNav\'s Firebase key. FCM_SERVICE_ACCOUNT must be a '
      + 'service-account key from the SAME Firebase project as the app\'s google-services.json, '
      + 'and the Firebase Cloud Messaging API must be enabled for that project.'
  }
  if (/SENDER_ID_MISMATCH/.test(e)) {
    return 'This phone registered with a different Firebase project than the server key belongs to.'
  }
  if (/QUOTA_EXCEEDED/.test(e)) {
    return 'Google is rate-limiting us. Nothing is misconfigured - wait a minute and try again.'
  }
  if (/UNAVAILABLE|INTERNAL|FCM 5\d\d/.test(e)) {
    return 'Google\'s notification service is having a problem. Nothing here is wrong - try again shortly.'
  }
  if (/FCM took too long|FCM connection/.test(e)) {
    return 'SyteNav could not reach Google. If it keeps happening it is a network problem at our end, not yours.'
  }
  return null
}
