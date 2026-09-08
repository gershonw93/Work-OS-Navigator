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
  /** Reached a phone and was refused - neither sent nor dead. */
  failed: number
  /** Not an error: no keys configured, or nobody had a phone registered. */
  skipped: 'not_configured' | 'no_devices' | null
  /**
   * WHY it was refused, in Apple's own words, e.g. "403 InvalidProviderToken".
   *
   * THE BUG. sendOne parsed this out of Apple's response body and sendPush
   * filtered the results for `sent` and `dead` and never looked at the rest, so
   * a refusal arrived here as `{ sent: 0, dead: [], error: undefined }` and the
   * settings card said "Nothing was sent, and Apple gave no reason why". Apple
   * had given one. Three return values in a row dropped it.
   */
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
/** The error a local key problem is reported under. Not Apple's. */
export const KEY_UNREADABLE = 'unreadable APNs key'

/**
 * A .p8 that survived being pasted into a web form.
 *
 * THE BUG. Send test answered `error:1E08010C:DECODER routines::unsupported`.
 * That is OpenSSL, not Apple - Node could not parse the key, so nothing was
 * ever sent. A PEM is only valid WITH its line breaks, and a dashboard field
 * eats them: paste a .p8 into Vercel and the newlines come back as spaces, or
 * as nothing at all, or as the two characters backslash-n. All three produce
 * that same error, and the codebase already knew it - it is exactly why the
 * Codemagic signing certificate is carried base64-encoded.
 *
 * So the key is rebuilt rather than trusted: take whatever base64 is in there,
 * throw away every character that is not base64, and re-wrap it at 64 columns
 * with its header. Handles escaped newlines, lost newlines, a PEM that has
 * itself been base64'd to get through a form in one line, and a bare body with
 * no header at all.
 *
 * The label is preserved when there is one. An EC key in SEC1 form says
 * "BEGIN EC PRIVATE KEY" and relabelling it PKCS#8 would break it.
 */
export function normalizePrivateKey(raw: string | undefined | null): string {
  let text = String(raw ?? '').trim()
  if (!text) return ''
  text = text.replace(/\\r\\n|\\n|\\r/g, '\n')

  // A whole PEM, base64'd again to get it through a single-line field.
  if (!/-----BEGIN/.test(text) && /^[A-Za-z0-9+/=\s]+$/.test(text)) {
    try {
      const decoded = Buffer.from(text.replace(/\s+/g, ''), 'base64').toString('utf8')
      if (/-----BEGIN/.test(decoded)) text = decoded.replace(/\\n/g, '\n')
    } catch { /* it was not that; carry on with the original */ }
  }

  const m = /-----BEGIN ([A-Z0-9 ]+)-----([\s\S]*?)-----END \1-----/.exec(text)
  const label = m ? m[1] : 'PRIVATE KEY'
  const body = (m ? m[2] : text).replace(/[^A-Za-z0-9+/=]/g, '')
  if (!body) return ''
  return `-----BEGIN ${label}-----\n${(body.match(/.{1,64}/g) ?? []).join('\n')}\n-----END ${label}-----\n`
}

