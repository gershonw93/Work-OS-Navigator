import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { keyMatches, messageIdFrom, newPart, parseFrom, replyConfig, replyPrompt, suggestionFrom, tokenFromRecipients } from '@/lib/permit-reply'
import { guardScan, scanDenied } from '@/lib/scan-guard'
import { sendEmail } from '@/lib/email'
import { appOrigin } from '@/lib/app-url'
import type { RoundFile } from '@/lib/permit-rounds'

// ─────────────────────────────────────────────────────────────────────────────
// SendGrid Inbound Parse posts every email sent to *@REPLY_DOMAIN here.
//
// THE KEY IN THE URL IS THE ONLY GATE. This is a public endpoint with no
// session; anything that can POST could otherwise write onto a permit. An
// unset or short key refuses everything - an open door is never the default.
//
// ORDER: the reply is stored FIRST (the work), then forwarded to the person
// who emailed the township (so it still reaches their inbox), then read by AI
// into a suggested answer. Each later step failing leaves the earlier ones
// standing. Once stored we answer 200 whatever happens next: SendGrid retries
// anything else, and the Message-ID index already makes a retry a no-op.
// ─────────────────────────────────────────────────────────────────────────────

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MAX_FILES = 10
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_TEXT = 20000

export async function POST(request: Request) {
  const cfg = replyConfig()
  if (!cfg.enabled) return NextResponse.json({ error: 'Replies are not set up.' }, { status: 503 })
  if (!keyMatches(new URL(request.url).searchParams.get('key'), cfg.key)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = admin()
  const form = await request.formData().catch(() => null)
  if (!form) return NextResponse.json({ ignored: 'not a form post' }, { status: 200 })
  const str = (k: string) => { const v = form.get(k); return typeof v === 'string' ? v : '' }

  let envelopeTo: string[] = []
  try { envelopeTo = (JSON.parse(str('envelope') || '{}').to ?? []) as string[] } catch { /* headers below still carry it */ }
  const token = tokenFromRecipients([...envelopeTo, ...str('to').split(','), ...str('cc').split(',')], cfg.domain)
  if (!token) return NextResponse.json({ ignored: 'no permit address' }, { status: 200 })

  const { data: permit, error: pErr } = await db.from('permits')
    .select('id, project_id, permit_type, permit_number, issuing_authority, projects!inner ( name, address, gc_company_id )')
    .eq('reply_token', token).maybeSingle()
  if (pErr) {
    // A read that failed is not "no such permit": let SendGrid retry.
    console.error('[inbound-email] permit read failed', pErr.message)
    return NextResponse.json({ error: 'Try again' }, { status: 500 })
  }
  if (!permit) return NextResponse.json({ ignored: 'unknown permit address' }, { status: 200 })
  const project = (permit as any).projects as { name: string | null; address: string | null; gc_company_id: string | null }

  const from = parseFrom(str('from'))
  const text = str('text').slice(0, MAX_TEXT)
  const subject = str('subject').slice(0, 300)

  // 1. STORE IT. The row goes in before anything else; a duplicate Message-ID
  // means SendGrid is retrying one we already have.
  const { data: row, error: insErr } = await db.from('permit_inbound_emails').insert({
    permit_id: permit.id,
    project_id: permit.project_id,
    message_id: messageIdFrom(str('headers')),
    from_email: from.email,
    from_name: from.name,
    subject,
    text_body: text,
  }).select('id').single()
  if (insErr) {
    if ((insErr as any).code === '23505') return NextResponse.json({ ignored: 'already have it' }, { status: 200 })
    console.error('[inbound-email] store failed', insErr.message)
    return NextResponse.json({ error: 'Try again' }, { status: 500 })
  }

  // Attachments into the permits bucket, beside every other permit file.
  const files: { file: File; stored: RoundFile }[] = []
  const count = Math.min(Number(str('attachments')) || 0, MAX_FILES)
  for (let i = 1; i <= count; i++) {
    const f = form.get(`attachment${i}`)
    if (!f || typeof f === 'string' || f.size === 0 || f.size > MAX_FILE_BYTES) continue
    const safe = (f.name || `attachment-${i}`).replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${permit.project_id}/inbound/${row.id}/${i}-${safe}`
    const { error: upErr } = await db.storage.from('permits').upload(path, await f.arrayBuffer(), { contentType: f.type || undefined, upsert: false })
    if (upErr) { console.error('[inbound-email] attachment upload failed', f.name, upErr.message); continue }
    const { data: signed } = await db.storage.from('permits').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
    if (signed?.signedUrl) files.push({ file: f, stored: { name: f.name || `attachment-${i}`, url: signed.signedUrl, type: f.type || null, size: f.size } })
  }
  if (files.length) await db.from('permit_inbound_emails').update({ attachments: files.map(x => x.stored) }).eq('id', row.id)

  // 2. FORWARD IT to whoever last emailed the township from this permit, so
  // the reply still arrives where they would have looked for it.
  const { data: share } = await db.from('file_shares').select('created_by')
    .eq('permit_id', permit.id).not('created_by', 'is', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
  const senderId = (share as any)?.created_by as string | undefined
  let sender: { email: string | null; full_name: string | null } | null = null
  if (senderId) {
    const { data } = await db.from('profiles').select('email, full_name').eq('id', senderId).maybeSingle()
    sender = data as any
  }
  const permitUrl = `${appOrigin()}/projects/${permit.project_id}/permits`
  const label = `${permit.permit_type} permit${permit.permit_number ? ` #${permit.permit_number}` : ''}`
  if (sender?.email) {
    const body = [
      `${from.name || from.email || 'The township'} replied about the ${label} at ${project.address || project.name || 'the job'}. It is saved on the permit:`,
      permitUrl,
      '',
      ...(files.length ? ['Attachments (saved on the permit):', ...files.map(x => `- ${x.stored.name}: ${x.stored.url}`), ''] : []),
      '---',
      text || '(no text in the email)',
    ].join('\n')
    const sent = await sendEmail({
      to: sender.email,
      subject: `Re: ${subject || label}`.slice(0, 250),
      text: body,
      // Replying to this copy goes straight back to the township.
      replyTo: from.email,
      fromName: `${from.name || from.email || 'Township'} via SyteNav`,
    })
    if (sent.sent) await db.from('permit_inbound_emails').update({ forwarded_to: sender.email, forwarded_at: new Date().toISOString() }).eq('id', row.id)
    else console.error('[inbound-email] forward failed', sent.reason, (sent as any).detail ?? '')
  }

  // 3. READ IT into a suggested answer - metered like every other AI read,
  // against the company of the person who sent the email. Out of scans is
  // `skipped`, never a refusal of the reply itself.
  try {
    const scan = await guardScan(db, senderId ? { userId: senderId, companyId: project.gc_company_id } : null, 'permit-reply', permit.project_id)
    if (scanDenied(scan)) {
      await db.from('permit_inbound_emails').update({ suggestion_status: 'skipped' }).eq('id', row.id)
    } else {
      const doc = files.find(x => /pdf|image\/(jpeg|png|webp|gif)/.test(x.file.type) && x.file.size <= 5 * 1024 * 1024)
      const content: Anthropic.MessageParam['content'] = []
      if (doc) {
        const data = Buffer.from(await doc.file.arrayBuffer()).toString('base64')
        content.push(doc.file.type === 'application/pdf'
          ? ({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data } } as any)
          : ({ type: 'image', source: { type: 'base64', media_type: doc.file.type as any, data } }))
      }
      content.push({ type: 'text', text: `${replyPrompt(permit.permit_type, permit.issuing_authority)}\n\n<email subject="${subject.replace(/"/g, "'")}">\n${newPart(text) || text}\n</email>` })
      const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      const message = await anthropic.messages.create({ model: 'claude-opus-4-8', max_tokens: 1024, messages: [{ role: 'user', content }] })
      const out = message.content[0]?.type === 'text' ? message.content[0].text : ''
      const parsed = JSON.parse(out.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim())
      const suggestion = suggestionFrom(parsed)
      await scan.succeeded()
      await db.from('permit_inbound_emails').update({ suggestion, suggestion_status: suggestion.outcome === 'none' ? 'none' : 'ready' }).eq('id', row.id)
    }
  } catch (e) {
    console.error('[inbound-email] read failed', e)
    await db.from('permit_inbound_emails').update({ suggestion_status: 'failed' }).eq('id', row.id)
  }

  return NextResponse.json({ stored: row.id }, { status: 200 })
}
