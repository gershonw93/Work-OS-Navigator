import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { checkCronAuth } from '@/lib/cron-auth'
import { buildRecipients, drainCampaign, type CampaignRow } from '@/lib/campaign-send'
import { appOrigin } from '@/lib/app-url'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** One chunk per run. Fifty SendGrid calls fit inside 60 seconds with room. */
const CHUNK = 50

// ─────────────────────────────────────────────────────────────────────────────
// Draining the campaign queue.
//
// TWO JOBS, IN THIS ORDER: promote any scheduled campaign whose time has come,
// then send the next chunk of whatever is `sending`.
//
// THE LIST IS BUILT AT PROMOTION, NOT AT COMPOSITION. Who is on a trial on
// Thursday is not who was on Monday, and an address that unsubscribed on
// Wednesday has to be gone before the first letter, not after it.
//
// ONE CAMPAIGN PER RUN. Two sending at once is rare and the second one waiting
// four minutes costs nothing; a run that tries to drain both is a run that
// times out halfway through the first.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const auth = checkCronAuth({
    secret: process.env.CRON_SECRET,
    authorization: request.headers.get('Authorization'),
    querySecret: new URL(request.url).searchParams.get('secret'),
    isVercelCron: request.headers.get('x-vercel-cron') != null,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = admin()
  const origin = appOrigin(null)
  const now = new Date()

  // ── promote what is due ──────────────────────────────────────────────────
  const { data: due, error: dueErr } = await db
    .from('email_campaigns')
    .select('id, name, subject, body, segment, custom_emails, status')
    .eq('status', 'scheduled')
    .lte('scheduled_for', now.toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(1)

  if (dueErr) console.error('[campaigns] could not read the scheduled ones', dueErr.message)

  const promoted: string[] = []
  for (const row of (due ?? []) as unknown as CampaignRow[]) {
    const recipients = await buildRecipients(db, row, now)
    if (!recipients) {
      // A LIST WE COULD NOT TAKE COMPLETELY IS NOT A SMALLER LIST. Leave it
      // scheduled and try on the next run - a campaign four minutes late is a
      // campaign; one that quietly missed a third of its audience is not.
      console.error('[campaigns] leaving scheduled, the audience read did not complete', row.id)
      continue
    }
    if (!recipients.length) {
      await db.from('email_campaigns')
        .update({ status: 'failed', started_at: now.toISOString(), finished_at: now.toISOString() })
        .eq('id', row.id)
      continue
    }
    const { error } = await db.from('campaign_recipients').insert(recipients)
    if (error) {
      console.error('[campaigns] could not write the recipients', { id: row.id, error: error.message })
      continue
    }
    await db.from('email_campaigns')
      .update({ status: 'sending', started_at: now.toISOString() })
      .eq('id', row.id)
    promoted.push(row.id)
  }

  // ── send the next chunk ──────────────────────────────────────────────────
  const { data: sending, error: sendingErr } = await db
    .from('email_campaigns')
    .select('id, name, subject, body, segment, custom_emails, status')
    .eq('status', 'sending')
    .order('started_at', { ascending: true })
    .limit(1)

  if (sendingErr) {
    console.error('[campaigns] could not read what is sending', sendingErr.message)
    return NextResponse.json({ error: sendingErr.message }, { status: 500 })
  }

  const campaign = ((sending ?? []) as unknown as CampaignRow[])[0]
  if (!campaign) return NextResponse.json({ ok: true, promoted, sending: null })

  const result = await drainCampaign(db, campaign, origin, CHUNK)
  return NextResponse.json({ ok: true, promoted, campaign: campaign.id, ...result })
}
