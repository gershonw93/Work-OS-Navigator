import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { reportDb } from '@/lib/report-admin-db'
import { reportCtx, runReport } from '@/lib/report-load'
import { normalizeConfig, configProblem } from '@/lib/report-builder'
import { tokenLinkEmail, sendEmail, isEmailAddress } from '@/lib/email'
import { appOrigin } from '@/lib/app-url'
import { friendlyDbError } from '@/lib/db-error'

export const runtime = 'nodejs'
export const maxDuration = 60

const SHARE_COLUMNS = 'id, token, title, recipient_name, recipient_email, message, emailed_at, created_by_name, created_at, viewed_at, revoked_at, saved_report_id'

/** Links this company has shared, newest first. */
export async function GET(request: Request) {
  const db = reportDb()
  const gate = await reportCtx(db, request, 'view')
  if ('denied' in gate) return gate.denied
  const { data, error } = await db.from('report_shares').select(SHARE_COLUMNS)
    .eq('company_id', gate.ctx.companyId)
    .order('created_at', { ascending: false })
    .limit(200)
  if (error) {
    console.error('[report shares]', error)
    return NextResponse.json({ error: 'Could not load the shared links.' }, { status: 500 })
  }
  return NextResponse.json({ shares: data ?? [] })
}

/**
 * Share a report as a link, and optionally email it.
 *
 * THE REPORT IS RE-RUN HERE, never taken from the body. What goes out is what
 * this person is allowed to see today, computed by the same builder as the
 * screen - a document posted from a browser could say anything. It is stored
 * as a SNAPSHOT: the recipient sees the report as it read when it was sent.
 *
 * The link exists before the email is tried, and an email that fails says so
 * and hands back the link - recording the share is not the same act as
 * delivering it, and one must not undo the other.
 */
export async function POST(request: Request) {
  const db = reportDb()
  const gate = await reportCtx(db, request, 'create')
  if ('denied' in gate) return gate.denied
  const { ctx } = gate
  const body = await request.json().catch(() => ({})) as any

  const config = normalizeConfig(body?.config)
  const problem = configProblem(config)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const recipientName = String(body?.recipientName ?? '').trim().slice(0, 120) || null
  const recipientEmail = String(body?.recipientEmail ?? '').trim().slice(0, 200) || null
  const message = String(body?.message ?? '').trim().slice(0, 1000) || null
  const wantsEmail = body?.sendEmail === true
  if (wantsEmail && !recipientEmail) return NextResponse.json({ error: 'Add an email address to send it to, or untick "Email it".' }, { status: 400 })
  if (recipientEmail && !isEmailAddress(recipientEmail)) return NextResponse.json({ error: 'That does not look like an email address.' }, { status: 400 })

  const out = await runReport(db, ctx, config)
  if ('error' in out) return out.error
  const doc = out.doc

  const token = randomBytes(24).toString('base64url')
  const savedId = typeof body?.savedReportId === 'string' && /^[0-9a-f-]{36}$/i.test(body.savedReportId) ? body.savedReportId : null
  const { data: share, error } = await db.from('report_shares').insert({
    company_id: ctx.companyId,
    saved_report_id: savedId,
    token,
    title: doc.title,
    snapshot: { ...doc, from_company: ctx.companyName, from_logo: ctx.logoUrl },
    config,
    recipient_name: recipientName,
    recipient_email: recipientEmail,
    message,
    created_by: ctx.actor.userId,
    created_by_name: ctx.actorName,
  }).select(SHARE_COLUMNS).single()
  if (error || !share) {
    console.error('[report shares] insert', error)
    // A saved report deleted a moment ago leaves a dangling id; the share is
    // still worth making without it.
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  const url = `${appOrigin(request.headers.get('origin'))}/shared-report/${token}`

  let emailed = false
  let emailError: string | null = null
  if (wantsEmail && recipientEmail) {
    const email = tokenLinkEmail({
      recipientName,
      eyebrow: 'Report',
      heading: doc.title,
      lines: [
        `${ctx.companyName ?? 'Your contractor'} has shared a report with you: ${doc.title}.`,
        doc.subtitle,
        'The link opens the full report, and you can save it as a PDF from there.',
      ],
      ctaLabel: 'Open the report',
      url,
      fromName: ctx.actorName,
      companyName: ctx.companyName,
      note: message,
    })
    const result = await sendEmail({ to: recipientEmail, ...email })
    if (result.sent) {
      emailed = true
      await db.from('report_shares').update({ emailed_at: new Date().toISOString() }).eq('id', (share as any).id)
    } else {
      emailError = result.reason === 'not_configured'
        ? 'Email sending is not set up yet. The link was made - copy it and send it yourself.'
        : 'The email did not go. The link was made - copy it and send it yourself.'
      console.error('[report shares] email failed', result.reason)
    }
  }

  return NextResponse.json({ share: { ...share, emailed_at: emailed ? new Date().toISOString() : null }, url, emailed, emailError, dropped: out.dropped })
}
