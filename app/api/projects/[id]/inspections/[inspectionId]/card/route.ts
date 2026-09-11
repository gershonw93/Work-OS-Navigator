import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { canCarryCompletion } from '@/lib/inspection-status'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Attach the inspector's card/paperwork to an existing inspection AFTER the fact,
// and let AI read the details off it. Only fills fields that are still empty.
export async function POST(request: Request, { params }: { params: { id: string; inspectionId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'No file' }, { status: 400 })

  // heic/heif are what an iPhone produces by default. The picker accepts
  // `image/*` and let them through, and then this list rejected them with "Use
  // a photo or PDF." - which is nonsense said to somebody who has just taken a
  // photo.
  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']
  const isPdf = file.type === 'application/pdf'
  if (!isPdf && !imageTypes.includes(file.type)) return NextResponse.json({ error: 'Use a photo or PDF.' }, { status: 400 })

  const bytes = await file.arrayBuffer()

  // Store the card image.
  let card_image_url: string | null = null
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${params.id}/${Date.now()}-${safe}`
  const { error: upErr } = await db.storage.from('inspections').upload(path, bytes, { contentType: file.type, upsert: true })
  if (!upErr) {
    const { data: signed } = await db.storage.from('inspections').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
    card_image_url = signed?.signedUrl ?? null
  }

  // Read the card with AI (best-effort).
  let fields: any = null
  try {
    const base64 = Buffer.from(bytes).toString('base64')
    const prompt = `This is a construction inspection card/paperwork from the inspector. Return ONLY JSON:
{
  "status": one of ["passed","failed","pending_reinspection"] if a result is marked, else null,
  "scheduled_date": "YYYY-MM-DD or null",
  "completed_date": "YYYY-MM-DD or null (the date the inspection happened)",
  "inspector_name": "or null",
  "inspector_phone": "or null",
  "scheduling_phone": "or null",
  "notes": "permit #, authority, checked items, address, or null"
}`
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const content: Anthropic.MessageParam['content'] = isPdf
      ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any, { type: 'text', text: prompt }]
      : [{ type: 'image', source: { type: 'base64', media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } }, { type: 'text', text: prompt }]
    const message = await anthropic.messages.create({ model: 'claude-opus-4-8', max_tokens: 1024, messages: [{ role: 'user', content }] })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    fields = JSON.parse(text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim())
  } catch { /* card unreadable - still attach the image */ }

  // Only fill blanks; never overwrite what the user already entered.
  const { data: existing } = await db.from('inspections').select('*').eq('id', params.inspectionId).eq('project_id', params.id).single()
  const updates: Record<string, unknown> = { card_image_url }
  if (fields) {
    const fillIfEmpty = (col: string, val: any) => { if (val && !(existing as any)?.[col]) updates[col] = val }
    fillIfEmpty('inspector_name', fields.inspector_name)
    fillIfEmpty('inspector_phone', fields.inspector_phone)
    fillIfEmpty('scheduling_phone', fields.scheduling_phone)
    // A DATE ON ITS OWN PUTS THE ROW ON EVERYONE'S CALENDAR. The master
    // calendar and the subscribed ICS feed show any inspection carrying a
    // `scheduled_date`, whatever its status - so filling that column silently
    // asserts a confirmed appointment. The card IS evidence that one happened,
    // so it writes the evidence beside the date rather than the date alone.
    if (fields.scheduled_date && !(existing as any)?.scheduled_date) {
      updates.scheduled_date = fields.scheduled_date
      if (!(existing as any)?.booked_with) {
        updates.booked_with = fields.inspector_name
          ? `${fields.inspector_name} (read from the inspector's card)`
          : "Read from the inspector's card"
      }
    }
    // A COMPLETION DATE IS NOT A FREE FIELD. This wrote it straight onto the
    // row while asking about the RESULT separately, so declining "the card
    // looks PASSED, mark it passed?" left a `requested` inspection reading
    // "Completed Sep 24, 2026" under a Book it button. `clearsCompletion`
    // never saw it, because that fires on a status MOVE and no status moved.
    //
    // Filling a blank on an already-finished record is not a contradiction, so
    // that still happens. Otherwise the date is HANDED BACK below and written
    // only if somebody says the inspection is finished.
    if (canCarryCompletion((existing as any)?.status)) {
      fillIfEmpty('completed_date', fields.completed_date)
    }
    if (fields.notes && !(existing as any)?.notes) updates.notes = fields.notes
  }

  let { data: inspection, error } = await db.from('inspections').update(updates).eq('id', params.inspectionId).eq('project_id', params.id).select().single()
  if (error && (error as any).code === '42703') {
    const retry = await db.from('inspections').update({ card_image_url }).eq('id', params.inspectionId).eq('project_id', params.id).select().single()
    inspection = retry.data; error = retry.error
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The date PRINTED ON THE CARD, offered alongside the result. Accepting the
  // suggestion used to stamp today - so the one path that resolved the
  // contradiction also threw away the better date.
  return NextResponse.json({
    inspection,
    suggested_status: fields?.status ?? null,
    suggested_completed_date: fields?.completed_date ?? null,
  })
}
