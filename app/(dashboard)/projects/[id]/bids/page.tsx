import { redirect } from 'next/navigation'

/**
 * The Bids tab is now the Quotes & Bids tab.
 *
 * They were always the same job under two names, in two sections of the app,
 * backed by two sets of tables that arrived twenty-three migrations apart.
 * Migration 081 moved the old rows into the live system; this keeps every
 * bookmark, notification link and browser history entry working.
 *
 * Same pattern as quotes/page.tsx, which redirected here for the same reason
 * the last time somebody consolidated part of this.
 */
export default function BidsRedirect({ params }: { params: { id: string } }) {
  redirect(`/projects/${params.id}/request-quotes`)
}
