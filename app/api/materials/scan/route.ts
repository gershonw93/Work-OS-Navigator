import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const CATEGORIES = ['Lumber', 'Electrical', 'Plumbing', 'Hardware', 'Concrete', 'Paint', 'Drywall', 'Tools', 'Fuel', 'Rental', 'Other']

// Scan a material receipt photo: store, date, total, tax, and line items.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const isPdf = file.type === 'application/pdf'
  if (!imageTypes.includes(file.type) && !isPdf) {
    return NextResponse.json({ error: 'Upload a photo (JPG/PNG) or PDF of the receipt.' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  // Store the receipt image so it's kept with the record.
  let receipt_url: string | null = null
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `receipts/${profile?.company_id ?? 'unknown'}/${Date.now()}-${safe}`
  const { error: upErr } = await db.storage.from('submittals').upload(path, bytes, { contentType: file.type, upsert: true })
  if (!upErr) {
    const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
    receipt_url = signed?.signedUrl ?? null
  }

  const prompt = `This is a receipt for construction materials or supplies. Extract the details and return ONLY a JSON object:
{
  "store_name": "the store/vendor name at the top of the receipt, or null",
  "purchase_date": "date on the receipt as YYYY-MM-DD, or null",
  "subtotal": "subtotal before tax as a number, or null",
  "tax": "tax amount as a number, or null",
  "total": "grand total as a number, or null",
  "category": "best guess of one of: ${CATEGORIES.join(', ')}",
  "line_items": [ { "description": "item name", "qty": number or null, "amount": number or null } ]
}
Keep line_items short (skip store boilerplate). Return ONLY the JSON object.`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const content: Anthropic.MessageParam['content'] = isPdf
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: prompt }]
    : [{ type: 'image', source: { type: 'base64', media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } }, { type: 'text', text: prompt }]

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 1024,
      messages: [{ role: 'user', content }],
    })
    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
    const fields = JSON.parse(cleaned)
    return NextResponse.json({ fields, receipt_url })
  } catch {
    // Scan failed - still return the stored image so they can fill it in by hand.
    return NextResponse.json({ fields: null, receipt_url, error: 'Could not read the receipt - enter the details manually.' })
  }
}
