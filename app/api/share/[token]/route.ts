import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET = 'submittals'
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

// Public: no account, the token is the credential. Everything returned is
// limited to what the sender chose to send - never the wider project.
async function load(db: ReturnType<typeof admin>, token: string) {
  const { data } = await db
    .from('file_shares')
    .select('*, companies(name, logo_url), file_share_uploads(id, name, file_url, created_at)')
    .eq('token', token)
    .single()
  return data as any
}

function publicView(share: any) {
  return {
    name: share.name,
    message: share.message,
    files: share.files ?? [],
    from_company: share.companies?.name ?? null,
    from_logo: share.companies?.logo_url ?? null,
    from_person: share.created_by_name ?? null,
    recipient_name: share.recipient_name ?? null,
    allow_upload: share.allow_upload !== false,
    upload_prompt: share.upload_prompt ?? null,
    sent_at: share.created_at,
    uploads: (share.file_share_uploads ?? []).map((u: any) => ({ name: u.name, created_at: u.created_at })),
  }
}

export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const share = await load(db, params.token)
  if (!share) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  if (share.revoked_at) return NextResponse.json({ error: 'This link has been turned off by the sender.' }, { status: 410 })
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 })
  }

  // First open stamps it, so the sender can see it landed.
  if (!share.viewed_at) {
    await db.from('file_shares')
      .update({ viewed_at: new Date().toISOString(), status: share.status === 'sent' ? 'viewed' : share.status })
      .eq('id', share.id)
  }

  return NextResponse.json(publicView(share))
}

// POST - the recipient sends documents back on the same link.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const share = await load(db, params.token)
  if (!share) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  if (share.revoked_at) return NextResponse.json({ error: 'This link has been turned off.' }, { status: 410 })
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 })
  }
  if (share.allow_upload === false) {
    return NextResponse.json({ error: 'This link is view-only.' }, { status: 403 })
  }

  const form = await request.formData()
  const files = form.getAll('files').filter((f): f is File => f instanceof File)
  const note = (form.get('note') as string | null) ?? null
  if (files.length === 0) return NextResponse.json({ error: 'Choose at least one file' }, { status: 400 })

  const saved: { name: string; file_url: string }[] = []
  for (const file of files) {
    if (file.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `${file.name} is larger than 25MB` }, { status: 400 })
    }
    const safe = file.name.replace(/[^\w.\-]+/g, '_')
    const path = `file-shares/${share.id}/${randomBytes(6).toString('hex')}-${safe}`
    const { error: upErr } = await db.storage
      .from(BUCKET)
      .upload(path, file, { contentType: file.type || 'application/octet-stream', upsert: false })
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

    const { data: pub } = db.storage.from(BUCKET).getPublicUrl(path)
    saved.push({ name: file.name, file_url: pub.publicUrl })

    await db.from('file_share_uploads').insert({
      share_id: share.id,
      name: file.name,
      file_url: pub.publicUrl,
      file_type: file.type || null,
      size_bytes: file.size,
      note,
    })
  }

  await db.from('file_shares')
    .update({ status: 'responded', responded_at: new Date().toISOString() })
    .eq('id', share.id)

  return NextResponse.json({ ok: true, uploaded: saved.length })
}
