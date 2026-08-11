import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MAX_BYTES = 8 * 1024 * 1024

/**
 * A photo of the actual thing.
 *
 * A color picker is useless for this - nobody eyeballs Sherwin Williams
 * Alabaster off a color wheel. What people have is a photo: a phone shot of the
 * sample board, a screenshot off the supplier's page, the tile in the showroom.
 * So take the image.
 *
 * The bucket is private like every other bucket here, so what comes back is a
 * long-lived signed URL rather than a public one - the client opens it on a
 * token link with no account.
 */
export async function POST(request: Request, { params }: { params: { id: string; selId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'No image provided' }, { status: 400 })
  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: 'That needs to be an image - a photo or a screenshot.' }, { status: 415 })
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'That image is over 8MB. A phone photo scaled down is plenty.' }, { status: 413 })
  }

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const path = `selections/${params.id}/${params.selId}/${Date.now()}-${safe}`

  const { error: upErr } = await db.storage.from('company-files')
    .upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

  const { data: signed } = await db.storage.from('company-files')
    .createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
  if (!signed?.signedUrl) return NextResponse.json({ error: 'Could not link that image' }, { status: 500 })

  // Attach straight to an existing option when told which, so the caller does
  // not need a second round trip to save it.
  const optionId = form.get('optionId') as string | null
  if (optionId) {
    await db.from('selection_options')
      .update({ image_url: signed.signedUrl })
      .eq('id', optionId).eq('selection_id', params.selId)
  }

  return NextResponse.json({ image_url: signed.signedUrl })
}
