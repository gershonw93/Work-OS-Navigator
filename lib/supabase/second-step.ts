import { needsSecondStep } from '@/lib/two-step'

interface SessionClient {
  auth: { getSession: () => Promise<{ data: { session: { access_token?: string } | null } }> }
}

/**
 * The layout half of the two-step gate: is this (already verified) user's
 * session still at the password level? The token comes off the cookie
 * session, read locally - the level is a claim on it. Takes a client rather
 * than building one, like `checkAuth`, so each layout asks its own.
 */
export async function secondStepOwed(client: SessionClient, user: object | null): Promise<boolean> {
  const { data: { session } } = await client.auth.getSession()
  return needsSecondStep(user as Parameters<typeof needsSecondStep>[0], session?.access_token)
}
