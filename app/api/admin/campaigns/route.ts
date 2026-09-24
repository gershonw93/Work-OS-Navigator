import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'
import { SEGMENTS, segmentByKey, peopleFor, parseAddressList, normaliseEmail } from '@/lib/campaign-audience'
import { readAudience, readSuppressions } from '@/lib/campaign-audience-read'
import { campaignProblem, fillCampaign, CAMPAIGN_TAGS } from '@/lib/campaign-copy'
import { buildRecipients, drainCampaign, TEST_SEND_MAX, type CampaignRow } from '@/lib/campaign-send'
import { campaignEmail } from '@/lib/email'
import { unsubscribeUrl } from '@/lib/unsubscribe-token'
import { appOrigin } from '@/lib/app-url'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// The campaigns console: write one, see exactly who gets it, send it.
//
// SUPER ADMIN ONLY, gated BEFORE the body is read - no field in a request is a
// permission. This is the one endpoint in the product that can mail every
// customer at once.
//
// `campaignProblem` IS ASKED HERE AS WELL AS ON THE FORM. A console is a hole
// straight through the test suite unless the route re-states the rules the pins
// enforce over source files: the trial-length pin reads .ts, so a campaign body
// saying "your first 30 days are free" would sail past every suite.
//
// A SEND WITH NO RECIPIENTS IS NOT A SEND, and it must not be recorded as one.
// An incomplete audience read is refused outright rather than narrowed: a
// smaller list looks exactly like a correct one, and for "trial ending" the
// people it silently drops are the reason the mail exists.
// ─────────────────────────────────────────────────────────────────────────────

