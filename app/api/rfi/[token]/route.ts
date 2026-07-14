import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Public: the architect/designer opens the one-time link, reads the RFI, and
// submits the answer. No account needed - mirrors the compliance upload links.
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: rfi } = await db.from('rfis').select('*').eq('answer_token', params.token).single()
  if (!rfi) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  const { data: project } = await db.from('projects').select('name, address').eq('id', rfi.project_id).single()

  return NextResponse.json({
    rfi: {
      rfi_number: rfi.rfi_number,
      subject: rfi.subject,
      description: rfi.description,
      attachments: rfi.attachments ?? [],
      status: rfi.status,
      response: rfi.response,
      responded_by_name: rfi.responded_by_name,
      requested_name: rfi.answer_requested_name,
      created_at: rfi.created_at,
    },
    project: { name: project?.name ?? null, address: project?.address ?? null },
  })
}

export async function POST(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: rfi } = await db.from('rfis').select('id, project_id, rfi_number, answer_requested_name').eq('answer_token', params.token).single()
  if (!rfi) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  const form = await request.formData()
  const name = (form.get('name') as string) || rfi.answer_requested_name || 'External responder'
  const response = ((form.get('response') as string) || '').trim()
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0)

  if (!response && files.length === 0) {
    return NextResponse.json({ error: 'Write an answer or attach a file.' }, { status: 400 })
  }

  const attachments: { file_url: string; file_name: string }[] = []
  for (const file of files.slice(0, 5)) {
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `rfi-answers/${rfi.id}/${Date.now()}-${safe}`
    const { error: upErr } = await db.storage.from('submittals').upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
    const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
    if (signed?.signedUrl) attachments.push({ file_url: signed.signedUrl, file_name: file.name })
  }

  const { error } = await db.from('rfis').update({
    response: response || null,
    response_attachments: attachments.length ? attachments : null,
    responded_by_name: name,
    responded_at: new Date().toISOString(),
    status: 'answered',
  }).eq('id', rfi.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, rfi.project_id, name, 'rfi_answered',
    `RFI #${rfi.rfi_number} answered via link by ${name}`,
    { rfi_id: rfi.id, rfi_number: rfi.rfi_number, via: 'answer_link' })

  return NextResponse.json({ ok: true })
}
