import { createSign } from 'node:crypto'
import { connect, constants, type ClientHttp2Session } from 'node:http2'

// ─────────────────────────────────────────────────────────────────────────────
// Sending a notification to somebody's phone.
//
// SAME CONTRACT AS sendEmail AND THE QUICKBOOKS PUSHERS: THIS NEVER THROWS.
// Approving a bill must not fail because Apple had a bad minute, and "push is
// not configured" is a normal state, not an error - it is the state every
// environment is in until the keys are set, including every preview deploy.
//
// No npm package. Apple's push service is HTTP/2 with a signed JSON Web Token,
// and Node has both of those in the standard library. A dependency here would
// be a third party holding a key that can write to every user's lock screen.
//
// The only caller is lib/notify.ts. Nothing else should send a push directly,
// for the same reason nothing should insert into `notifications` directly:
// that is how you end up with a channel nobody's preferences govern.
// ─────────────────────────────────────────────────────────────────────────────

/** Apple's own cap. Anything longer is rejected outright, not truncated. */
const APNS_BODY_MAX = 4096
const SEND_BUDGET_MS = 8000

export interface PushMessage {
  title: string
  body: string
  /** App-relative path the notification opens, e.g. /projects/abc/invoices */
  link?: string | null
  /** The notification type, so the app can group or route on it. */
  type?: string
}

export interface PushResult {
  sent: number
  /** Tokens Apple says are dead. The caller deletes these. */
  dead: string[]
  /** Not an error: no keys configured, or nobody had a phone registered. */
  skipped: 'not_configured' | 'no_devices' | null
  error?: string
}

interface ApnsConfig {
  keyId: string
  teamId: string
  privateKey: string
  bundleId: string
  host: string
}

/**
 * Is push set up in this environment?
 *
 * Returns null rather than throwing, because "no keys" is the normal state of
 * a preview deploy and of production until the Apple enrolment finishes. A
 * missing key must read as "not configured", never as a failure somebody has
 * to investigate.
 */
export function apnsConfig(env: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim()
  const teamId = env.APNS_TEAM_ID?.trim()
  // Pasted through a dashboard, the newlines in a .p8 usually arrive as the
  // two characters backslash-n. A key that looks right and is one character
  // off produces "InvalidProviderToken", which names nothing.
  const privateKey = env.APNS_PRIVATE_KEY?.replace(/\\n/g, '\n').trim()
  if (!keyId || !teamId || !privateKey) return null
  return {
    keyId, teamId, privateKey,
    bundleId: env.APNS_BUNDLE_ID?.trim() || 'com.sytenav.app',
    // Builds from TestFlight and the App Store talk to the production host.
    // The sandbox host is only for builds signed with a development profile,
    // which we never make - there is no Mac to make one on.
    host: env.APNS_SANDBOX === 'true' ? 'api.sandbox.push.apple.com' : 'api.push.apple.com',
  }
}

const b64url = (b: Buffer | string) =>
  Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

/**
 * The bearer token Apple wants, signed with the .p8 key.
 *
 * ES256, and the signature has to be the raw r||s pair - `ieee-p1363`. Node's
 * default for an EC key is DER, which Apple rejects as malformed with an error
 * that does not mention the encoding.
 */
export function apnsJwt(cfg: ApnsConfig, now = Math.floor(Date.now() / 1000)): string {
  const header = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }))
  const payload = b64url(JSON.stringify({ iss: cfg.teamId, iat: now }))
  const signature = createSign('SHA256')
    .update(`${header}.${payload}`)
    .sign({ key: cfg.privateKey, dsaEncoding: 'ieee-p1363' })
  return `${header}.${payload}.${b64url(signature)}`
}

/**
 * Apple allows a token to live an hour and refuses one refreshed more often
 * than every 20 minutes, so it is cached for a comfortable middle. Signing is
 * cheap; being rate-limited on authentication is not.
 */
let cached: { token: string; expires: number } | null = null
function bearer(cfg: ApnsConfig): string {
  if (cached && Date.now() < cached.expires) return cached.token
  const token = apnsJwt(cfg)
  cached = { token, expires: Date.now() + 40 * 60 * 1000 }
  return token
}

/** Exported for tests - resets the cached bearer token. */
export function _resetApnsToken() { cached = null }

/**
 * What Apple is actually sent.
 *
 * `link` rides alongside the `aps` block rather than inside it: everything in
 * `aps` is Apple's, and a key they do not recognise there is a rejected
 * notification. Anything at the top level is ours and comes back to the app
 * untouched when somebody taps it, which is what lets a tap open the invoice
 * rather than just the app.
 */
export function apnsPayload(m: PushMessage): Record<string, unknown> {
  return {
    aps: {
      alert: { title: m.title, body: m.body },
      sound: 'default',
      'thread-id': m.type ?? 'sytenav',
    },
    ...(m.link ? { link: m.link } : {}),
    ...(m.type ? { type: m.type } : {}),
  }
}

/**
 * What a response from Apple means for the token that produced it.
 *
 * `dead` is the one that matters. A phone that was wiped, or had the app
 * deleted, answers 410 Unregistered forever - and a token nobody ever removes
 * is a notification failing on every single send for the life of the row.
 * Apple documents this as the caller's job to act on, not theirs.
 *
 * 403 is NOT dead. It means our key is wrong, which is a configuration problem
 * affecting every phone at once; deleting tokens over it would quietly empty
 * the table and turn a fixable mistake into a permanent one.
 */
