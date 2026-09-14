// The login that worked, three times, and sent you back to the login screen.
//
// "I'm having a hard time logging in now. It's blank or just loading forever."
// The password was never wrong. From the production trace of one attempt:
//
//   13:32:54  POST /auth/v1/token   200   <- sign-in SUCCEEDED
//   13:32:55  GET  /dashboard       307   <- bounced straight back
//   13:32:58  GET  /login           200
//   13:32:58  GET  /auth/v1/user    502
//   13:33:01  GET  /auth/v1/user    502
//   13:33:54  GET  /forgot-password 304   <- so they went to reset the password
//
// Supabase's own auth server was answering `/user` in 2-4ms throughout; the
// 502s and 504s came off the gateway in front of it and never reached it.
//
// Every gate in the app read that failure as a verdict - `const { data: {
// user } } = await getUser(); if (!user) redirect('/login')` - because `user`
// is null for "nobody is signed in" AND for "could not ask", and the `error`
// beside it was dropped. Middleware bounced /dashboard to /login; the layout
// behind it would have done the same. So there are three answers now, and the
// one that means nothing may not be routed on.

import { authOutcome, treatAsSignedIn } from '../auth-outcome'
import { checkAuth } from '../supabase/auth-check'
import { ok, done, code } from './_helpers'

// ── a verdict, and a failure to get one ─────────────────────────────────────
ok(authOutcome({ user: { id: 'u1' } }) === 'signed-in', 'a user is a user')
ok(authOutcome({ user: null }) === 'signed-out',
  'no user and no error is the real "nobody is signed in"')

// 4xx: the auth server is telling us about THIS TOKEN, and may be believed.
ok(authOutcome({ user: null, error: { status: 401 } }) === 'signed-out',
  'a 401 is a verdict about the token')
ok(authOutcome({ user: null, error: { status: 400, code: 'refresh_token_not_found' } }) === 'signed-out',
  'a missing refresh token is a verdict too - that session really is gone')
ok(authOutcome({ user: null, error: { status: 403 } }) === 'signed-out', 'so is a 403')

// 5xx / 0 / nothing: the question never got an answer. THE REPORTED BUG.
ok(authOutcome({ user: null, error: { status: 502 } }) === 'unknown',
  'THE BUG: a 502 from the gateway says nothing about the user')
ok(authOutcome({ user: null, error: { status: 504 } }) === 'unknown', '...and neither does a 504')
ok(authOutcome({ user: null, error: { status: 500 } }) === 'unknown', '...or a 500')
ok(authOutcome({ user: null, error: { status: 0 } }) === 'unknown',
  'a status of 0 is the fetch never landing')
ok(authOutcome({ user: null, error: { name: 'TypeError' } }) === 'unknown',
  'an error with no status at all is not a verdict either')
ok(authOutcome({ user: null, error: { name: 'AuthRetryableFetchError' } }) === 'unknown',
  'the auth library has its own name for this group, and it is honoured')
ok(authOutcome({ user: null, timedOut: true }) === 'unknown',
  'and a check that never came back is the plainest case of all')

// ── which way to guess ──────────────────────────────────────────────────────
//
// Signed in, because only one of the wrong guesses can be taken back: a wrong
// "signed in" is corrected by the page that asks again, while a wrong "signed
// out" has already thrown the session's place in the app away.
ok(treatAsSignedIn('signed-in'), 'a verified user is routed as signed in')
ok(treatAsSignedIn('unknown'), 'THE FIX: so is somebody we could not check')
ok(!treatAsSignedIn('signed-out'), 'only a real verdict routes as signed out')

// ── the timer no longer impersonates a logged-out user ──────────────────────
const mw = code('middleware.ts')
ok(!/resolve\(\{ data: \{ user: null \} \}\)/.test(mw),
  'THE SHAPE THAT CAUSED IT: the timeout no longer resolves the shape of "nobody is signed in"')
