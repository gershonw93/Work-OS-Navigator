import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET = 'company-files'
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

/**
 * Hand the browser a signed URL so it uploads straight to storage.
 *
 * Uploading through POST /api/files could not work for anything real: a
 * serverless function caps the request body at about 4.5MB, so a set of plans
 * or a scanned permit package was rejected by the platform before any of our
 * code ran. Nothing reached the function, so nothing was logged, and the page
 * had no error to show - it just hung and reset, which is the worst possible
 * way for an upload to fail.
 *
 * Same fix as the share links (see app/api/share/[token]/upload-url).
 */
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  const company_id = (profile as any)?.company_id
  if (!company_id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const name = String(body?.name ?? '').trim()
  const size = Number(body?.size ?? 0)
  if (!name) return NextResponse.json({ error: 'No file name given' }, { status: 400 })
  if (size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `${name} is larger than 200MB.` }, { status: 413 })
  }

  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)
  const path = `${company_id}/${Date.now()}-${safe}`

  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not prepare the upload' }, { status: 500 })
  }

  return NextResponse.json({ bucket: BUCKET, path, token: data.token })
}
