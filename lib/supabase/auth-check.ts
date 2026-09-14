import { authOutcome, type AuthOutcome } from '@/lib/auth-outcome'

/**
 * Ask the auth server who this is, and come back with WHICH of the three
 * answers it gave. See lib/auth-outcome.ts for why there are three.
 *
 * Runtime-agnostic on purpose: it takes a client rather than building one, so
 * the same code runs in Edge middleware and in a Server Component.
 */

export interface AuthCheck {
  outcome: AuthOutcome
  /** Only ever set for 'signed-in'. */
  user: AuthedUser | null
}

// Structural, not the SDK's User: this module must not drag the auth types
// into the Edge bundle, and every caller wants the same three fields.
export interface AuthedUser {
  id: string
  email?: string | null
  [key: string]: unknown
}

interface AuthClient {
  auth: { getUser: () => Promise<{ data: { user: unknown }; error?: unknown }> }
}

/** Not a real answer - the marker the timeout resolves with. */
const TIMED_OUT = { timedOut: true } as const

async function attempt(client: AuthClient, timeoutMs: number): Promise<AuthCheck> {
  // BOUNDED, so a gateway that has stopped answering degrades in a few seconds
  // instead of holding the request until the platform kills it. The timer used
  // to resolve `{ data: { user: null } }` - the shape of a real "nobody is
  // signed in" - which is precisely how a hung request came to read as a
  // logged-out user and bounce people to /login. It resolves a marker now.
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const raced = await Promise.race([
      client.auth.getUser().then(r => ({ data: r.data, error: r.error })).catch(e => ({
        // getUser() RETURNS auth errors but THROWS anything it does not
        // recognise - a DNS failure, an aborted socket. Both are the same fact
        // here, so both go through authOutcome rather than up the stack.
        data: { user: null }, error: e as { name?: string; status?: number },
      })),
      new Promise<typeof TIMED_OUT>(resolve => { timer = setTimeout(() => resolve(TIMED_OUT), timeoutMs) }),
    ])

    if ('timedOut' in raced) return { outcome: 'unknown', user: null }

    const user = (raced.data?.user ?? null) as AuthedUser | null
    const outcome = authOutcome({
      user,
      error: raced.error as { name?: string; status?: number } | null | undefined,
    })
    return { outcome, user: outcome === 'signed-in' ? user : null }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * `attempts` is how many times to ASK, and a second ask only ever happens for
 * 'unknown' - a verdict is never re-litigated.
 *
 * Worth doing where the caller has to render something either way (a layout):
 * the failures this exists for are gateway blips a few hundred milliseconds
 * wide, and the auth server answers in single-digit milliseconds when the
 * request reaches it, so one retry turns most of them into a normal page.
 *
 * NOT worth doing in middleware, which has somewhere better to put an
 * 'unknown' than a second wait: carry on and let the page ask.
 */
export async function checkAuth(
  client: AuthClient,
  { attempts = 1, timeoutMs = 3000 }: { attempts?: number; timeoutMs?: number } = {},
): Promise<AuthCheck> {
  let last: AuthCheck = { outcome: 'unknown', user: null }
  for (let i = 0; i < Math.max(1, attempts); i++) {
    last = await attempt(client, timeoutMs)
    if (last.outcome !== 'unknown') return last
  }
  return last
}
