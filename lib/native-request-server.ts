import { headers } from 'next/headers'
import { isIosShellRequest } from './native-request'

/**
 * Is the request being handled right now from the iOS app? Server only - reads
 * the live request through `next/headers`, so a caller does not have to thread
 * `req` down through `billingLock` and its twenty call sites.
 *
 * Outside a request (a cron, a test) there are no headers to read and the
 * answer is false: the web wording, which is what every non-app sender has
 * always used.
 */
export function requestIsIosShell(): boolean {
  try {
    const h = headers()
    return isIosShellRequest(h.get('user-agent'), h.get('cookie'))
  } catch {
    return false
  }
}