export function classifyApns(status: number, reason?: string): 'sent' | 'dead' | 'failed' {
  if (status === 200) return 'sent'
  if (status === 410) return 'dead'
  if (status === 400 && (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic')) return 'dead'
  return 'failed'
}

function sendOne(
  session: ClientHttp2Session, cfg: ApnsConfig, token: string, body: string,
): Promise<{ token: string; outcome: 'sent' | 'dead' | 'failed'; reason?: string }> {
  return new Promise(resolve => {
    let status = 0
    let raw = ''
    const req = session.request({
      [constants.HTTP2_HEADER_METHOD]: 'POST',
      [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
      authorization: `bearer ${bearer(cfg)}`,
      'apns-topic': cfg.bundleId,
      'apns-push-type': 'alert',
      // 10 = deliver now. The alternative (5) lets Apple hold it to save
      // battery, which is wrong for "a bill needs your approval".
      'apns-priority': '10',
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600),
      'content-type': 'application/json',
    })
    req.setEncoding('utf8')
    req.on('response', h => { status = Number(h[constants.HTTP2_HEADER_STATUS] ?? 0) })
    req.on('data', (c: string) => { raw += c })
    req.on('error', () => resolve({ token, outcome: 'failed', reason: 'connection' }))
    req.on('end', () => {
      let reason: string | undefined
      try { reason = raw ? JSON.parse(raw)?.reason : undefined } catch { /* body is not always JSON */ }
      resolve({ token, outcome: classifyApns(status, reason), reason })
    })
    req.end(body)
  })
}

/**
 * Send one message to a set of phones. Never throws.
 *
 * All the tokens go down ONE HTTP/2 connection - that is the whole reason
 * Apple uses HTTP/2, and opening a TLS connection per phone would make
 * notifying a ten-person crew ten handshakes.
 */
export async function sendPush(tokens: string[], message: PushMessage): Promise<PushResult> {
  const cfg = apnsConfig()
  if (!cfg) return { sent: 0, dead: [], skipped: 'not_configured' }

  const unique = Array.from(new Set(tokens.filter(Boolean)))
  if (!unique.length) return { sent: 0, dead: [], skipped: 'no_devices' }

  const body = JSON.stringify(apnsPayload(message))
  if (Buffer.byteLength(body) > APNS_BODY_MAX) {
    return { sent: 0, dead: [], skipped: null, error: 'Notification too large for Apple' }
  }

  let session: ClientHttp2Session | null = null
  try {
    session = connect(`https://${cfg.host}`)
    session.on('error', () => { /* handled per request; must not crash the process */ })

    const results = await Promise.race([
      Promise.all(unique.map(t => sendOne(session!, cfg, t, body))),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Apple took too long')), SEND_BUDGET_MS)),
    ])

    return {
      sent: results.filter(r => r.outcome === 'sent').length,
      dead: results.filter(r => r.outcome === 'dead').map(r => r.token),
      skipped: null,
    }
  } catch (e) {
    return { sent: 0, dead: [], skipped: null, error: e instanceof Error ? e.message : 'push failed' }
  } finally {
    try { session?.close() } catch { /* closing a broken session is not news */ }
  }
}

/**
 * What to tell somebody who just pressed "send a test notification".
 *
 * Pure, so every branch can be checked without a phone, an Apple key or a
 * network - which matters because these sentences ARE the diagnostic. Push
 * failing has three quite different causes and only one of them is a fault:
 * the server has no keys yet, no phone has registered, or Apple refused. A
 * screen that says "failed" to all three sends somebody hunting in the wrong
 * place.
 */
export function pushTestMessage(
  r: { configured: boolean; devices: number; sent: number; dead: number; error?: string },
): { ok: boolean; text: string } {
  if (!r.configured) {
    return { ok: false, text: "Phone notifications aren't switched on for SyteNav yet. Nothing is wrong with your phone." }
  }
  if (!r.devices) {
    return { ok: false, text: 'No phone is registered to your account yet. Open SyteNav on your phone, sign in, and allow notifications when it asks.' }
  }
  if (r.sent > 0) {
    return {
      ok: true,
      text: r.sent === 1
        ? 'Sent. Look at your phone - it should be there within a second or two.'
        : `Sent to ${r.sent} phones. They should arrive within a second or two.`,
    }
  }
  if (r.dead > 0) {
    // Not a fault. The phone was wiped, the app was deleted, or the token came
    // from a build with a different bundle id - and the row has just been
    // removed, so saying "try again" is the correct advice rather than a shrug.
    return { ok: false, text: 'Your phone is no longer reachable - the app may have been removed or reinstalled. Open SyteNav on your phone again, then try this once more.' }
  }
  if (!r.error) return { ok: false, text: 'Nothing was sent, and Apple gave no reason why.' }
  // Apple's reasons are bare tokens like "InvalidProviderToken" - passed
  // through rather than softened into "something went wrong", because that
  // word IS the answer and it is searchable. Punctuated so it reads as a
  // sentence next to the others, without doubling a full stop if it has one.
  const reason = r.error.trim()
  return { ok: false, text: `Apple refused it: ${reason}${/[.!?]$/.test(reason) ? '' : '.'}` }
}
