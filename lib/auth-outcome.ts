// ─────────────────────────────────────────────────────────────────────────────
// "Nobody is signed in" and "I could not ask" are different answers, and only
// one of them means go to the login screen.
//
// THE BUG. Reported as "I'm having a hard time logging in now - it's blank or
// just loading forever." The password was never wrong. Read the production
// trace of one attempt:
//
//   13:32:54  POST /auth/v1/token        200   <- the sign-in WORKED
//   13:32:55  GET  /dashboard            307   <- and was thrown straight back
//   13:32:58  GET  /login                200
//   13:32:58  GET  /auth/v1/user         502
//   13:33:01  GET  /auth/v1/user         502
//   13:33:54  GET  /forgot-password      304   <- so they went to reset it
//
// Three sign-ins in ninety seconds, three bounces, then the password reset
// page - twice. The auth server itself was answering `/user` in 2-4ms the
// whole time; the 502s and 504s never reached it, they came off the gateway in
// front of it, intermittently.
//
// Every gate in this app read that failure as a verdict:
//
//   const { data: { user } } = await supabase.auth.getUser()
//   if (!user) redirect('/login')
//
// `user` is null when nobody is signed in AND when the question could not be
// asked, the `error` beside it is dropped on the floor, and the answer to both
// is to bounce you to the login screen. So a signed-in user pressing Sign In
// succeeded, was told to sign in, succeeded, was told to sign in. That is the
// loop, and it is exactly the fault already written down for permissions:
// A CHECK THAT FAILED ANSWERS EXACTLY LIKE A REJECTION. One layer lower it
// does not hide a button, it throws away the session.
//
// So: three outcomes, not two.
// ─────────────────────────────────────────────────────────────────────────────

export type AuthOutcome =
  /** A verified user came back. */
  | 'signed-in'
  /** The auth server answered, and the answer is no. A real verdict. */
  | 'signed-out'
  /** The auth server did not answer. NOT a verdict - we know nothing. */
  | 'unknown'

export interface AuthAnswer {
  user: { id: string } | null | undefined
  /** Whatever `getUser()` returned or threw. */
  error?: { name?: string; status?: number | null; code?: string } | null
  /** The check never came back inside its budget. */
  timedOut?: boolean
}

/**
 * Which of the three did we just get?
 *
 * The line between a verdict and a failure is the STATUS. A 4xx is the auth
 * server telling us about this token - expired, missing, malformed, revoked -
 * and it is entitled to be believed. A 5xx, a status of 0, or no status at all
 * is the request never getting an answer: a gateway, a timeout, a dropped
 * connection. Nothing about the user is known from that.
 *
 * `AuthRetryableFetchError` is the auth library's own name for the second
 * group, so it is honoured by name as well as by number - being wrong here in
 * the "signed-out" direction is what the whole file exists to stop.
 */
export function authOutcome(answer: AuthAnswer): AuthOutcome {
  if (answer.timedOut) return 'unknown'
  if (answer.user) return 'signed-in'

  const error = answer.error
  if (!error) return 'signed-out'

  if (error.name === 'AuthRetryableFetchError') return 'unknown'

  const status = error.status
  if (status == null || status === 0 || status >= 500) return 'unknown'

  return 'signed-out'
}

/**
 * When we do not know, which way do we guess?
 *
 * SIGNED IN, always - and the reason is that only one of the two wrong guesses
 * can be taken back.
 *
 * Guess "signed in" for somebody who is not, and the page they reach asks the
 * question again a moment later, gets a real answer, and sends them to the
 * login screen. One extra hop, right outcome.
 *
 * Guess "signed out" for somebody who is, and you have sent them to the login
 * screen - where signing in returns them to the page that guessed wrong, which
 * guesses wrong again. Nothing downstream can recover it, because the guess
 * threw away the only thing that could: their session's place in the app.
 *
 * That asymmetry is the whole routing rule. It is NOT a security decision -
 * routing is UX here, and every page, route and query verifies for itself.
 */
export function treatAsSignedIn(outcome: AuthOutcome): boolean {
  return outcome !== 'signed-out'
}
