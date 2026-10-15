// Client threads, wired to the database: the one reader and the one writer of
// `client_messages`, shared by the client's route (/api/portal/<token>/messages)
// and the GC's (/api/projects/<id>/client-messages), so the two sides cannot
// store or tell people differently. The rules are in lib/client-thread.ts.

import { audienceFor } from './notification-audience'
import { notify } from './notify'
import { sendEmail, tokenLinkEmail } from './email'
import { SUBJECTS, type ClientMessage, type ClientSide, type ClientSubject } from './client-thread'

const COLS = 'id, side, author_name, body, created_at'

export interface ThreadProject {
  id: string
  name: string | null
  client: string | null
  gc_company_id: string | null
  customer_id: string | null
  client_portal_token: string | null
}

export const THREAD_PROJECT_COLS = 'id, name, client, gc_company_id, customer_id, client_portal_token'

const money = (n: unknown) => `$${Number(n ?? 0).toLocaleString('en-US', { maximumFractionDigits: 0 })}`

/**
 * The record a thread is about, on THIS job, as the reader may see it - or
 * null. `forClient` applies the portal's own rule: a client may only ask about
 * what their link shows them, so a draft invoice or an unsent payment request
 * is "not found" to them exactly as it is invisible to them.
 */
export async function resolveSubject(
  db: any, projectId: string, subject: ClientSubject, id: string | null, forClient: boolean,
): Promise<{ label: string } | null> {
  if (subject === 'project') return { label: 'the job' }
  if (subject === 'selection') {
    const { data } = await db.from('project_selections').select('id, item, location').eq('id', id).eq('project_id', projectId).maybeSingle()
    return data ? { label: data.location ? `${data.item} (${data.location})` : data.item } : null
  }
  if (subject === 'invoice') {
    const { data } = await db.from('client_invoices').select('id, invoice_number, status').eq('id', id).eq('project_id', projectId).maybeSingle()
    if (!data || (forClient && !['sent', 'paid'].includes(data.status))) return null
    return { label: `Invoice ${data.invoice_number}` }
  }
  const { data } = await db.from('client_payment_requests').select('id, label, amount, sent_at').eq('id', id).eq('project_id', projectId).maybeSingle()
  if (!data || (forClient && !data.sent_at)) return null
  return { label: `${data.label} (${money(data.amount)})` }
}

/** Narrow a client_messages query to one thread. */
function forThread(q: any, subject: ClientSubject, id: string | null) {
  const col = SUBJECTS[subject].column
  if (col) return q.eq(col, id)
  // The job itself: a message about nothing in particular.
  return q.is('selection_id', null).is('client_invoice_id', null).is('payment_request_id', null)
}

export async function readClientThread(
  db: any, projectId: string, subject: ClientSubject, id: string | null,
): Promise<{ messages: ClientMessage[] } | { error: string }> {
  const { data, error } = await forThread(
    db.from('client_messages').select(COLS).eq('project_id', projectId), subject, id,
  ).order('created_at', { ascending: true })
  // A refused read is not an empty thread.
  if (error) {
    console.error('[client-thread] read failed', { projectId, subject, id, error: error.message })
    return { error: 'Could not load the messages.' }
  }
  return { messages: (data ?? []) as ClientMessage[] }
}

interface PostInput {
  db: any
  project: ThreadProject
  subject: ClientSubject
  subjectId: string | null
  /** What the thread is about, in words: "Invoice INV-0007". */
  label: string
  side: ClientSide
  authorId: string | null
  authorName: string | null
  body: string
  /** The app's origin, for the link in the client's email. */
  origin: string
}

export interface PostResult {
  message: ClientMessage
  /**
   * GC side only: whether the answer reached the client's inbox and, if not,
   * why. "Saved" and "they were told" are different facts and the screen says
   * which. Null on the client side, where notify() does the telling.
   */
  emailed: { sent: boolean; reason: string | null; to: string | null } | null
}

/**
 * Store the message, then tell the other side. The message is the work: once
 * it is saved the post has succeeded, whatever the telling does.
 */
export async function postClientMessage(input: PostInput): Promise<PostResult | { error: string }> {
  const { db, project, subject, subjectId, label, side } = input
  const rule = SUBJECTS[subject]
  const body = input.body.trim()

  const row: Record<string, unknown> = {
    project_id: project.id,
    side,
    author_id: side === 'gc' ? input.authorId : null,
    author_name: input.authorName,
    body,
  }
  if (rule.column) row[rule.column] = subjectId

  const { data: message, error } = await db.from('client_messages').insert(row).select(COLS).single()
  if (error || !message) {
    console.error('[client-thread] insert failed', { projectId: project.id, subject, error: error?.message })
    return { error: 'Could not send the message. Try again.' }
  }

  const preview = body.length > 160 ? `${body.slice(0, 157)}...` : body

  if (side === 'client') {
    const team = await audienceFor({ db, companyId: project.gc_company_id, type: rule.notifyType })
    await notify({
      db,
      userIds: team,
      type: rule.notifyType,
      title: subject === 'project'
        ? `${input.authorName || 'The client'} sent a question`
        : `${input.authorName || 'The client'} asked about ${label}`,
      message: `${project.name ? `${project.name}: ` : ''}"${preview}"`,
      link: `/projects/${project.id}/${rule.tab}`,
    })
    return { message: message as ClientMessage, emailed: null }
  }

  // GC side: the client has no account and no bell. Their address is on the
  // customer record; without one the answer still waits on their link.
  let to: string | null = null
  if (project.customer_id) {
    const { data: c } = await db.from('customers').select('email').eq('id', project.customer_id).maybeSingle()
    to = (c as any)?.email ?? null
  }
  if (!to) return { message: message as ClientMessage, emailed: { sent: false, reason: 'no_email', to: null } }
  if (!project.client_portal_token) return { message: message as ClientMessage, emailed: { sent: false, reason: 'no_link', to } }

  const email = tokenLinkEmail({
    recipientName: project.client,
    eyebrow: 'Reply to your question',
    heading: subject === 'project' ? (project.name ?? 'Your job') : label,
    lines: [
      `${input.authorName || 'Your contractor'} answered your question${project.name ? ` on ${project.name}` : ''}:`,
      `"${body}"`,
      'You can reply on your project page.',
    ],
    ctaLabel: 'Open your project',
    url: `${input.origin}/portal/${project.client_portal_token}${rule.portalPath}`,
    companyName: null,
  })
  const r = await sendEmail({ to, ...email })
  if (!r.sent) console.error('[client-thread] reply email not sent', { projectId: project.id, subject, reason: r.reason })
  return { message: message as ClientMessage, emailed: { sent: r.sent, reason: r.sent ? null : r.reason, to } }
}
