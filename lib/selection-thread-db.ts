// The selection thread, wired to the database: the one reader and the one
// writer of `selection_messages`, shared by the client's route
// (/api/portal/<token>/selections/<selId>/messages) and the GC's
// (/api/projects/<id>/selections/<selId>/messages), so the two sides cannot
// store or tell people differently.

import { audienceFor } from './notification-audience'
import { notify } from './notify'
import { sendEmail, tokenLinkEmail } from './email'
import type { SelectionMessage, SelectionSide } from './selection-thread'

const COLS = 'id, side, author_name, body, created_at'

export async function readSelectionThread(db: any, selectionId: string): Promise<{ messages: SelectionMessage[] } | { error: string }> {
  const { data, error } = await db.from('selection_messages').select(COLS)
    .eq('selection_id', selectionId).order('created_at', { ascending: true })
  // A refused read is not an empty thread.
  if (error) {
    console.error('[selection-thread] read failed', { selectionId, error: error.message })
    return { error: 'Could not load the messages.' }
  }
  return { messages: (data ?? []) as SelectionMessage[] }
}

interface PostInput {
  db: any
  project: { id: string; name: string | null; client: string | null; gc_company_id: string | null; customer_id: string | null; client_portal_token: string | null }
  selection: { id: string; item: string; location: string | null }
  side: SelectionSide
  authorId: string | null
  authorName: string | null
  body: string
  /** The app's origin, for the link in the client's email. */
  origin: string
}

export interface PostResult {
  message: SelectionMessage
  /**
   * GC side only: whether the answer reached the client's inbox, and if not,
   * why - "saved" and "they were told" are different facts, and the screen says
   * which. Null on the client side, where the bell and routed email do the job.
   */
  emailed: { sent: boolean; reason: string | null; to: string | null } | null
}

/**
 * Store the message, then tell the other side. The message is the work: once
 * it is saved the post has succeeded, whatever the telling does.
 */
export async function postSelectionMessage(input: PostInput): Promise<PostResult | { error: string }> {
  const { db, project, selection, side } = input
  const body = input.body.trim()

  const { data: message, error } = await db.from('selection_messages').insert({
    selection_id: selection.id,
    project_id: project.id,
    side,
    author_id: side === 'gc' ? input.authorId : null,
    author_name: input.authorName,
    body,
  }).select(COLS).single()
  if (error || !message) {
    console.error('[selection-thread] insert failed', { selectionId: selection.id, error: error?.message })
    return { error: 'Could not send the message. Try again.' }
  }

  const what = selection.location ? `${selection.item} (${selection.location})` : selection.item
  const preview = body.length > 160 ? `${body.slice(0, 157)}...` : body

  if (side === 'client') {
    const team = await audienceFor({ db, companyId: project.gc_company_id, type: 'selection_question' })
    await notify({
      db,
      userIds: team,
      type: 'selection_question',
      title: `${input.authorName || 'The client'} asked about ${what}`,
      message: `${project.name ? `${project.name}: ` : ''}"${preview}"`,
      link: `/projects/${project.id}/selections`,
    })
    return { message: message as SelectionMessage, emailed: null }
  }

  // GC side: the client has no account and no bell. Their address is on the
  // customer record; without one the answer still waits on their link.
  let to: string | null = null
  if (project.customer_id) {
    const { data: c } = await db.from('customers').select('email').eq('id', project.customer_id).maybeSingle()
    to = (c as any)?.email ?? null
  }
  if (!to) return { message: message as SelectionMessage, emailed: { sent: false, reason: 'no_email', to: null } }
  if (!project.client_portal_token) return { message: message as SelectionMessage, emailed: { sent: false, reason: 'no_link', to } }

  const email = tokenLinkEmail({
    recipientName: project.client,
    eyebrow: 'Reply about your selection',
    heading: what,
    lines: [
      `${input.authorName || 'Your contractor'} answered your question${project.name ? ` on ${project.name}` : ''}:`,
      `"${body}"`,
      'You can reply, or make your pick, on your selections page.',
    ],
    ctaLabel: 'Open your selections',
    url: `${input.origin}/portal/${project.client_portal_token}/selections`,
    companyName: null,
  })
  const r = await sendEmail({ to, ...email })
  if (!r.sent) console.error('[selection-thread] reply email not sent', { selectionId: selection.id, reason: r.reason })
  return { message: message as SelectionMessage, emailed: { sent: r.sent, reason: r.sent ? null : r.reason, to } }
}
