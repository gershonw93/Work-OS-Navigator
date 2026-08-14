import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET = 'plans'
const MAX_UPLOAD_BYTES = 200 * 1024 * 1024

/**
 * Hand the browser a signed URL so a drawing goes straight to storage.
 *
 * POST /api/projects/[id]/plans/upload took the bytes through the function,
 * which caps a request body at about 4.5MB. A drawing set is routinely bigger
 * than that, and the platform rejects an oversized body BEFORE any of our code
 * runs - nothing reaches the function, nothing is logged, and the page just
 * hangs. Plans are the single most likely thing on this app to be large, so
 * this was the worst place to leave that ceiling in.
 *
 * Same fix as company files (app/api/files/upload-url) and share links.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const name = String(body?.name ?? '').trim()
  const size = Number(body?.size ?? 0)
  const folderId = body?.folder_id ? String(body.folder_id) : null
  if (!name) return NextResponse.json({ error: 'No file name given' }, { status: 400 })
  if (size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: `${name} is larger than 200MB.` }, { status: 413 })
  }

  // Same layout the old route used, so existing plans and new ones sit together.
  const safe = name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100)
  const path = folderId
    ? `${params.id}/${folderId}/${Date.now()}-${safe}`
    : `${params.id}/${Date.now()}-${safe}`

  const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Could not prepare the upload' }, { status: 500 })
  }

  return NextResponse.json({ bucket: BUCKET, path, token: data.token })
}
