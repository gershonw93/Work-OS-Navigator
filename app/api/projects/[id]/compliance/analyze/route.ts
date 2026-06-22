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

  const prompt = `This is a construction subcontractor compliance document. Identify the document type and extract structured fields. Return ONLY a JSON object:
{
  "doc_type": "one of: coi, license, w9, workers_comp, other",
  "company_name": "the company/insured name on the document or null",
  "expiry_date": "expiry/renewal date as YYYY-MM-DD or null",
  "effective_date": "policy start date as YYYY-MM-DD or null",
  "status": "approved if current and valid, expired if past expiry, pending otherwise",

  "insurer": "insurance company name or null",
  "policy_number": "policy number or null",
  "gl_per_occurrence": "general liability per occurrence limit as a number (e.g. 1000000) or null",
  "gl_aggregate": "general liability aggregate limit as a number or null",
  "auto_limit": "auto liability limit as a number or null",
  "umbrella_limit": "umbrella/excess limit as a number or null",
  "wc_el_accident": "workers comp EL per accident limit as a number or null",
  "additional_insured": true or false or null,

  "license_number": "license number or null",
  "license_type": "type of license e.g. General Contractor, Electrical, Plumbing or null",
  "issuing_state": "2-letter state code or null",

  "entity_type": "one of: individual, llc, corporation, partnership, other or null",
  "ein_last4": "last 4 digits of EIN/SSN or null",

  "wc_carrier": "workers comp carrier name or null",
  "wc_policy_number": "workers comp policy number or null",
  "wc_el_disease_limit": "EL disease per employee limit as a number or null",

  "notes": "any important flags: exclusions, missing coverage, name mismatch, etc. Null if clean."
}
Return ONLY the JSON object.`

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
    max_tokens: 1024,
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
