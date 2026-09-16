// ─────────────────────────────────────────────────────────────────────────────
// What to say when the REQUEST did not come back, as opposed to the server
// saying no.
//
// THE REPORT: three red "Failed to fetch" bubbles stacked over a Compare
// Responses panel that was, underneath them, completely correct - both quotes
// read, both totals right, the recommendation written. Sent as "cosmetic I
// think". It was not cosmetic and it was not even the right sentence:
//
//   - The QUOTE UPLOAD route reads a PDF with an AI model and declared no
//     `maxDuration`, so it got the platform default while the invoice scan next
//     door - the same work, reported once already - carries 60. The platform
//     cut the request off mid-read.
//   - The client caught the resulting TypeError and passed `e.message` straight
//     to the user, so the browser's own words became the app's words.
//
// Two separate rules, and this file is the second one. A raw `fetch` rejection
// is not a user-facing message for the same reason a Postgres constraint
// sentence is not (`lib/db-error.ts`): every word is true and none of it is
// usable.
//
// THE PART THAT MATTERS MOST: a request that did not come back says NOTHING
// about whether the work happened. The bubbles claimed the upload had failed
// while the quote it produced was on screen behind them. This is the same rule
// as `lib/auth-outcome.ts` - a failure to ASK is not a verdict - and the
// wording has to admit it rather than announce a failure we did not observe.
//
// And the browser's string is not one string. Chrome says "Failed to fetch",
// WebKit - which is what the native shell is - says "Load failed", Firefox says
// "NetworkError when attempting to fetch resource". Matching on the text is
// what makes a phone show something different from a laptop for one event.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * True when this is the request failing to complete, rather than the server
 * answering.
 *
 * A `fetch` that cannot reach the other end rejects with a TypeError; an
 * aborted or timed-out one rejects with a DOMException whose `name` says so.
 * Neither carries a status, because there was no response to take one from -
 * which is the whole point: there is no verdict here to report.
 */
export function isNetworkError(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const name = (e as { name?: unknown }).name
  if (name === 'AbortError' || name === 'TimeoutError') return true
  if (name !== 'TypeError') return false

  // A TypeError from fetch is a transport failure. One thrown by our own code
  // ("x is not a function") is a bug and must not be dressed up as a network
  // blip - so the wording is matched, in the several spellings that exist.
  const message = String((e as { message?: unknown }).message ?? '').toLowerCase()
  return (
    message.includes('failed to fetch') ||        // Chrome, Edge
    message.includes('load failed') ||            // Safari, WKWebView
    message.includes('networkerror') ||           // Firefox
    message.includes('network connection was lost') ||
    message.includes('connection appears to be offline') ||
    message.includes('network request failed')
  )
}

/**
 * A sentence worth showing somebody, given what they were doing.
 *
 * `action` is a present participle naming the work, lowercase and with no
 * punctuation - "reading that quote", "saving the invoice". It is dropped into
 * the middle of a sentence.
 *
 * Anything that is NOT a transport failure comes back as its own message, for
 * the reason `friendlyDbError` does the same: an ugly sentence can be pasted
 * into a bug report and a vague one cannot.
 */
export function fetchProblem(e: unknown, action: string): string {
  if (isNetworkError(e)) {
    return `The connection dropped while ${action}, so we do not know whether it finished.`
      + ' Give it a moment and reload before trying again - it may already be there.'
  }
  const message = String((e as { message?: unknown } | null)?.message ?? '').trim()
  return message || 'Something went wrong. Try again.'
}
