import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET = 'submittals'
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024

/**
 * Hand the browser a signed URL per file so it uploads straight to storage.
 *
 * The old path posted the files through this API as multipart, which cannot
 * work for anything real: a serverless function caps the request body at about
 * 4.5MB, so a 10MB permit set was rejected by the platform before any of our
 * code ran - and the rejection isn't JSON, so the page could only say "upload
 * failed". Going direct to storage removes the ceiling and the whole class of
 * confusing failure with it.
 */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const db = admin()

  const { data: share } = await db.from('file_shares')
    .select('id, allow_upload, revoked_at, expires_at')
    .eq('token', params.token).single()

  if (!share) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  if (share.revoked_at) return NextResponse.json({ error: 'This link has been turned off.' }, { status: 410 })
  if (share.expires_at && new Date(share.expires_at) < new Date()) {
    return NextResponse.json({ error: 'This link has expired.' }, { status: 410 })
  }
  if (share.allow_upload === false) {
    return NextResponse.json({ error: 'This link is view-only.' }, { status: 403 })
  }

  const body = await request.json().catch(() => ({}))
  const files: { name?: string; size?: number }[] = Array.isArray(body.files) ? body.files : []
  if (!files.length) return NextResponse.json({ error: 'Nothing to upload' }, { status: 400 })
  if (files.length > 20) return NextResponse.json({ error: 'Twenty files at a time, please.' }, { status: 400 })

  const targets: { name: string; path: string; token: string }[] = []
  for (const f of files) {
    const name = String(f?.name ?? '').trim()
    if (!name) continue
    if (Number(f?.size ?? 0) > MAX_UPLOAD_BYTES) {
      return NextResponse.json({ error: `${name} is larger than 100MB.` }, { status: 413 })
    }
    const safe = name.replace(/[^\w.\-]+/g, '_').slice(-100)
    const path = `file-shares/${share.id}/${randomBytes(6).toString('hex')}-${safe}`

    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
    if (error || !data) {
      return NextResponse.json({ error: error?.message ?? 'Could not prepare the upload' }, { status: 500 })
    }
    targets.push({ name, path, token: data.token })
  }

  if (!targets.length) return NextResponse.json({ error: 'Nothing to upload' }, { status: 400 })
  return NextResponse.json({ bucket: BUCKET, targets })
}
