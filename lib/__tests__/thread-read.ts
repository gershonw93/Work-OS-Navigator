// A screenshot of "Could not load the messages" over a selection thread whose
// messages were all there - one posted to it a minute before, while production
// was deploying. One read that did not come back blanked a conversation.

import { readThread, retryable } from '../thread-read'
import { ok, done, code } from './_helpers'

const res = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as unknown as Response
const noWait = async () => {}

async function main() {
  ok(retryable(0) && retryable(500) && retryable(503) && retryable(401), 'no answer, a server error or a mid-refresh session is asked again')
  ok(!retryable(403) && !retryable(404) && !retryable(400), '...a refusal is a verdict and is not')

  let calls = 0
  const flaky = await readThread(async () => { calls++; if (calls === 1) throw new TypeError('Load failed'); return res(200, { messages: [{ id: 'a' }] }) }, noWait)
  ok(flaky.ok && flaky.messages.length === 1 && calls === 2, 'a dropped connection is tried once more and the second answer is used')

  calls = 0
  const down = await readThread(async () => { calls++; return res(503, { error: 'x' }) }, noWait)
  ok(!down.ok && calls === 2 && down.status === 503, '...twice, not for ever, and the failure keeps its status')

  calls = 0
  const forbidden = await readThread(async () => { calls++; return res(403, { error: 'This job belongs to another company.' }) }, noWait)
  ok(!forbidden.ok && calls === 1 && forbidden.error === 'This job belongs to another company.', 'a 403 is not retried, and its reason survives for the log')

  const thread = code('components/quotes/bid-thread.tsx')
  ok(/state !== 'loading' && messages\.map/.test(thread), 'a failed re-read keeps the messages already on screen')
  ok(/Could not check for new messages/.test(thread), '...and says it could not CHECK, not that there is nothing')

  for (const f of ['components/client-thread/client-thread-panel.tsx', 'components/client-thread/portal-thread.tsx']) {
    const src = code(f)
    ok(/readThread</.test(src) && /console\.error\(/.test(src), `${f} reads through the retry and logs a failure`)
    ok(/if \(d\.message\) setMessages/.test(src), `${f} shows a message it just saved even if the re-read fails`)
  }
  done()
}
main()
