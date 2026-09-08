// Why this phone is not getting notifications.
//
// THE BUG. An iPhone installed from TestFlight, permission granted, and
// `device_tokens` empty. Six exits between those two facts and every one of
// them silent - including `addListener('registrationError', () => {})`, which
// received Apple's reason and dropped it on the floor.
//
// Meanwhile the Settings card, with no information whatsoever, told the person
// holding that phone to "Open SyteNav on your phone, sign in, and allow
// notifications when it asks". They had. That is a screen reporting a guess as
// a fact, which is the same fault three other suites in here exist for.
//
// What is testable without a phone: that each outcome produces a DIFFERENT and
// actionable sentence, that an unrecognised record degrades to advice rather
// than to blank, and that the hook still writes one at every exit.

import { generateKeyPairSync, createPrivateKey } from 'node:crypto'
import {
  PUSH_STAGES, pushStateNote, pushStateWhen, readPushState, writePushState,
  type PushStage, type PushState,
} from '../push-state'
import {
  pushTestMessage, apnsReasonHelp, classifyApns, summariseRefusals,
  normalizePrivateKey, apnsConfig, apnsJwt, KEY_UNREADABLE,
  type ApnsAttempt,
} from '../push'
import { ok, done, code, read } from './_helpers'

const at = '2026-09-08T14:12:00.000Z'
const state = (stage: PushStage, reason?: string): PushState => ({ stage, at, reason })

// ── every outcome says something different ───────────────────────────────────
// One sentence shared by two stages means one of them is being reported as the
// other, which is the whole disease.
const notes = PUSH_STAGES.map(s => pushStateNote(state(s)))
ok(notes.every(n => typeof n === 'string' && n.trim().length > 20),
  'every stage produces a real sentence')
const distinct = notes.filter((n, i) => notes.indexOf(n) === i)
ok(distinct.length === PUSH_STAGES.length,
  `${distinct.length} distinct sentences for ${PUSH_STAGES.length} stages`)
// THE SECOND BUG, found on the phone. `not_native` used to return the same
// sentence as "no record at all" - defensible in a browser, and fatal on the
// screen that had to tell "the code never ran" from "the code ran and stopped".
ok(!notes.includes(pushStateNote(null)),
  'no stage shares the no-record default - that is how three facts became one line')

// ── and each one is actionable ───────────────────────────────────────────────
ok(/iPhone Settings/.test(pushStateNote(state('denied'))),
  'a refused permission points at iPhone Settings - iOS will not ask again, so the app cannot fix it')
ok(!/allow notifications when it asks/i.test(pushStateNote(state('denied'))),
  '...and does NOT repeat the advice that no longer applies')

ok(/Close SyteNav completely/.test(pushStateNote(state('save_failed'))),
  'a failed save says what to do about it')
ok(/error 401/.test(pushStateNote(state('save_failed', 'error 401'))),
  '...and names the status, because a 401 and a 500 are not the same problem')
ok(/no connection/.test(pushStateNote(state('save_failed', 'no connection'))),
  '...or that there was no connection at all')
ok(!/\(\)/.test(pushStateNote(state('save_failed'))),
  'with no reason it still reads as a sentence, not an empty bracket')

// Apple's own wording, carried through. This is the one that was thrown away.
const refused = pushStateNote(state('apple_refused',
  'no valid "aps-environment" entitlement string found for application'))
ok(/aps-environment/.test(refused),
  "Apple's reason reaches the screen - it was discarded, and it is the answer")
ok(/^Apple would not register this phone\. Close/.test(pushStateNote(state('apple_refused'))),
  'without a reason the sentence still closes properly')

ok(/signed in/.test(pushStateNote(state('no_session'))),
  'a token that arrived before sign-in says so')
ok(/Sign out and back in/.test(pushStateNote(state('registered'))),
  'registered here but absent on the server is its own state, with its own fix')
ok(/reinstall/i.test(pushStateNote(state('unavailable'))),
  'push never starting at all is not the same as Apple refusing')