ok(/checkAuth\(supabase/.test(mw), 'middleware goes through checkAuth')
ok(/treatAsSignedIn\(outcome\)/.test(mw), '...and routes on the three-way answer')
ok(/!maybeSignedIn && isProtectedRoute/.test(mw),
  'the protected-route bounce fires only on a real verdict')
ok(!/!user && isProtectedRoute/.test(mw), '...not on any null, which is what it used to do')
ok(/if \(user && \(isAuthRoute \|\| isRoot\)\)/.test(mw),
  'and the other direction still needs a VERIFIED user: an unknown must not push anyone off /login')
ok(/maybeSignedIn \? '\/dashboard' : '\/login'/.test(mw),
  'the app root guesses signed in when it cannot tell')

// ── and the gates behind it, which would otherwise bounce instead ───────────
for (const [file, label] of [
  ['app/(dashboard)/layout.tsx', 'the dashboard'],
  ['app/field/layout.tsx', 'Field Mode'],
  ['app/admin/layout.tsx', 'the admin console'],
] as const) {
  const src = code(file)
  ok(/outcome === 'signed-out'/.test(src) && /redirect\('\/login'\)/.test(src),
    `${label} sends you to /login for a verdict`)
  ok(/<AuthUnavailable \/>/.test(src), `...and says so instead when it could not ask`)
  ok(!/const \{ data: \{ user \} \} = await supabase\.auth\.getUser\(\)/.test(src),
    `...rather than reading the user straight off getUser, which cannot tell the two apart`)
}

// A layout must not gate on currentUser(): it returns the user or null and has
// no way to say which kind of null it is.
const dash = code('app/(dashboard)/layout.tsx')
ok(/currentAuth\(\)/.test(dash) && !/await currentUser\(\)/.test(dash),
  'the dashboard gate asks currentAuth, not currentUser')

// ── the screen itself ───────────────────────────────────────────────────────
const screen = code('components/layout/auth-unavailable.tsx')
ok(/Can&apos;t reach the sign-in service/.test(screen), 'the screen names what failed')
ok(/not your password/.test(screen),
  'THE POINT OF IT: it says this is not the password, because the trace has them opening the reset page twice')
ok(/window\.location\.reload\(\)/.test(screen), 'and offers a way to ask again')

// The only asynchronous part, and it goes last: tsconfig's module target does
// not allow a top-level await, so the suite ends inside the IIFE.
void (async () => {
  // ── asking: bounded, and retried only when there was no answer ──────────────
  const client = (answers: Array<{ user?: unknown; error?: unknown; hang?: boolean }>) => {
    let n = 0
    return {
      calls: () => n,
      auth: {
        getUser: async () => {
          const a = answers[Math.min(n++, answers.length - 1)]
          if (a.hang) return new Promise<never>(() => {})
          return { data: { user: a.user ?? null }, error: a.error }
        },
      },
    }
  }

  let c = client([{ user: { id: 'u1' } }])
  let got = await checkAuth(c, { attempts: 2 })
  ok(got.outcome === 'signed-in' && got.user?.id === 'u1', 'a good answer comes back with the user')
  ok(c.calls() === 1, '...on the first ask, with no retry')

  c = client([{ error: { status: 401 } }])
  got = await checkAuth(c, { attempts: 2 })
  ok(got.outcome === 'signed-out' && c.calls() === 1,
    'a VERDICT is never re-litigated - one ask, and it stands')

  c = client([{ error: { status: 502 } }, { user: { id: 'u1' } }])
  got = await checkAuth(c, { attempts: 2 })
  ok(c.calls() === 2, 'a gateway blip is asked again')
  ok(got.outcome === 'signed-in' && got.user?.id === 'u1',
    '...which is what turns the reported failure back into a normal page load')

  c = client([{ error: { status: 502 } }])
  got = await checkAuth(c, { attempts: 2 })
  ok(got.outcome === 'unknown' && got.user === null && c.calls() === 2,
    'and when it never answers, the answer is unknown - not "signed out"')

  c = client([{ hang: true }])
  const began = Date.now()
  got = await checkAuth(c, { attempts: 1, timeoutMs: 60 })
  ok(got.outcome === 'unknown', 'a request that hangs is unknown')
  ok(Date.now() - began < 1000, '...and it is still bounded, so nothing waits on it')

  done()
})()
