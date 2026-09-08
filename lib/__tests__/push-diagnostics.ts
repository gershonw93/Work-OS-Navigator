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

import {
  PUSH_STAGES, pushStateNote, pushStateWhen, readPushState, writePushState,
  type PushStage, type PushState,
} from '../push-state'
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
