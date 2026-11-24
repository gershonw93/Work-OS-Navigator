import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { callGate, loadCall, actorName, logEvent } from '@/lib/service-calls-server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const BUCKET = 'daily-log-photos'
const MAX_BYTES = 15 * 1024 * 1024
// An iPhone photo is HEIC; refusing it as "not a photo" is the bug the daily
// log already paid for once.
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif', 'image/gif']

// POST multipart { file } - a photo on a call. Crew may add to their own call.
// The PATH is stored, never a signed URL (the GET signs one per read).
export async function POST(request: Request, { params }: { params: { callId: string } }) {
  const db = admin()
  const gate = await callGate(db, request, 'edit')
  if ('denied' in gate) return gate.denied
  const found = await loadCall(db, gate, params.callId)
  if ('denied' in found) return found.denied
  const call = found.call

  const form = await request.formData().catch(() => null)
  const file = form?.get('file')
  if (!(file instanceof File) || !file.size) return NextResponse.json({ error: 'Choose a photo to add.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That photo is over 15 MB.' }, { status: 400 })
  if (file.type && !PHOTO_TYPES.includes(file.type)) return NextResponse.json({ error: 'That file is not a photo.' }, { status: 400 })

  const safe = (file.name || 'photo').replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `service-calls/${gate.companyId}/${call.id}/${Date.now()}-${safe}`
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, await file.arrayBuffer(), { contentType: file.type || 'image/jpeg' })
  if (upErr) {
    console.error('[service-calls] photo upload failed', { call: call.id, error: upErr.message })
    return NextResponse.json({ error: 'The photo did not upload. Try again.' }, { status: 500 })
  }
  const { data, error } = await db.from('service_call_photos')
    .insert({ call_id: call.id, storage_path: path, file_name: file.name || null, uploaded_by: gate.actor.userId })
    .select('id').single()
  if (error) {
    // No row, no orphan: the object goes too.
    await db.storage.from(BUCKET).remove([path])
    console.error('[service-calls] photo row failed', { call: call.id, error: error.message })
    return NextResponse.json({ error: 'The photo did not save. Try again.' }, { status: 500 })
  }
  await logEvent(db, call.id, { kind: 'photo', actorId: gate.actor.userId, actorName: await actorName(db, gate.actor.userId) })
  return NextResponse.json({ ok: true, id: (data as any).id }, { status: 201 })
}
