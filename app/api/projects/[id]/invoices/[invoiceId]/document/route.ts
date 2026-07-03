import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Attach the vendor's actual invoice file (PDF/image) to an invoice record.
export async function POST(request: Request, { params }: { params: { id: string; invoiceId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `invoice-docs/${params.id}/${params.invoiceId}-${Date.now()}-${safe}`
  const { error: upErr } = await db.storage.from('submittals').upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
  const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)

  const { error } = await db.from('invoices')
    .update({ document_url: signed?.signedUrl ?? null, document_name: file.name })
    .eq('id', params.invoiceId).eq('project_id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ document_url: signed?.signedUrl ?? null, document_name: file.name })
}
