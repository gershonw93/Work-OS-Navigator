// ─────────────────────────────────────────────────────────────────────────────
// What happened the last time this phone tried to register for notifications.
//
// THE BUG. An iPhone running SyteNav from TestFlight was asked for notification
// permission, the person tapped Allow, and no device token was ever saved.
// `device_tokens` had zero rows. Between "permission granted" and "token saved"
// `use-push.ts` had six ways to stop and NOT ONE of them said anything:
//
//     if (!ready || !isNative) return
//     if (status.receive !== 'granted' || cancelled) return
//     if (!jwt || !value) return
//     addListener('registrationError', () => {})      // Apple's reason, binned
//     } catch { }                                     // twice
//
// The silence was deliberate and, for a background convenience, right: nobody
// should get an error popup about a feature they never asked for. But it left
// the one screen that exists to answer "why am I not getting notifications"
// telling somebody standing INSIDE the app on their phone to "open SyteNav on
// your phone, sign in, and allow notifications when it asks" - advice they had
// already followed, printed with total confidence, from a screen that knew
// nothing.
//
// So the hook records its outcome here and the card reads it. That is all this
// is. No alerts, no toasts, no banner on launch - the silence stays where it
// belongs, and the screen already asking the question becomes able to answer it.
//
// Deliberately localStorage and not the server: a diagnostic that needs the
// server in order to report that it could not reach the server is not a
// diagnostic. It is also per-device, which is exactly right - "did THIS phone
// register" is not a fact about the account.
// ─────────────────────────────────────────────────────────────────────────────

import { formatDate } from './dates'

/**
 * The trail, not only the endings.
 *
 * FIRST VERSION RECORDED ONLY THE EXITS, and that was not enough. On a phone
 * whose permission had been granted days earlier, the code sailed past `denied`,
 * attached its listeners, called `register()` - and Apple never answered,
 * because the app delegate had no method to receive the answer. No exit was
 * taken, so nothing was written, so the card showed the same sentence as a
 * phone that had never run the code at all. Three different facts, one line of
 * text: the exact fault this file exists to fix, reproduced inside the fix.
 *
 * `starting` and `registering` are positions rather than outcomes. They are the
 * two that say "we got this far and stopped", which is what no ending can.
 */
export const PUSH_STAGES = [
  'starting',       // the hook ran. No record at all means it never did.
  'not_native',     // a browser. Push cannot work here and never could.
  'unavailable',    // the notification plugin did not start at all.
  'denied',         // permission refused. iOS will not ask twice.
  'registering',    // asked Apple, waiting for the answer.
  'apple_refused',  // registrationError fired - carries Apple's own reason.
  'no_session',     // the token arrived before anyone was signed in.
  'save_failed',    // Apple gave us the token, SyteNav could not store it.
  'registered',     // saved.
] as const

export type PushStage = (typeof PUSH_STAGES)[number]

export type PushState = {
  stage: PushStage
  /** Apple's wording, or the HTTP status - whatever names the actual failure. */
  reason?: string
  /** ISO timestamp of the attempt. Read: the card dates the failure, because
   *  "close the app and try again" is useless if you cannot tell a fresh
   *  failure from the one you already retried. */
  at: string
}

const KEY = 'sytenav-push-state'

const isStage = (v: unknown): v is PushStage =>
  typeof v === 'string' && (PUSH_STAGES as readonly string[]).includes(v)

/** The last recorded outcome, or null if there isn't one we understand. */
export function readPushState(): PushState | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // A stage this build does not know about (an older app, a newer one) is
    // not a reason to render an empty card - fall back to the general advice.
    if (!parsed || !isStage(parsed.stage)) return null
    return {
      stage: parsed.stage,
      reason: typeof parsed.reason === 'string' && parsed.reason.trim() ? parsed.reason.trim() : undefined,
      at: typeof parsed.at === 'string' ? parsed.at : '',
    }
  } catch {
    return null
  }
}

