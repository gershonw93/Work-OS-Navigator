import { redirect } from 'next/navigation'

/**
 * The old sub-side bid page.
 *
 * It read and WROTE the legacy bids table, which nothing reads any more since
 * migration 081 folded that system into bid_requests / bid_invites /
 * bid_submissions. Left reachable, a sub arriving from a bookmark or an old
 * notification could have priced a job and submitted it into a table the GC
 * never looks at - a silent failure at the worst possible moment for them.
 *
 * /my-bids now lists every invitation as a /bid/<token> link, which is the one
 * route that works whether or not the sub has an account.
 */
export default function LegacyBidRedirect() {
  redirect('/my-bids')
}
