import { createClient } from '@supabase/supabase-js'
import { applyHowOf, emailWarning, type ApplyHow } from '@/lib/permit-apply'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { submitRound } from '@/lib/writes/permit-round'
import { createDirectoryContact } from '@/lib/writes/directory-contact'
import { filesFrom, permitFilesUploader } from '@/lib/permit-upload'
import { emailProblem, permitEmailCopy, splitAddresses, suggestAddress } from '@/lib/permit-email'
import { copyList, sendEmail, tokenLinkEmail } from '@/lib/email'
import { appOrigin } from '@/lib/app-url'
import { replyAddress, replyConfig, tokenFromBytes, TOKEN_PATTERN } from '@/lib/permit-reply'

export const runtime = 'nodejs'
// Uploads, a share, a send and a write - room to finish rather than be cut off
// half way with the email gone and nothing logged.
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type P = { params: { id: string; permitId: string } }

/** The signed-in person's own address and name - the copy and the reply-to. */
async function me(db: any, userId: string) {
  const { data } = await db.from('profiles').select('email, full_name, company_id').eq('id', userId).maybeSingle()
  let company: string | null = null
  if (data?.company_id) {
    const { data: c } = await db.from('companies').select('name').eq('id', data.company_id).maybeSingle()
    company = c?.name ?? null
  }
  return { email: (data?.email as string | null) ?? null, name: (data?.full_name as string | null) ?? null, company }
}

/** This permit's reply address, minting its token the first time. Null when replies are not set up. */
async function permitReplyTo(db: any, permitId: string): Promise<string | null> {
  const cfg = replyConfig()
  if (!cfg.enabled) return null
  const read = async () => {
    const { data } = await db.from('permits').select('reply_token').eq('id', permitId).maybeSingle()
    return (data?.reply_token as string | null) ?? null
  }
  let token = await read()
  if (!token || !TOKEN_PATTERN.test(token)) {
    // Only where there is none yet - two presses at once must not leave a
    // reply address in somebody's inbox that no longer finds its permit.
    await db.from('permits').update({ reply_token: tokenFromBytes(randomBytes(24)) }).eq('id', permitId).is('reply_token', null)
    token = await read()
  }
  return token && TOKEN_PATTERN.test(token) ? replyAddress(token, cfg.domain) : null
}

/** The address to start on: the Directory, else the last one this township was emailed at. */
async function suggestion(db: any, companyId: string | null, authority: string | null) {
  if (!companyId || !authority?.trim()) return { suggested: null, contactId: null as string | null, apply: null as ApplyHow | null }
  const [contacts, recent] = await Promise.all([
    db.from('companies').select('id, name, type, contact_email, extra').eq('added_by_company_id', companyId).limit(1000),
    db.from('file_shares').select('recipient_email, created_at, permits!inner ( issuing_authority )')
      .eq('company_id', companyId).not('permit_id', 'is', null).order('created_at', { ascending: false }).limit(50),
  ])
  if (contacts.error) console.error('[permit-email] directory read failed', contacts.error.message)
  if (recent.error) console.error('[permit-email] recent shares read failed', recent.error.message)
  const list = contacts.data ?? []
  const suggested = suggestAddress(authority, list,
    (recent.data ?? []).map((r: any) => ({ recipient_email: r.recipient_email, created_at: r.created_at, authority: r.permits?.issuing_authority })))
  // The Directory entry named for this township even when it has no address
  // yet, so saving fills that card in rather than making a second one.
  const named = list.filter((c: any) => (c.name ?? '').trim().toLowerCase().replace(/\s+/g, ' ') === authority.trim().toLowerCase().replace(/\s+/g, ' '))
  // How they take applications, off the same one card - two cards with the
  // township's name cannot be told apart, so neither speaks.
  return { suggested, contactId: named.length === 1 ? named[0].id as string : null, apply: named.length === 1 ? applyHowOf(named[0].extra) : null }
}

// What the Email it dialog opens on: who it goes to, and who gets the copy.
export async function GET(request: Request, { params }: P) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { data: permit } = await db.from('permits').select('issuing_authority').eq('id', params.permitId).eq('project_id', params.id).maybeSingle()
  if (!permit) return NextResponse.json({ error: 'That permit is not on this job.' }, { status: 404 })
  const [self, found] = await Promise.all([me(db, gate.actor.userId), suggestion(db, gate.actor.companyId, permit.issuing_authority)])
  return NextResponse.json({
    suggested: found.suggested, me: { email: self.email, name: self.name }, replies: replyConfig().enabled,
    warning: emailWarning(found.apply, permit.issuing_authority ?? ''),
  })
}

/**
 * Email the permit set to the township AND log it as sent - in that order.
 * The email goes in `beforeInsert`, after every check has passed and the
 * files are uploaded: if it does not leave, NOTHING is logged, because a
 * permit reading "with the township" over an email that never went is the
 * claim this whole screen exists to stop making.
 */
