import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PROMPT = `This is a contractor/vendor price quote (bid/estimate/proposal). Extract its details and return ONLY a JSON object with these exact keys (use null when not found):
{
  "vendor_name": "the company that issued the quote",
  "total_amount": number (the grand total in dollars, no currency symbol or commas; null if not stated),
  "valid_until": "YYYY-MM-DD or null (quote expiration / valid-through date)",
  "scope_summary": "1-2 sentence summary of the work quoted",
  "line_items": [{ "description": "string", "quantity": number|null, "unit_price": number|null, "amount": number|null }],
  "inclusions": ["notable things explicitly included"],
  "exclusions": ["notable things explicitly excluded / not included"],
  "payment_terms": "string or null",
  "notes": "any other notable terms (lead time, warranty, etc.) or null"
}
Return ONLY the JSON object, no other text.`

export async function POST(request: Request, { params }: { params: { id: string; compId: string } }) {
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
  if (!isPdf && !imageTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Only PDF or image files are supported.' }, { status: 400 })
  }

  // Store the file
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${params.id}/quotes/${Date.now()}-${safeName}`
  const buf = await file.arrayBuffer()
  const { error: upErr } = await db.storage.from('submittals').upload(path, buf, { contentType: file.type, upsert: true })
  let file_url: string | null = null
  if (!upErr) {
    const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
    file_url = signed?.signedUrl ?? null
  }

  // Analyze with Claude
  const base64 = Buffer.from(buf).toString('base64')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const content: Anthropic.MessageParam['content'] = isPdf
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any, { type: 'text', text: PROMPT }]
    : [{ type: 'image', source: { type: 'base64', media_type: file.type as any, data: base64 } }, { type: 'text', text: PROMPT }]

  let parsed: any = {}
  let extractError: string | null = null
  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 8192,
      messages: [{ role: 'user', content }],
    })
    const raw = message.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
    // Robustly pull the JSON object even if the model wrapped it in prose/fences
    let jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
    const first = jsonStr.indexOf('{')
    const last = jsonStr.lastIndexOf('}')
    if (first >= 0 && last > first) jsonStr = jsonStr.slice(first, last + 1)
    parsed = JSON.parse(jsonStr)
  } catch (e: any) {
    extractError = e?.message ? `Could not read this file automatically (${e.message})` : 'Could not read this file automatically'
    console.error('[quotes/upload] extract failed:', e)
  }

  const num = (v: any) => {
    if (typeof v === 'number' && isFinite(v)) return v
    if (typeof v === 'string') { const n = Number(v.replace(/[^0-9.\-]/g, '')); return isFinite(n) && v.trim() ? n : null }
    return null
  }

  const { data, error } = await db
    .from('quotes')
    .insert({
      comparison_id: params.compId,
      file_url,
      file_name: file.name,
      vendor_name: parsed.vendor_name ?? null,
      total_amount: num(parsed.total_amount),
      valid_until: parsed.valid_until ?? null,
      scope_summary: parsed.scope_summary ?? null,
      data: {
        line_items: parsed.line_items ?? [],
        inclusions: parsed.inclusions ?? [],
        exclusions: parsed.exclusions ?? [],
        payment_terms: parsed.payment_terms ?? null,
        notes: parsed.notes ?? null,
        extract_error: extractError,
      },
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ quote: data })
}
