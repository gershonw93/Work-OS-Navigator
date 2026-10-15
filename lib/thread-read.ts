// Reading a message thread, once more before giving up.
//
// Reported as a screenshot: "Could not load the messages" over a selection
// thread whose messages were all there - one had been posted to it a minute
// earlier, while production was deploying. One read that did not come back
// (a dropped connection, a function swapped mid-deploy, a session token
// refreshed under the request) blanked a conversation that had been on the
// screen, and the only way out offered was to reload the page.
//
// So: a read that failed to ASK (no response, a 5xx, a 401 that a refreshed
// session may fix) is tried once more. A 403 or a 404 is a verdict and is not.
// And a read that still fails says so beside the messages the screen already
// had, never instead of them - `BidThread` keeps them on screen.

export const RETRY_DELAY_MS = 800

export type ThreadRead<T> =
  | { ok: true; messages: T[] }
  | { ok: false; status: number; error: string | null }

/** Worth asking again: nothing came back, the server fell over, or the session was mid-refresh. */
export function retryable(status: number): boolean {
  return status === 0 || status === 401 || status >= 500
}

export async function readThread<T>(
  load: () => Promise<Response>,
  wait: (ms: number) => Promise<void> = ms => new Promise(r => setTimeout(r, ms)),
): Promise<ThreadRead<T>> {
  let last: ThreadRead<T> = { ok: false, status: 0, error: null }
  for (let attempt = 0; attempt < 2; attempt++) {
    if (attempt) await wait(RETRY_DELAY_MS)
    try {
      const res = await load()
      const d = await res.json().catch(() => ({} as any))
      if (res.ok) return { ok: true, messages: (d.messages ?? []) as T[] }
      last = { ok: false, status: res.status, error: typeof d.error === 'string' ? d.error : null }
    } catch {
      last = { ok: false, status: 0, error: null }
    }
    if (!retryable(last.status)) break
  }
  return last
}
