import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { sendEmail, scheduleUnblockedEmail, isEmailAddress } from '@/lib/email'
import { notify } from '@/lib/notify'
import { readGatePicture } from '@/lib/schedule-unblocked-read'
import { clearToTell } from '@/lib/schedule-unblocked'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * TELL THE SUBS WHOSE GATE HAS OPENED.
 *
 * There is no GET here any more. The blocked/cleared picture rides the
 * schedule payload the page already waits for (`readGatePicture`, the one
 * reader), because a second endpoint answering the same question is how the
 * board and the send come to disagree - and because this route's own GET sat
 * in the repository for two releases with no caller at all, which is the
 * whole reason the "you're clear to start" email had never once been sent.
 *
 * Same rule as the cascade: THE REVIEW SCREEN COMES FIRST. The caller names
 * exactly which lines to tell. "Tell everybody who happens to be clear right
 * now" would fire a fresh batch of emails every time somebody opened the
 * page.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const gate = await requirePermission(admin(), request, 'schedule', 'edit')
  if (denied(gate)) return gate.denied

  const body = await request.json().catch(() => ({} as any))
  const taskIds: string[] = Array.isArray(body?.task_ids) ? body.task_ids : []
  if (!taskIds.length) {
    return NextResponse.json({ error: 'Pick which ones to tell.' }, { status: 400 })
  }

  const db = admin()
  let picture
  try { picture = await readGatePicture(db, params.id) }
  catch (e: any) {
    console.error('[schedule/unblocked] state read failed:', e?.message)
    return NextResponse.json({ error: 'Could not check what is clear. Nothing was sent.' }, { status: 500 })
  }

  // RE-CHECKED HERE, whatever the body asked for. A review screen left open
  // while somebody wound a percent back must not be able to tell a crew they
  // are free to start - and `clearToTell` is the same filter the screen drew
  // itself from, so the second press of a double press finds the line already
  // told and sends nothing.
  const asked = new Set(taskIds)
  const toTell = clearToTell(picture).filter(g => asked.has(g.taskId))
  if (!toTell.length) {
    return NextResponse.json({
      sent: 0,
      skipped: taskIds.length,
      reason: 'none of those are still clear and untold',
    })
  }

  const project = await db.from('projects').select('name').eq('id', params.id).maybeSingle()
  const projectName = (project.data as any)?.name ?? null

  const subIds = Array.from(new Set(toTell.map(g => g.subcontractId).filter(Boolean))) as string[]
  const companyBySub = new Map<string, any>()
  if (subIds.length) {
    const { data } = await db.from('subcontracts')
      .select('id, company_id, companies(id, name, contact_email)').in('id', subIds)
    for (const s of (data ?? []) as any[]) companyBySub.set(s.id, s.companies)
  }

  const notices: any[] = []
  const toldUserIds: string[] = []
  let sent = 0

  for (const g of toTell) {
    const company = g.subcontractId ? companyBySub.get(g.subcontractId) : null
    const email = isEmailAddress(company?.contact_email) ? company.contact_email : null

    // EVERY gate that was holding this line, not just the first. A line kept
    // back by two trades is clear because BOTH got there, and a letter naming
    // one of them is a letter the reader cannot check.
    const ahead = g.gates.map(x => x.predecessorName)
    const why = g.gates.map(x => `${x.predecessorName} reached ${x.need}%`).join('; ')

    let sentAt: string | null = null
    let sendError: string | null = null

    if (email) {
      const mail = scheduleUnblockedEmail({
        vendorName: company?.name,
        projectName,
        trade: g.taskName,
        predecessorTrade: ahead,
        startDate: g.taskStart,
      })
      const res = await sendEmail({ to: email, ...mail })
      if (res.sent) { sentAt = new Date().toISOString(); sent++ }
      else {
        sendError = res.detail ? `${res.reason}: ${res.detail}` : res.reason
        console.error(`[schedule/unblocked] email to ${email} failed: ${sendError}`)
      }
    } else {
      sendError = 'no email address on file'
    }

    notices.push({
      project_id: params.id,
      schedule_item_id: g.taskId,
      company_id: company?.id ?? null,
      sent_to: email ?? (company?.name ?? 'no vendor'),
      kind: 'unblocked',
      new_start: g.taskStart,
      reason: why,
      sent_at: sentAt,
      send_error: sendError,
      sent_by: gate.actor.userId,
    })

    if (company?.id) {
      const { data: people } = await db.from('profiles').select('id').eq('company_id', company.id)
      for (const p of (people ?? []) as any[]) toldUserIds.push(p.id)
    }
  }

  if (notices.length) {
    const { error } = await db.from('schedule_shift_notices').insert(notices)
    // LOUD, because `sent_at` on this table is what stops the same sub being
    // told twice. A send that happened and was not written down is an offer
    // that comes straight back.
    if (error) console.error('[schedule/unblocked] could not log the notices:', error.message)
  }

  if (toldUserIds.length) {
    await notify({
      db,
      type: 'schedule_unblocked',
      userIds: toldUserIds,
      title: "You're clear to start",
      message: projectName ? `The trade ahead of you on ${projectName} is far enough along.` : 'The trade ahead of you is far enough along.',
      link: `/projects/${params.id}/schedule`,
      // ONE EVENT, ONE EMAIL. The letter above is the email; the bell is a
      // different channel and is never the duplicate. Where the send failed,
      // `notify`'s own email would be the fallback - but this caller KNOWS it
      // addressed the vendor's inbox, and the people here are that vendor's
      // staff inside SyteNav.
      inAppOnly: true,
    })
  }

  return NextResponse.json({ sent, told: toTell.length })
}