// ── the default, which is where the wrong advice lived ───────────────────────
const general = pushStateNote(null)
ok(/Open SyteNav on your phone/.test(general),
  'no record: the general advice, which is right on a desktop browser')
ok(pushStateNote(state('not_native')) !== general,
  'a browser that HAS reported in says so, rather than borrowing the default')
ok(/web browser/.test(pushStateNote(state('not_native'))), '...in those words')
// An old app writing a stage this build does not know about must not blank the
// card. readPushState drops it; the note then falls back.
ok(pushStateNote(readPushState()) === general,
  'an unreadable record degrades to advice, never to nothing')

// ── positions, not just endings ──────────────────────────────────────────────
// A phone whose permission was granted days ago takes NO exit: past `denied`,
// listeners attached, register() called - and then Apple never answers, because
// the app delegate has no method to receive the answer. Nothing was written, so
// the card read exactly like a phone that had never run the code.
ok(/Apple has not answered/.test(pushStateNote(state('registering'))),
  'waiting on Apple is a state the card can name')
ok(/new one is needed/.test(pushStateNote(state('registering'))),
  '...and it says the truth: this one is not fixable from the phone')
ok(/did not get as far/.test(pushStateNote(state('starting'))),
  'starting and never reaching Apple is its own state')

// ── the date, so a retry is distinguishable from no retry ────────────────────
ok(!!pushStateWhen(state('save_failed'))?.startsWith('Last tried '),
  'a failure is dated')
ok(/· save_failed$/.test(pushStateWhen(state('save_failed')) ?? ''),
  '...and names its stage, so reporting it is one word rather than matching prose')
ok(!!pushStateWhen(state('registered'))?.startsWith('Registered '),
  'a success reads as one')
ok(pushStateWhen(state('not_native')) === null, 'a browser is not dated - there was no attempt')
ok(pushStateWhen(null) === null, 'nor is a missing record')
ok(pushStateWhen({ stage: 'denied', at: '' }) === null, 'nor one with no timestamp')

// ── storage round trip ───────────────────────────────────────────────────────
// A tiny stand-in: node has no localStorage, and the point is the parsing.
const store: Record<string, string> = {}
;(globalThis as any).localStorage = {
  getItem: (k: string) => (k in store ? store[k] : null),
  setItem: (k: string, v: string) => { store[k] = v },
}
ok(readPushState() === null, 'nothing stored, nothing claimed')
writePushState('apple_refused', '  no valid aps-environment  ')
const back = readPushState()
ok(back?.stage === 'apple_refused', 'the stage survives a round trip')
ok(back?.reason === 'no valid aps-environment', '...with the reason trimmed')
ok(!!back?.at && !isNaN(Date.parse(back.at)), '...and a real timestamp')
writePushState('registered')
ok(readPushState()?.reason === undefined, 'a later outcome replaces the earlier one entirely')

store['sytenav-push-state'] = JSON.stringify({ stage: 'gremlin', at })
ok(readPushState() === null, 'a stage from another build is not trusted')
store['sytenav-push-state'] = 'not json at all'
ok(readPushState() === null, 'nor is corrupt storage - it must not throw on a settings screen')

// A device that cannot store anything (private mode, quota) must not take the
// app down on launch. The hook calls this before anything else it does.
;(globalThis as any).localStorage = {
  getItem: () => { throw new Error('denied') },
  setItem: () => { throw new Error('denied') },
}
let threw = false
try { writePushState('denied'); readPushState() } catch { threw = true }
ok(!threw, 'storage that refuses is survivable, in both directions')

// ── the hook actually records, at every exit ─────────────────────────────────
const hook = code('lib/use-push.ts')
ok(/writePushState\('not_native'\)/.test(hook), 'a browser is recorded')
ok(/writePushState\('denied'\)/.test(hook), 'a refused permission is recorded')
ok(/writePushState\('no_session'\)/.test(hook), 'a token with no session is recorded')
ok(/writePushState\('unavailable'\)/.test(hook), 'the plugin failing to load is recorded')
ok(/writePushState\('starting'\)/.test(hook),
  'the hook records that it ran - no record now means it did not, and only that')