export async function POST(request: Request, { params }: P) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject<{ id: string; name: string | null; address: string | null }>(db, gate.actor, params.id, 'id, name, address')
  if ('denied' in owned) return owned.denied

  const form = await request.formData()
  const str = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v.trim() : '' }
  const to = str('to')
  const extra = splitAddresses(str('cc'))
  const problem = emailProblem({ to, cc: extra })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const self = await me(db, gate.actor.userId)
  // WHERE A REPLY GOES. With replies set up, to this permit's own address -
  // the inbound route files it here and forwards a copy to the sender. Until
  // then, straight to the sender, as before. The token is minted once, the
  // first time the permit is emailed, and never changes after.
  const replyTo = await permitReplyTo(db, params.permitId) ?? self.email
  const cc = copyList(to, [...(str('cc_me') === '1' && self.email ? [self.email] : []), ...extra])
  const origin = appOrigin(request.headers.get('origin'))
  const job = owned.project.address?.trim() || owned.project.name?.trim() || 'the job'
  let shareId: string | null = null

  const result = await submitRound(db, {
    userId: gate.actor.userId, projectId: params.id, permitId: params.permitId,
    fields: { submitted_on: str('submitted_on') || new Date().toISOString().slice(0, 10), expected_by: str('expected_by') || null, note: str('note') || null },
    uploadFiles: permitFilesUploader(db, params.id, filesFrom(form)),
    carry: form.getAll('carry').filter((v): v is string => typeof v === 'string'),
    beforeInsert: async ({ permit, files, round }) => {
      const copy = permitEmailCopy({
        permitType: permit.permit_type, job, senderName: self.name, companyName: self.company, round, message: str('message'),
      })
      // The same token link as the Sharing tab, born tied to this permit, so
      // what the township uploads back lands in the permit's history.
      const { data: share, error: shareErr } = await db.from('file_shares').insert({
        company_id: gate.actor.companyId,
        project_id: params.id,
        permit_id: params.permitId,
        token: randomBytes(24).toString('base64url'),
        name: copy.heading,
        message: str('message') || null,
        files,
        recipient_name: permit.issuing_authority || null,
        recipient_email: to,
        allow_upload: true,
        upload_prompt: 'Send comments, a corrections list or the approved permit back here.',
        created_by: gate.actor.userId,
        created_by_name: self.name,
      }).select('id, token').single()
      if (shareErr || !share) {
        console.error('[permit-email] share insert failed', shareErr?.message)
        return { ok: false, result: { status: 500, body: { error: 'Could not prepare the email. Nothing was sent or logged - try again.' } } }
      }
      shareId = share.id

      const email = tokenLinkEmail({
        recipientName: permit.issuing_authority, eyebrow: 'Permit application', heading: copy.heading,
        lines: copy.lines, ctaLabel: files.length === 1 ? 'Open the document' : 'Open the documents',
        url: `${origin}/share/${share.token}`, fromName: self.name, companyName: self.company,
      })
      const sent = await sendEmail({
        to, ...email, cc,
        // A reply is to the GC who sent it - the township's answer must not
        // land in SyteNav's support inbox.
        replyTo,
        fromName: [self.name, self.company].filter(Boolean).length ? `${[self.name, self.company && `at ${self.company}`].filter(Boolean).join(' ')} via SyteNav` : null,
      })
      if (!sent.sent) {
        // Nothing went, so nothing is logged and no link is left behind.
        await db.from('file_shares').delete().eq('id', share.id)
        console.error('[permit-email] send failed', sent.reason, (sent as any).detail ?? '')
        return {
          ok: false,
          result: {
            status: sent.reason === 'invalid' ? 400 : 502,
            body: {
              sent: false,
              error: sent.reason === 'not_configured'
                ? 'Email sending is not set up yet, so nothing was sent and nothing was logged. Send it yourself and press I sent it.'
                : sent.reason === 'invalid'
                  ? `"${to}" could not be emailed. Nothing was sent or logged.`
                  : 'The email did not go through, so nothing was logged. Try again, or send it yourself and press I sent it.',
            },
          },
        }
      }
      await db.from('file_shares').update({ status: 'sent' }).eq('id', share.id)
      return { ok: true, note: `Emailed to ${to}${cc.length ? `, copy to ${cc.join(', ')}` : ''}` }
    },
  })

  if (result.status >= 300) {
    // The email went but the log did not (two tabs, a dropped write): say
    // exactly that rather than "failed", which would invite a second email.
    if (shareId && result.status !== 400 && result.status !== 502) {
      return NextResponse.json({ sent: true, logged: false, error: `The email to ${to} was sent, but it could not be logged. Press I sent it to record it - do not email it again.` }, { status: 207 })
    }
    return NextResponse.json(result.body, { status: result.status })
  }

  // Save the township's address so every permit with this authority starts on it.
  if (str('save_address') === '1') {
    try {
      const { data: permit } = await db.from('permits').select('issuing_authority').eq('id', params.permitId).maybeSingle()
      const authority = permit?.issuing_authority?.trim()
      if (authority && gate.actor.companyId) {
        const found = await suggestion(db, gate.actor.companyId, authority)
        if (found.contactId) {
          await db.from('companies').update({ contact_email: to }).eq('id', found.contactId).eq('added_by_company_id', gate.actor.companyId)
        } else {
          const saved = await createDirectoryContact(db, { myCompanyId: gate.actor.companyId, body: { name: authority, type: 'inspector', contact_email: to } })
          if (saved.status >= 300) console.error('[permit-email] directory save refused', saved.body?.error)
        }
      }
    } catch (e) {
      // The email went and the submission is logged; a missed save is not a failure of either.
      console.error('[permit-email] directory save failed', e)
    }
  }

  return NextResponse.json({ ...result.body, sent: true, logged: true, to, cc }, { status: 201 })
}
