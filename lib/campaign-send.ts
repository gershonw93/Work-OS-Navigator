import type { SupabaseClient } from '@supabase/supabase-js'
import { campaignEmail, sendEmail } from './email'
import { fillCampaign } from './campaign-copy'
import { normaliseEmail, peopleFor, parseAddressList } from './campaign-audience'
import { readAudience, readSuppressions } from './campaign-audience-read'
import { unsubscribeUrl } from './unsubscribe-token'

// ─────────────────────────────────────────────────────────────────────────────
// Sending a campaign, one chunk at a time.
//
// THE RECIPIENT ROWS ARE WRITTEN BEFORE ANYTHING GOES OUT, and they do three
// jobs at once: the unique index is the gate that stops an overlapping run
// mailing somebody twice, the rows are the record of who got what, and what is
// left `pending` is the resume point. A hundred recipients in one serverless
// invocation is a timeout with half the list mailed and no way to know which
// half - which is not a thing you can apologise for by sending it again.
//
// SUPPRESSION IS ASKED AGAIN HERE. The list was built when the campaign was
// composed, possibly days before it goes; somebody who unsubscribed in between
// is only caught by this second check, and it is the one that matters.
//
// AND `sendEmail` DOES NOT ASK IT. Putting the suppression check inside the
// sender would look tidier and would be a disaster: one unsubscribe would
// start silently eating invoices, bid requests and password resets. Only this
// module asks, because only this module sends bulk mail. Pinned.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A send small enough that it cannot time out, and small enough that it is
 * obviously somebody checking their own copy rather than a campaign. Those go
 * out in the request that starts them; everything bigger waits for the cron.
 */
export const TEST_SEND_MAX = 5

export interface CampaignRow {
  id: string
  name: string
  subject: string
  body: string
  segment: string
  custom_emails: string[] | null
  status: string
}

export interface RecipientDraft {
  campaign_id: string
  profile_id: string | null
  email: string
  first_name: string | null
  company_name: string | null
}

/**
 * Who this campaign goes to, as rows ready to insert.
 *
 * Returns null when a read did not complete. An incomplete audience is not a
 * smaller audience: it silently drops people, and for a "trial ending" campaign
 * the people it drops are the ones the mail was for.
 */
export async function buildRecipients(
  db: SupabaseClient,
  campaign: { id: string; segment: string; custom_emails?: string[] | null },
  now: Date = new Date(),
): Promise<RecipientDraft[] | null> {
  const suppressed = await readSuppressions(db)
  if (!suppressed) return null

  const custom = (campaign.custom_emails ?? []).flatMap(e => parseAddressList(e))
  if (custom.length) {
    return custom
      .filter(email => !suppressed.has(email))
      .map(email => ({ campaign_id: campaign.id, profile_id: null, email, first_name: null, company_name: null }))
  }

  const audience = await readAudience(db)
  if (!audience.complete) return null

  return peopleFor(campaign.segment, audience.people, now)
    .filter(p => !suppressed.has(normaliseEmail(p.email)))
    .map(p => ({
      campaign_id: campaign.id,
      profile_id: p.profileId,
      email: normaliseEmail(p.email),
      first_name: p.firstName,
      company_name: p.companyName,
    }))
}

export interface DrainResult {
  sent: number
  failed: number
  skipped: number
  /** Nothing left pending - the campaign is finished. */
  done: boolean
  /** Why the run stopped early, when it did. */
  stopped?: string
}

/** Send the next `limit` pending recipients of one campaign. */
export async function drainCampaign(
  db: SupabaseClient,
  campaign: CampaignRow,
  origin: string,
  limit = 50,
): Promise<DrainResult> {
  const out: DrainResult = { sent: 0, failed: 0, skipped: 0, done: false }

  const suppressed = await readSuppressions(db)
  if (!suppressed) {
    // A suppression list we could not read is not an empty one. Stopping costs
    // a delay; guessing costs mail to people who asked us not to send it.
    return { ...out, stopped: 'could not read the suppression list' }
  }

  const { data, error } = await db
    .from('campaign_recipients')
    .select('id, email, first_name, company_name')
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')
    .limit(limit)

  if (error) {
    console.error('[campaigns] could not read the pending recipients', error.message)
    return { ...out, stopped: error.message }
  }

  const rows = (data ?? []) as { id: string; email: string; first_name: string | null; company_name: string | null }[]

  for (const r of rows) {
    const address = normaliseEmail(r.email)

    if (suppressed.has(address)) {
      await mark(db, r.id, 'skipped', 'unsubscribed')
      out.skipped++
      continue
    }

    const words = fillCampaign(campaign, { firstName: r.first_name, companyName: r.company_name })
    const mail = campaignEmail({
      name: r.first_name,
      subject: words.subject,
      paragraphs: words.paragraphs,
      unsubscribeUrl: unsubscribeUrl(origin, address),
    })

    // ONE BAD ADDRESS MUST NOT TAKE THE REST OF THE LIST DOWN - `uploadOne`'s
    // rule, one loop over. Every recipient carries its own answer and its own
    // reason, so a failure is a row somebody can look at rather than a run that
    // stopped somewhere nobody can see.
    const result = await sendEmail({
      to: address,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
      unsubscribeUrl: mail.unsubscribeUrl,
    })

    if (result.sent) {
      await mark(db, r.id, 'sent', null)
      out.sent++
    } else {
      await mark(db, r.id, 'failed', `${result.reason}${result.detail ? `: ${result.detail}` : ''}`.slice(0, 300))
      out.failed++
    }
  }

  const { count } = await db
    .from('campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaign.id)
    .eq('status', 'pending')

  out.done = (count ?? 0) === 0
  if (out.done) {
    await db.from('email_campaigns')
      .update({ status: 'sent', finished_at: new Date().toISOString() })
      .eq('id', campaign.id)
  }
  return out
}

async function mark(db: SupabaseClient, id: string, status: string, reason: string | null): Promise<void> {
  const { error } = await db.from('campaign_recipients')
    .update({ status, reason, sent_at: new Date().toISOString() })
    .eq('id', id)
  if (error) console.error('[campaigns] could not mark a recipient', { id, status, error: error.message })
}