async function gate(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return { denied: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isSuperAdmin(user.email)) return { denied: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { db, user }
}

/** What it will look like, with one real person's values in. */
function preview(fields: { subject: string; body: string }, origin: string) {
  const words = fillCampaign(fields, { firstName: 'Dana Whitfield', companyName: 'Whitfield Builders' })
  return campaignEmail({
    name: 'Dana Whitfield',
    subject: words.subject,
    paragraphs: words.paragraphs,
    unsubscribeUrl: unsubscribeUrl(origin, 'dana@whitfieldbuilders.com'),
  }).html
}

export async function GET(request: Request) {
  const g = await gate(request)
  if ('denied' in g) return g.denied
  const { db } = g

  const now = new Date()
  const [audience, suppressed, campaigns] = await Promise.all([
    readAudience(db),
    readSuppressions(db),
    db.from('email_campaigns')
      .select('id, name, subject, segment, status, scheduled_for, started_at, finished_at, created_by_name, created_at')
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  if (campaigns.error) console.error('[campaigns] could not list them', campaigns.error.message)

  const stop = suppressed ?? new Set<string>()
  const ids = ((campaigns.data ?? []) as { id: string }[]).map(c => c.id)
  const tallies = new Map<string, { sent: number; failed: number; skipped: number; pending: number }>()
  if (ids.length) {
    const { data: rows, error } = await db
      .from('campaign_recipients').select('campaign_id, status').in('campaign_id', ids)
    if (error) console.error('[campaigns] could not count the recipients', error.message)
    for (const r of (rows ?? []) as { campaign_id: string; status: string }[]) {
      const t = tallies.get(r.campaign_id) ?? { sent: 0, failed: 0, skipped: 0, pending: 0 }
      if (r.status in t) (t as Record<string, number>)[r.status]++
      tallies.set(r.campaign_id, t)
    }
  }

  return NextResponse.json({
    tags: CAMPAIGN_TAGS,
    // SAID OUT LOUD, because it is the rule somebody will assume is not there.
    audience: {
      complete: audience.complete,
      people: audience.people.length,
      suppressed: stop.size,
    },
    segments: SEGMENTS.map(s => ({
      key: s.key,
      label: s.label,
      describe: s.describe,
      custom: !!s.custom,
      // The live number, with the people who have unsubscribed already gone -
      // so the count on the screen is the count that gets mail.
      count: s.custom
        ? null
        : peopleFor(s.key, audience.people, now).filter(p => !stop.has(normaliseEmail(p.email))).length,
    })),
    campaigns: ((campaigns.data ?? []) as Record<string, unknown>[]).map(c => ({
      ...c,
      tally: tallies.get(String(c.id)) ?? { sent: 0, failed: 0, skipped: 0, pending: 0 },
    })),
  })
}

export async function POST(request: Request) {
  const g = await gate(request)
  if ('denied' in g) return g.denied
  const { db, user } = g

  const body = await request.json().catch(() => ({} as Record<string, unknown>))
  const action = String((body as Record<string, unknown>)?.action ?? 'send')
  const fields = {
    name: String((body as Record<string, unknown>)?.name ?? ''),
    subject: String((body as Record<string, unknown>)?.subject ?? ''),
    body: String((body as Record<string, unknown>)?.body ?? ''),
    segment: String((body as Record<string, unknown>)?.segment ?? ''),
    customEmails: (body as Record<string, unknown>)?.customEmails == null
      ? null : String((body as Record<string, unknown>).customEmails),
  }

  const origin = appOrigin(new URL(request.url).origin)
  if (action === 'preview') {
    // The preview does not need a segment or a name, only words.
    if (!fields.subject.trim() || !fields.body.trim()) {
      return NextResponse.json({ error: 'Write a subject and a body first.' }, { status: 400 })
    }
    return NextResponse.json({ html: preview(fields, origin) })
  }

  const problem = campaignProblem(fields)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const segment = segmentByKey(fields.segment)!
  const scheduledFor = action === 'schedule'
    ? String((body as Record<string, unknown>)?.scheduledFor ?? '')
    : ''
  if (action === 'schedule') {
    const at = new Date(scheduledFor)
    if (Number.isNaN(at.getTime())) return NextResponse.json({ error: 'Pick a date and time to send it.' }, { status: 400 })
    if (at.getTime() < Date.now()) return NextResponse.json({ error: 'That is in the past.' }, { status: 400 })
  }

  const { data: me } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle()

  const { data: created, error: createErr } = await db.from('email_campaigns').insert({
    name: fields.name.trim(),
    subject: fields.subject.trim(),
    body: fields.body.trim(),
    segment: segment.key,
    custom_emails: segment.custom ? parseAddressList(fields.customEmails ?? '') : null,
    status: action === 'schedule' ? 'scheduled' : 'sending',
    scheduled_for: action === 'schedule' ? new Date(scheduledFor).toISOString() : null,
    started_at: action === 'schedule' ? null : new Date().toISOString(),
    created_by: user.id,
    created_by_name: (me as { full_name?: string } | null)?.full_name ?? user.email ?? null,
  }).select('id, name, subject, body, segment, custom_emails, status').maybeSingle()

  if (createErr || !created) {
    console.error('[campaigns] could not create', createErr?.message)
    return NextResponse.json({ error: 'That did not save.' }, { status: 500 })
  }
  const campaign = created as unknown as CampaignRow

  // A SCHEDULED CAMPAIGN'S LIST IS BUILT WHEN IT SENDS, not now. Who is on a
  // trial on Thursday is not who is on one today, and somebody who
  // unsubscribes on Wednesday must not be on a list frozen on Monday.
  if (action === 'schedule') {
    return NextResponse.json({ ok: true, id: campaign.id, scheduled: true })
  }

  const recipients = await buildRecipients(db, campaign)
  if (!recipients) {
    await db.from('email_campaigns').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', campaign.id)
    return NextResponse.json({
      error: 'Could not read the whole list, so nothing was sent. Try again in a minute.',
    }, { status: 503 })
  }
  if (!recipients.length) {
    await db.from('email_campaigns').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', campaign.id)
    return NextResponse.json({ error: 'Nobody is in that segment, so nothing was sent.' }, { status: 400 })
  }

  const { error: rowsErr } = await db.from('campaign_recipients').insert(recipients)
  if (rowsErr) {
    console.error('[campaigns] could not write the recipients', rowsErr.message)
    await db.from('email_campaigns').update({ status: 'failed', finished_at: new Date().toISOString() }).eq('id', campaign.id)
    return NextResponse.json({ error: 'Could not write the list, so nothing was sent.' }, { status: 500 })
  }

  // A TEST SEND GOES NOW; A LIST WAITS FOR THE CRON. The reason nothing large
  // is sent in this request is the timeout - half a list mailed with no record
  // of which half. A handful cannot hit it, and making somebody wait ten
  // minutes to see whether their own copy looks right is how a test send stops
  // being used at all.
  let drained = null
  if (recipients.length <= TEST_SEND_MAX) {
    drained = await drainCampaign(db, campaign, origin, TEST_SEND_MAX)
  }

  return NextResponse.json({
    ok: true,
    id: campaign.id,
    recipients: recipients.length,
    ...(drained ? { sent: drained.sent, failed: drained.failed, skipped: drained.skipped } : {}),
  })
}
