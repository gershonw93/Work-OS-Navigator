import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const isPdf = file.type === 'application/pdf'
  if (!imageTypes.includes(file.type) && !isPdf) {
    return NextResponse.json({ error: 'Upload an image (JPG, PNG) or PDF.' }, { status: 400 })
  }

  const bytes = await file.arrayBuffer()
  const base64 = Buffer.from(bytes).toString('base64')

  const prompt = `This is a construction subcontractor compliance document (COI, business license, W-9, workers' comp certificate, or similar). Extract key info and return ONLY a JSON object with these exact keys (use null for anything not found):
{
  "doc_type": "one of: coi, license, w9, workers_comp, other",
  "company_name": "the company/insured name on the document",
  "expiry_date": "expiration/renewal date in YYYY-MM-DD format, or null",
  "effective_date": "policy/effective start date in YYYY-MM-DD format, or null",
  "policy_number": "policy or license number, or null",
  "status": "approved if the document appears current and valid, expired if it is past its expiry date, pending otherwise",
  "coverage_summary": "for COI: one-line summary of key coverage amounts (e.g. GL $1M/$2M, Auto $1M, Umbrella $2M). For license: license type and number. For W-9: just the entity name. Null for unknown.",
  "notes": "any important flags: missing certificates, exclusions, upcoming expiry within 60 days, mismatch of company name, etc. Null if everything looks clean."
}
Return ONLY the JSON object, no other text.`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const content: Anthropic.MessageParam['content'] = isPdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } },
        { type: 'text', text: prompt },
      ]
    : [
        { type: 'image', source: { type: 'base64', media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } },
        { type: 'text', text: prompt },
      ]

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 512,
    messages: [{ role: 'user', content }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()

    // Upload file to storage
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${params.id}/compliance/${Date.now()}-${safeName}`
    let file_url: string | null = null
    const { error: upErr } = await db.storage.from('submittals').upload(storagePath, bytes, { contentType: file.type, upsert: true })
    if (!upErr) {
      const { data: signed } = await db.storage.from('submittals').createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
      file_url = signed?.signedUrl ?? null
    }

    return NextResponse.json({ fields: JSON.parse(cleaned), file_url })
  } catch {
    return NextResponse.json({ error: 'Could not read the document. Fill in the fields manually.' }, { status: 422 })
  }
}
