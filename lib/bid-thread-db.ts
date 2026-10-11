// The quote thread, wired to the database. The rules are in lib/bid-thread.ts;
// this is the one reader of `bid_messages` and the one writer, shared by the
// sub's route (/api/bid/<token>/messages) and the GC's
// (/api/projects/<id>/bid-requests/<reqId>/invites/<inviteId>/messages), so
// the two sides cannot store or tell people differently.

import { audienceFor } from './notification-audience'
import { notify } from './notify'
import type { BidMessage } from './bid-thread'

export type { BidMessage }

const COLS = 'id, side, author_name, body, created_at'

export async function readThread(db: any, inviteId: string): Promise<{ messages: BidMessage[] } | { error: string }> {
  const { data, error } = await db
    .from('bid_messages')
    .select(COLS)
    .eq('bid_invite_id', inviteId)
    .order('created_at', { ascending: true })
  // A refused read is not an empty thread. Logged and said, so "no messages
  // yet" is only ever printed over a read that worked.
  if (error) {
    console.error('[bid-thread] read failed', { inviteId, error: error.message })
    return { error: 'Could not load the messages.' }
  }
  return { messages: (data ?? []) as BidMessage[] }
}

interface PostInput {
  db: any
  invite: { id: string; bid_request_id: string; vendor_company_id: string | null; vendor_email: string | null; vendor_name: string | null; token: string }
  side: 'gc' | 'sub'
  authorId: string
  authorName: string | null
  body: string
}

/**
 * Store the message, then tell the other side.
 *
 * The message is the work: once it is saved the send has succeeded, whatever
 * the notification does - `notify` never throws, and this does not wait on it
 * to decide the answer.
 */
export async function postMessage(input: PostInput): Promise<{ message: BidMessage } | { error: string }> {
  const { db, invite, side, authorId, authorName } = input
  const body = input.body.trim()

  const { data: message, error } = await db
    .from('bid_messages')
    .insert({
      bid_invite_id: invite.id,
      bid_request_id: invite.bid_request_id,
      side,
      author_id: authorId,
      author_name: authorName,
      body,
    })
    .select(COLS)
    .single()
  if (error || !message) {
    console.error('[bid-thread] insert failed', { inviteId: invite.id, error: error?.message })
    return { error: 'Could not send the message. Try again.' }
  }

  const { data: req } = await db
    .from('bid_requests')
    .select('title, trade, project_id, created_by, projects ( name, gc_company_id )')
    .eq('id', invite.bid_request_id)
    .maybeSingle()
  const what = (req as any)?.title || (req as any)?.trade || 'a quote request'
  const job = (req as any)?.projects?.name
  const about = `${what}${job ? ` on ${job}` : ''}`
  const preview = body.length > 160 ? `${body.slice(0, 157)}...` : body

  if (side === 'sub') {
    const gcCompanyId = (req as any)?.projects?.gc_company_id
    const team = await audienceFor({ db, companyId: gcCompanyId, type: 'bid_message_from_sub', exclude: authorId })
    await notify({
      db,
      userIds: [...team, (req as any)?.created_by],
      type: 'bid_message_from_sub',
      title: `Message from ${invite.vendor_name || authorName || 'a sub'}`,
      message: `About ${about}: "${preview}"`,
      link: (req as any)?.project_id ? `/projects/${(req as any).project_id}/request-quotes` : null,
    })
  } else {
    // Everybody on the sub's side who could open the thread: the people at the
    // company it was sent to, plus the address it was sent to if that is an
    // account of its own.
    const ids = new Set<string>()
    if (invite.vendor_company_id) {
      const { data: people } = await db.from('profiles').select('id').eq('company_id', invite.vendor_company_id)
      for (const p of people ?? []) ids.add(p.id)
    }
    if (invite.vendor_email) {
      // ilike for case, with its wildcards escaped: `_` is common in an
      // address and would otherwise match any character.
      const { data: byEmail } = await db.from('profiles').select('id').ilike('email', invite.vendor_email.trim().replace(/[%_\\]/g, '\\$&'))
      for (const p of byEmail ?? []) ids.add(p.id)
    }
    ids.delete(authorId)
    await notify({
      db,
      userIds: Array.from(ids),
      type: 'bid_message_to_sub',
      title: 'Reply about your quote',
      message: `${about}: "${preview}"`,
      link: `/bid/${invite.token}`,
    })
  }

  return { message: message as BidMessage }
}
