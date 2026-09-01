// ─────────────────────────────────────────────────────────────────────────────
// Who may run a scheduled job.
//
// THE BUG. The guard read:
//
//     if (!isVercelCron && secret && provided !== secret) return 401
//
// The `secret &&` is the whole problem. With CRON_SECRET unset the condition is
// false, so the check falls through and THE JOB RUNS - for anyone who requests
// the URL. A guard that only holds when an optional value happens to be set is
// not a guard. Exactly the shape of the dashboard activity filter in #342,
// where a blank full_name skipped the filter and showed the whole company.
//
// The consequence here is smaller than that one - the job sends compliance
// reminder emails, so the worst case is reminder spam and a burnt SendGrid
// quota - but the shape is identical and it is one line to close.
//
// HOW VERCEL CRON AUTHENTICATES. When CRON_SECRET is set in the project's
// environment, Vercel sends it automatically on every scheduled invocation as
// `Authorization: Bearer <CRON_SECRET>`. So the bearer check IS the check: once
// the variable exists, the scheduled run satisfies it with no special case, and
// nothing else can.
//
// Until it exists there is nothing to compare against, and this deliberately
// does NOT fall back to running. It refuses with `unconfigured`, which the
// route turns into a 503 that names the missing variable - a refusal somebody
// can act on rather than a silent open door.
//
// The `x-vercel-cron` header is honoured only in that unconfigured state, and
// only so the daily job keeps working in the window between this shipping and
// CRON_SECRET being set. It is not a substitute for the secret: it is a plain
// request header, so treating it as proof of origin is trusting the caller.
// Once CRON_SECRET is set, the header stops mattering entirely.
// ─────────────────────────────────────────────────────────────────────────────

export type CronAuth =
  /** Run it. */
  | { ok: true }
  /** A secret is configured and this caller did not present it. */
  | { ok: false; status: 401; error: string }
  /** No secret is configured, so nothing can be verified. */
  | { ok: false; status: 503; error: string }

/**
 * Pure, so the decision can be tested without a server. Takes what it needs
 * rather than reaching for `process.env` and `Request` itself - the same reason
 * lib/permissions.ts and lib/invoice-budget.ts are shaped this way.
 */
export function checkCronAuth(input: {
  /** process.env.CRON_SECRET */
  secret?: string | null
  /** The Authorization header, verbatim. */
  authorization?: string | null
  /** ?secret= on the URL, for a manual trigger from a browser. */
  querySecret?: string | null
  /** Whether the request carried x-vercel-cron. */
  isVercelCron?: boolean
}): CronAuth {
  const secret = (input.secret ?? '').trim()
  const bearer = (input.authorization ?? '').replace(/^Bearer\s+/i, '').trim()
  const provided = bearer || (input.querySecret ?? '').trim()

  if (!secret) {
    // Nothing to check against. Let the platform's own scheduled call through
    // so the job does not stop, and refuse everybody else with a reason.
    if (input.isVercelCron) return { ok: true }
    return {
      ok: false,
      status: 503,
      error: 'This job is not configured. Set CRON_SECRET in the environment.',
    }
  }

  // Length first: comparing a short string against a long one can exit early,
  // and this is a secret comparison.
  if (provided.length !== secret.length || !timingSafeEqual(provided, secret)) {
    return { ok: false, status: 401, error: 'Unauthorized' }
  }
  return { ok: true }
}

/**
 * Constant-time compare over equal-length strings.
 *
 * `===` on a secret returns as soon as two characters differ, so how long it
 * takes leaks how much of the prefix was right. Not the likeliest attack on a
 * daily cron endpoint, but this is four lines and the alternative is a habit of
 * comparing secrets with `===` spreading to somewhere it does matter.
 */
function timingSafeEqual(a: string, b: string): boolean {
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