/** Record an outcome. Never throws - private mode, quota, an old iOS, anything. */
export function writePushState(stage: PushStage, reason?: string): void {
  try {
    const text = String(reason ?? '').trim()
    const state: PushState = { stage, at: new Date().toISOString() }
    if (text) state.reason = text.slice(0, 200)
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch { /* the card falls back to the general advice */ }
}

const RETRY = 'Close SyteNav completely and open it again to try once more.'

const GENERAL =
  'No phone registered yet. Open SyteNav on your phone, sign in, and allow '
  + 'notifications when it asks.'

/**
 * What to tell somebody whose account has NO phone on file.
 *
 * Only ever rendered in that case - when a phone IS registered the card says
 * so, with the date it was last seen, and none of this applies.
 */
export function pushStateNote(state: PushState | null): string {
  // No record: either a browser that has not run the hook yet, or a phone on a
  // build older than this one. The old advice is the right advice here.
  if (!state) return GENERAL

  switch (state.stage) {
    // Distinct from the no-record default ON PURPOSE. They used to share this
    // sentence - "a browser, so the advice is right" - and that identical
    // wording is what made "the code never ran" and "the code ran and said this
    // is a browser" indistinguishable on the one screen that had to tell them
    // apart.
    case 'not_native':
      return 'You are looking at SyteNav in a web browser. Notifications that pop up '
        + 'on the phone itself only work in the SyteNav app - open it there, sign in, '
        + 'and allow notifications when it asks.'

    case 'starting':
      return 'This phone began registering and did not get as far as asking Apple. '
        + RETRY

    // The one that names the real answer. Apple hands the token to the app
    // delegate; if the app build has no method to receive it, register()
    // succeeds and nothing else ever happens - no token, and no error either.
    case 'registering':
      return 'This phone asked Apple for an address and Apple has not answered. '
        + RETRY + ' If it stays on this, the app build cannot receive the answer '
        + 'and a new one is needed - nothing you can do on the phone will fix it.'

    case 'unavailable':
      return 'Notifications could not start on this phone. ' + RETRY
        + ' If it keeps happening, reinstall SyteNav from TestFlight.'

    case 'denied':
      return 'Notifications are switched off for SyteNav on this phone. Turn them '
        + 'back on in iPhone Settings → Notifications → SyteNav. iOS does not ask '
        + 'a second time, so the app cannot do this for you.'

    case 'apple_refused':
      return 'Apple would not register this phone'
        + (state.reason ? `: ${state.reason}. ` : '. ') + RETRY

    case 'no_session':
      return 'This phone asked for an address before you were signed in, so there '
        + 'was nowhere to save it. ' + RETRY

    case 'save_failed':
      return 'Apple gave this phone an address, but SyteNav could not save it'
        + (state.reason ? ` (${state.reason})` : '') + '. ' + RETRY

    // Registered here, absent there. The row was released - a sign-out on this
    // phone hands the address back, and the app has not registered since.
    case 'registered':
      return 'This phone registered, but SyteNav has no address on file for it any '
        + 'more. Sign out and back in on the phone to register it again.'
  }
}

/**
 * "Last tried Sep 8, 2026 at 2:14 PM", or null when the date says nothing.
 *
 * Without it, "close the app and try again" is advice you cannot follow: after
 * retrying, the card looks identical whether it retried and failed again or
 * never ran at all.
 */
export function pushStateWhen(state: PushState | null): string | null {
  if (!state || state.stage === 'not_native') return null
  // The '' fallback is what handles a missing or unparseable timestamp - an
  // explicit `!state.at` guard in front of it looked careful and covered
  // nothing, so the test for it could never go red.
  const when = formatDate(state.at, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }, '')
  if (!when) return null
  const verb = state.stage === 'registered' ? 'Registered' : 'Last tried'
  // The raw stage alongside it. It reads as a code because it is one, and it
  // turns "which of these sentences do you see" into "read me the word".
  return `${verb} ${when} · ${state.stage}`
}