export function apnsConfig(env: NodeJS.ProcessEnv = process.env): ApnsConfig | null {
  const keyId = env.APNS_KEY_ID?.trim()
  const teamId = env.APNS_TEAM_ID?.trim()
  const privateKey = normalizePrivateKey(env.APNS_PRIVATE_KEY)
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

export interface ApnsAttempt {
  token: string
  outcome: 'sent' | 'dead' | 'failed'
  /** Apple's HTTP status, or 0 if the connection died before one arrived. */
  status: number
  /** Apple's `reason` field, when there was a body to read one from. */
  reason?: string
}

function sendOne(
  session: ClientHttp2Session, cfg: ApnsConfig, jwt: string, token: string, body: string,
): Promise<ApnsAttempt> {
  return new Promise(resolve => {
    let status = 0
    let raw = ''
    const req = session.request({
      [constants.HTTP2_HEADER_METHOD]: 'POST',
      [constants.HTTP2_HEADER_PATH]: `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
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
    req.on('error', () => resolve({ token, outcome: 'failed', status: 0, reason: 'connection' }))
    req.on('end', () => {
      let reason: string | undefined
      try { reason = raw ? JSON.parse(raw)?.reason : undefined } catch { /* body is not always JSON */ }
      resolve({ token, outcome: classifyApns(status, reason), status, reason })
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
  if (!cfg) return { sent: 0, dead: [], failed: 0, skipped: 'not_configured' }

  const unique = Array.from(new Set(tokens.filter(Boolean)))
  if (!unique.length) return { sent: 0, dead: [], failed: 0, skipped: 'no_devices' }

  const body = JSON.stringify(apnsPayload(message))
  if (Buffer.byteLength(body) > APNS_BODY_MAX) {
    return { sent: 0, dead: [], failed: 0, skipped: null, error: 'Notification too large for Apple' }
  }

  // SIGNED ONCE, UP FRONT. It used to be signed inside sendOne, per phone, in a
  // Promise executor - so an unparseable key surfaced as a rejected promise and
  // came out of the generic catch below labelled "Apple refused it", when Apple
  // had never been contacted at all. Failing here names the real fault, before a
  // connection is even opened.
  let jwt: string
  try {
    jwt = bearer(cfg)
  } catch (e) {
    return {
      sent: 0, dead: [], failed: 0, skipped: null,
      error: `${KEY_UNREADABLE}: ${e instanceof Error ? e.message : 'could not be parsed'}`,
    }
  }

  let session: ClientHttp2Session | null = null
  try {
    session = connect(`https://${cfg.host}`)
    session.on('error', () => { /* handled per request; must not crash the process */ })

    const results = await Promise.race([
      Promise.all(unique.map(t => sendOne(session!, cfg, jwt, t, body))),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Apple took too long')), SEND_BUDGET_MS)),
    ])

    // The refusals, which this function used to filter past. Deduplicated,
    // because ten phones refused for one bad key is one fact, not ten.
    const failed = results.filter(r => r.outcome === 'failed')
    return {
      sent: results.filter(r => r.outcome === 'sent').length,
      dead: results.filter(r => r.outcome === 'dead').map(r => r.token),
      failed: failed.length,
      skipped: null,
      error: failed.length ? summariseRefusals(failed) : undefined,
    }
  } catch (e) {
    return { sent: 0, dead: [], failed: 0, skipped: null, error: e instanceof Error ? e.message : 'push failed' }
  } finally {
    try { session?.close() } catch { /* closing a broken session is not news */ }
  }
}

/**
 * "403 InvalidProviderToken", from however many refusals there were.
 *
 * The status as well as the reason: the status is diagnostic on its own (403 is
 * authentication, 400 is the token or the payload, 429 is rate limiting, 5xx is
 * Apple), and a connection that died before a response has a reason and no
 * status at all.
 */
export function summariseRefusals(failed: ApnsAttempt[]): string {
  const seen = new Set<string>()
  for (const f of failed) {
    const parts = [f.status ? String(f.status) : '', f.reason ?? ''].filter(Boolean)
    // Never the empty string. A refusal we cannot describe still has to read as
    // a refusal, or it lands back in "no reason why" - the thing being fixed.
    seen.add(parts.length ? parts.join(' ') : 'no status and no reason from Apple')
  }
  return Array.from(seen).join(', ')
}

/**
 * Apple's bare token, turned into the thing to go and change.
 *
 * Pure, and additive: anything not listed here still reaches the screen
 * verbatim. `InvalidProviderToken` is searchable and is a better answer than
 * "something went wrong" - this only adds the sentence for the handful where
 * the word alone does not say what to do.
 */
export function apnsReasonHelp(error: string | undefined): string | null {
  const e = String(error ?? '')
  if (/InvalidProviderToken|ExpiredProviderToken|MissingProviderToken/.test(e)) {
    // The one that has actually been likely here: two different .p8 files were
    // in play - an App Store Connect API key and an APNs auth key - and only
    // one of them can sign a push.
    return 'Apple would not accept SyteNav\'s key. Check APNS_KEY_ID, APNS_TEAM_ID and '
      + 'APNS_PRIVATE_KEY in the deployment settings - the private key must be the APNs '
      + 'auth key, not the App Store Connect API key. They are both .p8 files and only '
      + 'one of them signs a notification.'
  }
  if (/TopicDisallowed|BadTopic/.test(e)) {
    return 'The Apple key is not allowed to send to this app. The bundle id must match '
      + 'the key - com.sytenav.app unless APNS_BUNDLE_ID says otherwise.'
  }
  if (/TooManyRequests|TooManyProviderTokenUpdates/.test(e)) {
    return 'Apple is rate-limiting us. Nothing is misconfigured - wait a minute and try again.'
  }
  if (/InternalServerError|ServiceUnavailable|Shutdown|^5\d\d\b/.test(e)) {
    return 'Apple\'s notification service is having a problem. Nothing here is wrong - try again shortly.'
  }
  // Not Apple's: OpenSSL's, from our own signing step. The exact string Node
  // gives for a PEM whose line breaks were eaten by a web form.
  if (e.includes(KEY_UNREADABLE) || /DECODER routines|unsupported|asn1|PEM routines/i.test(e)) {
    return 'This is SyteNav\'s key, not Apple - the APNs private key in the deployment '
      + 'settings cannot be read at all, so nothing was sent. Re-paste APNS_PRIVATE_KEY '
      + 'as the WHOLE .p8 file including the BEGIN and END lines. Losing its line breaks '
      + 'is what usually does this.'
  }
  if (/^connection$|took too long/i.test(e)) {
    return 'SyteNav could not reach Apple. If it keeps happening it is a network problem at our end, not yours.'
  }
  return null
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
  // Reachable only when Apple refused and said nothing whatsoever - no status
  // and no body. It used to be reached for EVERY refusal, because sendPush
  // filtered the failures out before anyone could look at them.
  if (!r.error) return { ok: false, text: 'Nothing was sent, and Apple gave no reason why.' }
  // Apple's reasons are bare tokens like "InvalidProviderToken" - passed
  // through rather than softened into "something went wrong", because that
  // word IS the answer and it is searchable. Punctuated so it reads as a
  // sentence next to the others, without doubling a full stop if it has one.
  const reason = r.error.trim()
  const help = apnsReasonHelp(reason)
  // Only Apple's refusals get Apple's name on them. An unreadable key never
  // left the building, and reporting it as "Apple refused it: error:1E08010C"
  // sends somebody to look at the wrong end of the problem - which is exactly
  // what it did.
  const ours = reason.includes(KEY_UNREADABLE)
  const lead = ours
    ? `SyteNav could not sign the request: ${reason}`
    : `Apple refused it: ${reason}`
  const text = `${lead}${/[.!?]$/.test(reason) ? '' : '.'}`
  return { ok: false, text: help ? `${text} ${help}` : text }
}
