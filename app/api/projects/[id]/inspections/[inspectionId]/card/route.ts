import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
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
  } catch { /* card unreadable — still attach the image */ }

  // Only fill blanks; never overwrite what the user already entered.
  const { data: existing } = await db.from('inspections').select('*').eq('id', params.inspectionId).eq('project_id', params.id).single()
  const updates: Record<string, unknown> = { card_image_url }
  if (fields) {
    const fillIfEmpty = (col: string, val: any) => { if (val && !(existing as any)?.[col]) updates[col] = val }
    fillIfEmpty('inspector_name', fields.inspector_name)
    fillIfEmpty('inspector_phone', fields.inspector_phone)
    fillIfEmpty('scheduling_phone', fields.scheduling_phone)
    fillIfEmpty('scheduled_date', fields.scheduled_date)
    fillIfEmpty('completed_date', fields.completed_date)
    if (fields.notes && !(existing as any)?.notes) updates.notes = fields.notes
  }

  let { data: inspection, error } = await db.from('inspections').update(updates).eq('id', params.inspectionId).eq('project_id', params.id).select().single()
  if (error && (error as any).code === '42703') {
    const retry = await db.from('inspections').update({ card_image_url }).eq('id', params.inspectionId).eq('project_id', params.id).select().single()
    inspection = retry.data; error = retry.error
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ inspection, suggested_status: fields?.status ?? null })
}
