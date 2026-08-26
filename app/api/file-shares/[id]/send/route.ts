import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { tokenLinkEmail } from '@/lib/email'
import { deliverLink, readSendBody } from '@/lib/send-link'
import { appOrigin } from '@/lib/app-url'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Email somebody the link to a set of shared documents. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const auth = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, note } = await readSendBody(request)

  const { data: share } = await db.from('file_shares')
    .select('token, name, message, files, recipient_name, allow_upload, upload_prompt, created_by_name, revoked_at, expires_at')
    .eq('id', params.id).maybeSingle()
  if (!share?.token) return NextResponse.json({ error: 'That share no longer exists.' }, { status: 404 })

  // Sending a link that is already dead would be worse than not sending.
  if (share.revoked_at) return NextResponse.json({ error: 'That share has been revoked. Create a new one first.' }, { status: 400 })
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'That share has expired. Create a new one first.' }, { status: 400 })
  }

  const count = Array.isArray(share.files) ? share.files.length : 0
  const lines = [
    `${share.created_by_name ?? 'Your contractor'} has shared ${count ? `${count} document${count === 1 ? '' : 's'}` : 'some documents'} with you${share.name ? `: ${share.name}` : ''}.`,
  ]
  if (share.message) lines.push(share.message)
  if (share.allow_upload) lines.push(share.upload_prompt || 'You can also send documents back from the same page.')

  const email = tokenLinkEmail({
    recipientName: share.recipient_name,
    eyebrow: 'Documents shared with you',
    heading: share.name || 'Documents shared with you',
    lines,
    ctaLabel: count === 1 ? 'Open the document' : 'Open the documents',
    url: `${appOrigin(request.headers.get('origin'))}/share/${share.token}`,
    fromName: share.created_by_name,
    note,
  })

  return deliverLink({
    to,
    email,
    onSent: () => db.from('file_shares').update({ status: 'sent' }).eq('id', params.id),
  })
}
