import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { tokenLinkEmail } from '@/lib/email'
import { deliverLink, readSendBody } from '@/lib/send-link'
import { appOrigin } from '@/lib/app-url'
import { complianceAccess } from '@/lib/writes/compliance-access'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Email a sub the link to upload their compliance documents. */
export async function POST(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const db = admin()
  // This emails somebody OUTSIDE the company, in the GC's name: `compliance:
  // edit` on a job the caller's company owns, and only a request filed on it.
  const access = await complianceAccess(db, request, params.id, { write: true })
  if ('denied' in access) return access.denied
  if (access.scope !== 'owner') {
    return NextResponse.json({ error: 'This job belongs to another company.' }, { status: 403 })
  }
  const user = { id: access.actor.userId }

  const { to, note } = await readSendBody(request)

  const [{ data: req }, { data: me }, { data: project }] = await Promise.all([
    db.from('compliance_requests').select('token, doc_types, vendor_name').eq('id', params.reqId).eq('project_id', params.id).maybeSingle(),
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
    onSent: () => db.from('compliance_requests').update({ status: 'sent' }).eq('id', params.reqId).eq('project_id', params.id),
  })
}