ok(/register\(\)[\s\S]{0,120}writePushState\('registering'\)/.test(hook),
  'asking Apple is recorded, which is the state the phone was actually stuck in')
ok(/readPushState\(\)\?\.stage === 'starting'[\s\S]{0,60}writePushState\('registering'\)/.test(hook),
  "...but only while nothing has answered - the listener can fire first, and a "
  + 'position must never overwrite an outcome')
ok(/writePushState\(res\.ok \? 'registered' : 'save_failed'/.test(hook),
  'the save records BOTH outcomes - a success that is never written reads as a failure forever')
ok(/catch \{ writePushState\('save_failed'/.test(hook),
  'a network failure on the save is recorded too')
// The one that mattered: `() => {}` as the registrationError handler.
ok(/addListener\('registrationError', err =>[\s\S]{0,120}writePushState\('apple_refused', \(err as any\)\?\.error\)/.test(hook),
  "Apple's reason is passed on rather than discarded")
ok(!/addListener\('registrationError', \(\) => \{\}\)/.test(hook),
  '...and the empty handler that binned it cannot come back')

// The permission answer must be recorded before the cancel check swallows it -
// `!== 'granted' || cancelled` in one condition made a denial indistinguishable
// from an unmount.
ok(hook.indexOf("if (cancelled) return") < hook.indexOf("writePushState('denied')"),
  'unmounting is checked separately from being denied')

// ═════════════════════════════════════════════════════════════════════════════
// THE OTHER HALF: the phone registered, and the send said nothing.
//
// "One phone is set up for notifications" - and Send test answered "Nothing was
// sent, and Apple gave no reason why." Apple had given one. sendOne parsed it
// out of the response body, sendPush filtered the results for `sent` and `dead`
// and NEVER LOOKED AT THE REST, pushToPhones returned a bare number, and the
// route had nothing left to pass on. Four return values, one dropped fact.
//
// Third time this session, in this one feature: registrationError binned
// Apple's reason, the diagnostic recorded only exits, and now this. These are
// the tests that did not exist - pushTestMessage's own comment says it is pure
// "so every branch can be checked without a phone", and nothing ever did.
// ═════════════════════════════════════════════════════════════════════════════

const attempt = (status: number, reason?: string): ApnsAttempt =>
  ({ token: 'abc', outcome: 'failed', status, reason })

// ── a refusal reaches the screen at all ──────────────────────────────────────
ok(summariseRefusals([attempt(403, 'InvalidProviderToken')]) === '403 InvalidProviderToken',
  'a refusal is summarised as the status AND the reason')
ok(summariseRefusals([attempt(0, 'connection')]) === 'connection',
  'a connection that died before a response has no status, and says so without a stray 0')
// The status alone is diagnostic even when Apple sends no body: 403 is
// authentication, 400 is the token, 429 is rate, 5xx is Apple.
ok(summariseRefusals([attempt(429)]) === '429', 'a status with no body still reports the status')
ok(summariseRefusals([attempt(0)]) === 'no status and no reason from Apple',
  'and a refusal with NEITHER says that, rather than an empty string that reads as no refusal')
ok(summariseRefusals([attempt(403, 'InvalidProviderToken'), attempt(403, 'InvalidProviderToken')])
  === '403 InvalidProviderToken',
  'ten phones refused for one bad key is one fact, not ten')
ok(summariseRefusals([attempt(403, 'InvalidProviderToken'), attempt(410, 'Unregistered')])
  .split(', ').length === 2, '...but two different reasons are both reported')

// ── and says what to do about it ─────────────────────────────────────────────
const base = { configured: true, devices: 1, sent: 0, dead: 0 }
const keyRefused = pushTestMessage({ ...base, error: '403 InvalidProviderToken' })
ok(!keyRefused.ok, 'a refusal is not reported as a success')
ok(/InvalidProviderToken/.test(keyRefused.text),
  "Apple's own word survives to the screen - it is searchable, and it IS the answer")
ok(/APNS_KEY_ID/.test(keyRefused.text) && /APNS_PRIVATE_KEY/.test(keyRefused.text),
  '...and the sentence names the settings to go and check')
ok(/App Store Connect API key/.test(keyRefused.text),
  '...including the trap: two different .p8 files, and only one of them signs a push')

ok(/bundle id/i.test(pushTestMessage({ ...base, error: '400 TopicDisallowed' }).text),
  'a key that is not for this app points at the bundle id')
ok(/wait a minute/i.test(pushTestMessage({ ...base, error: '429 TooManyRequests' }).text),
  'rate limiting is not a misconfiguration and does not send anybody hunting')
ok(/Apple/.test(pushTestMessage({ ...base, error: '503 ServiceUnavailable' }).text),
  "Apple's own outage is named as Apple's")

// Unrecognised reasons pass through rather than being softened away.
const odd = pushTestMessage({ ...base, error: '400 SomethingNewApiInvented' })
ok(/SomethingNewApiInvented/.test(odd.text),
  'a reason nothing here recognises still reaches the screen verbatim')
ok(!/something went wrong/i.test(odd.text), '...and is never softened into "something went wrong"')
ok(apnsReasonHelp('400 SomethingNewApiInvented') === null,
  'apnsReasonHelp adds nothing when it has nothing to add, rather than guessing')
ok(apnsReasonHelp(undefined) === null, 'and it survives having no error at all')

// ── the branches that are NOT faults ─────────────────────────────────────────
// Three quite different causes, and only one of them is a fault. A screen that
// says "failed" to all three sends somebody hunting in the wrong place.
const notSetUp = pushTestMessage({ configured: false, devices: 0, sent: 0, dead: 0 })
ok(/Nothing is wrong with your phone/.test(notSetUp.text),
  'no keys on the server is not the phone owner\'s problem, and says so')
ok(/No phone is registered/.test(pushTestMessage({ ...base, devices: 0 }).text),
  'no phone registered is its own answer')
const worked = pushTestMessage({ ...base, sent: 1 })
ok(worked.ok, 'a send that worked reads as a success')
ok(/2 phones/.test(pushTestMessage({ ...base, sent: 2 }).text), '...and counts them')
// THE BUG. It said "Look at your phone" - written for somebody at a desk, and
// read by somebody holding the phone, in the app, on the exact screen it was
// pointing at. The reply was "where am I seeing what".
ok(!/look at your phone/i.test(worked.text),
  'it does not tell somebody holding the phone to go and look at their phone')
ok(/banner/i.test(worked.text) && /Notification Centre/i.test(worked.text),
  'it names WHERE the notification turns up, which is the thing that was missing')
ok(/banner/i.test(pushTestMessage({ ...base, sent: 2 }).text),
  '...for several phones as well as one')
// The branch above it says "on your phone" too, and there it is right: nothing
// is registered, so going to the phone genuinely is the next step.
ok(/on your phone/.test(pushTestMessage({ ...base, devices: 0 }).text),
  'the no-phone-registered branch still sends you to the phone, because there it is the answer')
ok(/removed or reinstalled/.test(pushTestMessage({ ...base, dead: 1 }).text),
  'a dead token is not a fault - the row has just been deleted, so "try again" is right')

// The line that started this. It is now reachable ONLY when Apple said
// literally nothing, instead of for every refusal there has ever been.
ok(/gave no reason why/.test(pushTestMessage(base).text),
  'no error at all still has a sentence')
ok(!/gave no reason why/.test(keyRefused.text),
  'THE REPORTED BUG: a refusal WITH a reason no longer claims there was none')

// ── 403 is not a dead phone ──────────────────────────────────────────────────
// Deleting tokens over a bad key would empty the table and turn a fixable
// mistake into a permanent one - every phone at once, for one wrong setting.
ok(classifyApns(200) === 'sent', '200 is sent')
ok(classifyApns(410, 'Unregistered') === 'dead', '410 is a phone that is gone')
ok(classifyApns(400, 'BadDeviceToken') === 'dead', 'so is a token Apple will never accept')
ok(classifyApns(403, 'InvalidProviderToken') === 'failed',
  '403 is OUR key, not their phone - marking it dead would delete every token we have')
ok(classifyApns(429, 'TooManyRequests') === 'failed', 'rate limiting deletes nothing either')
ok(classifyApns(500) === 'failed', "nor does Apple's own outage")

// ── the reason has to survive every layer, not just the first ────────────────
const push = code('lib/push.ts')
ok(/failed: failed\.length/.test(push), 'sendPush counts the refusals it used to filter past')
ok(/error: failed\.length \? summariseRefusals\(failed\)/.test(push),
  '...and reports why, which is the fact that was being dropped')
const notify = code('lib/notify.ts')
ok(/Promise<PhonePushResult>/.test(notify),
  'pushToPhones returns more than a count - a bare number cannot carry a reason')
ok(/console\.error\(`\[push\]/.test(notify),
  'a REAL notification has no screen to report on, so a refusal goes to the log')
const testRoute = code('app/api/me/push-test/route.ts')
ok(/error: push\.error/.test(testRoute), 'and the test button passes it to the sentence builder')

// ═════════════════════════════════════════════════════════════════════════════
// THE KEY, which is where it actually stopped.
//
// Send test finally named the failure and it was not Apple's:
//
//     error:1E08010C:DECODER routines::unsupported
//
// That is OpenSSL, from our own signing step - Node could not parse the APNs
// private key, so nothing was ever sent and Apple was never contacted. A PEM is
// only valid WITH its line breaks and a dashboard field eats them. The codebase
// already knew this: it is exactly why the Codemagic signing certificate is
// carried base64-encoded. The other key was left to chance.
//
// Real keys, mangled the way a web form mangles them, and checked by actually
// signing with them. No network, no Apple, no phone.
// ═════════════════════════════════════════════════════════════════════════════
const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString()

const signsWith = (key: string): boolean => {
  try {
    apnsJwt({ keyId: 'K', teamId: 'T', privateKey: key, bundleId: 'b', host: 'h' })
    return true
  } catch { return false }
}

// The three manglings, each of which really does produce that exact error.
ok(!signsWith(pem.replace(/\n/g, '')), 'a key with its line breaks stripped cannot sign - the reported bug')
ok(!signsWith(pem.replace(/\n/g, ' ')), '...nor one whose line breaks became spaces')
ok(!signsWith(pem.replace(/\n/g, '\\n')), '...nor one whose line breaks became the characters backslash-n')

ok(signsWith(normalizePrivateKey(pem)), 'an intact key still signs after normalising')
ok(signsWith(normalizePrivateKey(pem.replace(/\n/g, ''))), 'stripped line breaks are rebuilt')
ok(signsWith(normalizePrivateKey(pem.replace(/\n/g, ' '))), 'so are spaces')
ok(signsWith(normalizePrivateKey(pem.replace(/\n/g, '\\n'))), 'so is backslash-n')
ok(signsWith(normalizePrivateKey(`  ${pem}  `)), 'so is one with stray whitespace around it')
ok(signsWith(normalizePrivateKey(Buffer.from(pem).toString('base64'))),
  'and a whole PEM base64ed to get through a one-line field')
// A bare body with no BEGIN/END at all - somebody pasting "just the key part".
ok(signsWith(normalizePrivateKey(pem.replace(/-----[A-Z ]+-----/g, '').replace(/\s/g, ''))),
  'and a bare base64 body with the header lines missing')

// The label is preserved. An EC key in SEC1 form is not PKCS#8, and relabelling
// it would produce a key that decodes to the wrong thing.
const sec1 = privateKey.export({ type: 'sec1', format: 'pem' }).toString()
ok(/BEGIN EC PRIVATE KEY/.test(normalizePrivateKey(sec1.replace(/\n/g, ''))),
  'an EC key keeps its own header rather than being relabelled PKCS#8')
ok(signsWith(normalizePrivateKey(sec1.replace(/\n/g, ''))), '...and still signs')

ok(normalizePrivateKey('') === '', 'nothing in, nothing out')
ok(normalizePrivateKey(undefined) === '', '...and a missing variable is not a crash')
ok(normalizePrivateKey('   ') === '', 'nor is whitespace')

// apnsConfig reads it through the normaliser, so the whole app benefits.
const cfg = apnsConfig({
  APNS_KEY_ID: 'ABC123', APNS_TEAM_ID: 'TEAM01',
  APNS_PRIVATE_KEY: pem.replace(/\n/g, ''),
} as any)
ok(!!cfg, 'a mangled key still configures push rather than reading as "not set up"')
ok(!!cfg && signsWith(cfg.privateKey), '...and the key it hands out actually signs')
ok(!!cfg && createPrivateKey(cfg.privateKey).asymmetricKeyType === 'ec', '...as the EC key it is')

// ── and it is reported as OURS, not Apple's ──────────────────────────────────
const keyFault = pushTestMessage({
  ...base, error: `${KEY_UNREADABLE}: error:1E08010C:DECODER routines::unsupported`,
})
ok(!/Apple refused/.test(keyFault.text),
  'a key we cannot read is NOT reported as Apple refusing - that sends somebody to the wrong end')
ok(/SyteNav could not sign/.test(keyFault.text), '...it says whose fault it is')
ok(/APNS_PRIVATE_KEY/.test(keyFault.text), '...and which setting to re-paste')
ok(/BEGIN and END/.test(keyFault.text), '...and that the whole file is wanted, line breaks included')
ok(/DECODER routines/.test(keyFault.text),
  '...while still carrying the raw error, which is the searchable part')
ok(/APNS_PRIVATE_KEY/.test(apnsReasonHelp('error:1E08010C:DECODER routines::unsupported') ?? ''),
  'the raw OpenSSL error is recognised even without our own prefix')

// ── the native half, which is where the token actually arrives ───────────────
// THE REAL BUG. Permission granted, register() called, device_tokens empty, no
// error on either side. Apple hands the token to the app delegate by calling
// these two methods; they did not exist, so it was delivered to nobody - and
// the failure case went the same way, which is why registrationError never
// fired either. `npx cap sync` does not add them: the app delegate is our file.
const appDelegate = read('ios/App/App/AppDelegate.swift')
ok(/didRegisterForRemoteNotificationsWithDeviceToken/.test(appDelegate),
  'the app delegate receives the device token from Apple')
ok(/capacitorDidRegisterForRemoteNotifications/.test(appDelegate),
  '...and forwards it, or the plugin never turns it into a `registration` event')
ok(/didFailToRegisterForRemoteNotificationsWithError/.test(appDelegate),
  'and it receives the failure')
ok(/capacitorDidFailToRegisterForRemoteNotifications/.test(appDelegate),
  '...and forwards that too - silence on both paths is what made this invisible')
ok(/CapacitorPushNotifications/.test(read('ios/App/Podfile')),
  'the native plugin is actually in the build')
ok(/aps-environment/.test(read('ios/App/App/App.entitlements')),
  'and the app is entitled to talk to Apple at all')

// ── the card reads it ────────────────────────────────────────────────────────
const card = code('components/settings/notification-settings.tsx')
ok(/pushStateNote\(pushState\)/.test(card), 'the card says what was recorded')
ok(!/No phone registered yet\. Open SyteNav on your phone/.test(card),
  'the hardcoded advice is gone from the component - it is a fallback now, not the only answer')
ok(/setPushState\(readPushState\(\)\)/.test(card), 'it is read on mount')
ok(!/useState.*readPushState\(\)/.test(card),
  '...not during render, which would not match what the server sent')
ok(/pushStateWhen\(pushState\)/.test(card), 'and dated, so a retry is visible')

done()
