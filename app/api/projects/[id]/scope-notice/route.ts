import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { notify } from '@/lib/notify'
import {
  scopeNoticeProblem, scopeNoticeTitle, splitChannels, cleanAttachments,
  type NoticeRecipient,
} from '@/lib/scope-notice'
import { scopeChangeEmail } from '@/lib/email'
import { logActivity } from '@/lib/log-activity'
import { sendEmail } from '@/lib/email'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * "NOTIFY TEAM" - say the plans or the scope moved, and pick who needs to know.
 *
 * WHY: "a scope change in one trade silently moves another trade's work.
 * Concrete switches from one center pour to floor-by-floor, the slab height
 * changes half an inch, and now the electrician's heights are off - and nobody
 * told him."
 *
 * NO NEW MESSAGING SYSTEM, as asked. It is one send through `notify()`, which
 * means it obeys each recipient's own preferences and reaches the bell, the
 * inbox and the phone exactly as everything else does.
 *
 * GATED ON `plans: edit`. Somebody who can change the drawings can say the
 * drawings changed; a vendor with `plans: view` cannot broadcast to the job.
 * It is a row in the permission grid, so a company that wants their office
 * staff sending these turns it on rather than asking us.
 */

/** GET - who on this job can be told, by either channel. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'plans', 'edit')
  if (denied(gate)) return gate.denied

  // TWO SOURCES, because the person who most needs telling is often in the
  // second one. The job's team covers your own people; the subcontracts cover
  // the trades actually doing the work - the electrician whose rough-in heights
  // just went wrong is a subcontract, not a team member, and usually has no
  // SyteNav account at all.
  const [teamRes, subsRes] = await Promise.all([
    db.from('project_team_members')
      .select('id, name, role, email, profile_id').eq('project_id', params.id),
    db.from('subcontracts')
      .select('id, trade, scope, status, companies(id, name, contact_email)')
      .eq('project_id', params.id),
  ])

  if (teamRes.error || subsRes.error) {
    console.error('[scope-notice] recipients read failed:',
      teamRes.error?.message ?? subsRes.error?.message)
    return NextResponse.json({ error: 'Could not load who is on this job.' }, { status: 500 })
  }

  const team = (teamRes.data ?? []) as any[]
  const ids = team.map(r => r.profile_id).filter(Boolean)
  const { data: profiles } = ids.length
    ? await db.from('profiles').select('id, full_name, email').in('id', ids)
    : { data: [] as any[] }
  const byId = new Map((profiles ?? []).map((p: any) => [p.id, p]))

  const recipients: any[] = []
  const seen = new Set<string>()

  for (const r of team) {
    const email = byId.get(r.profile_id)?.email || r.email || null
    const key = r.profile_id ? `profile:${r.profile_id}` : email ? `email:${String(email).toLowerCase()}` : null
    if (!key || seen.has(key)) continue
    seen.add(key)
    recipients.push({
      key,
      name: byId.get(r.profile_id)?.full_name || r.name || 'Unnamed',
      email,
      profileId: r.profile_id ?? null,
      source: 'team',
      role: r.role ?? null,
    })
  }

  for (const sc of (subsRes.data ?? []) as any[]) {
    // A finished or terminated subcontract is not somebody to warn about a
    // change to work they are no longer doing.
    if (sc.status && sc.status !== 'active') continue
    const co = sc.companies
    const email = co?.contact_email || null
    if (!email) continue
    const key = `email:${String(email).toLowerCase()}`
    // Already on as a team member? One person, one row, one letter.
    if (seen.has(key)) continue
    seen.add(key)
    recipients.push({
      key,
      name: co?.name || 'Subcontractor',
      email,
      profileId: null,
      source: 'subcontractor',
      role: sc.trade || sc.scope || null,
    })
  }

  return NextResponse.json({ recipients })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'plans', 'edit')
  if (denied(gate)) return gate.denied

  const body = await request.json().catch(() => ({} as any))
  const message = String(body?.message ?? '')
  // KEYS, not profile ids - because most of the people this has to reach do not
  // have a profile. A key is `profile:<id>` or `email:<address>`.
  const keys: string[] = Array.isArray(body?.recipient_keys)
    ? body.recipient_keys.filter((v: unknown): v is string => typeof v === 'string' && !!v)
    : []
  const planName = body?.plan_name ? String(body.plan_name) : null
  const planId = body?.plan_id ? String(body.plan_id) : null
  // THE REVISED SHEET ITSELF, optional. Links, not files - see
  // `cleanAttachments`, which is also what drops anything that is not a real
  // http(s) URL before it reaches somebody's inbox wearing our name.
  const files = cleanAttachments(body?.files)

  const problem = scopeNoticeProblem({ message, recipientIds: keys })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  // THE LIST IS REBUILT SERVER-SIDE and the keys are matched against it. The
  // browser cannot name an address of its own choosing and have this send to
  // it - that would be an open relay wearing a job's name.
  const origin = new URL(request.url).origin
  const listRes = await fetch(`${origin}/api/projects/${params.id}/scope-notice`, {
    headers: { Authorization: request.headers.get('Authorization') ?? '' },
  })
  if (!listRes.ok) {
    return NextResponse.json({ error: 'Could not check who is on this job.' }, { status: 500 })
  }
  const allowed: NoticeRecipient[] = ((await listRes.json())?.recipients ?? [])
  const chosen = allowed.filter(r => keys.includes(r.key))
  if (!chosen.length) {
    return NextResponse.json(
      { error: 'Those people are not on this job any more. Reopen the list and pick again.' },
      { status: 400 },
    )
  }

  const [{ data: actor }, { data: project }] = await Promise.all([
    db.from('profiles').select('full_name, email').eq('id', gate.actor.userId).maybeSingle(),
    db.from('projects').select('name').eq('id', params.id).maybeSingle(),
  ])
  const who = (actor as any)?.full_name || (actor as any)?.email || 'Someone'
  const projectName = (project as any)?.name || 'your job'

  // Two channels, disjoint by construction: an account carries the bell, the
  // phone and that person's own email preference, so emailing them as well
  // would be the duplicate letter the house rule forbids.
  const { notifyIds, emailOnly } = splitChannels(chosen)

  // The bell carries the names, not the links - the recipient has an account
  // and the documents are already on the job in front of them. Saying nothing
  // about them would leave the emailed half of one notice better informed
  // than the half who work here.
  const attached = files.length
    ? ` (attached: ${files.map(f => f.name).join(', ')})`
    : ''

  const result = notifyIds.length
    ? await notify({
        db,
        userIds: notifyIds,
        type: 'scope_change',
        title: scopeNoticeTitle(planName),
        message: `${who}: ${String(message).trim()}${attached}`,
        link: planId ? `/projects/${params.id}/plans/${planId}` : `/projects/${params.id}/plans`,
      })
    : { inApp: 0, emailed: 0, pushed: 0, skipped: null as null }

  // THE SUBS. No account, no login, no token - just the change, by email.
  // Sent one at a time and counted, because a loop that throws abandons the
  // rest in silence and "told 6" would be a lie about the four that failed.
  let mailed = 0
  const failed: string[] = []
  await Promise.all(emailOnly.map(async person => {
    try {
      const { subject, text, html } = scopeChangeEmail({
        projectName, planName, changedBy: who, message: String(message).trim(), recipientName: person.name,
        files: files.map(f => ({ label: f.name, url: f.url })),
      })
      const sent = await sendEmail({ to: person.email, subject, text, html })
      if (sent.sent) mailed++
      else failed.push(`${person.name} (${sent.reason})`)
    } catch (e: any) {
      console.error('[scope-notice] email failed:', person.email, e?.message)
      failed.push(person.name)
    }
  }))

  // A RECORD, BECAUSE SIX WEEKS LATER SOMEBODY ASKS.
  //
  // "now theres no record of these changes anywhere" - and on a scope change
  // that is the question that actually gets asked: did anybody tell the
  // electrician about the slab, and when. An email that left no trace cannot
  // answer it, and this is the one notice whose whole purpose is that somebody
  // was told.
  //
  // It goes in the JOB HISTORY, where "who did what on this job" already lives
  // - not the Sharing tab, which is `file_shares`: paperwork sent to an
  // expeditor or a lender, a different feature that merely sounds adjacent.
  //
  // The metadata carries WHO and BY WHICH CHANNEL, because "notified the team"
  // six weeks on is not an answer - the names are.
  const toldNames = chosen.map(r => r.name)
  await logActivity(
    db, params.id, who, 'scope_change_notice',
    `${who} flagged a change${planName ? ` on ${planName}` : ''} and told ${chosen.length - failed.length} ${chosen.length - failed.length === 1 ? 'person' : 'people'}: ${String(message).trim()}`,
    {
      plan_id: planId,
      plan_name: planName,
      message: String(message).trim(),
      files,
      told: toldNames,
      in_app: result.inApp,
      emailed: result.emailed + mailed,
      pushed: result.pushed,
      // The ones who could NOT be reached are part of the record too - an
      // audit that lists only successes answers the easy half of the question.
      failed,
    },
    gate.actor.userId,
  )

  return NextResponse.json({
    sent: chosen.length,
    inApp: result.inApp,
    // Both halves of the email count, or the number on screen disagrees with
    // what went out.
    emailed: result.emailed + mailed,
    pushed: result.pushed,
    // NAMED, not counted. "6 of 8" leaves somebody hunting for the two.
    failed,
    skipped: result.skipped,
  })
}
