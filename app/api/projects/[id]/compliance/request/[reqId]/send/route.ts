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

/** Email a sub the link to upload their compliance documents. */
export async function POST(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const auth = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(auth)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { to, note } = await readSendBody(request)

  const [{ data: req }, { data: me }, { data: project }] = await Promise.all([
    db.from('compliance_requests').select('token, doc_types, vendor_name').eq('id', params.reqId).maybeSingle(),
    db.from('profiles').select('full_name, company_id').eq('id', user.id).maybeSingle(),
    db.from('projects').select('name').eq('id', params.id).maybeSingle(),
  ])
  if (!req?.token) return NextResponse.json({ error: 'That request no longer exists.' }, { status: 404 })

  const { data: company } = (me as any)?.company_id
    ? await db.from('companies').select('name').eq('id', (me as any).company_id).maybeSingle()
    : { data: null }

  const docs = (req.doc_types ?? []).join(', ')
  const email = tokenLinkEmail({
    recipientName: req.vendor_name,
    eyebrow: 'Document request',
    heading: 'Upload your compliance documents',
    lines: [
      `${(company as any)?.name ?? 'Your contractor'} needs a few documents on file${(project as any)?.name ? ` for ${(project as any).name}` : ''}.`,
      docs ? `What is needed: ${docs}.` : 'The link lists what is needed.',
    ],
    ctaLabel: 'Upload documents',
    url: `${appOrigin(request.headers.get('origin'))}/compliance/${req.token}`,
    fromName: (me as any)?.full_name ?? null,
    companyName: (company as any)?.name ?? null,
    note,
  })

  return deliverLink({
    to,
    email,
    onSent: () => db.from('compliance_requests').update({ status: 'sent' }).eq('id', params.reqId),
  })
}
