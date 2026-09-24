import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { comparisonTitle, isUntitled } from '@/lib/quote-comparison'
import { friendlyDbError } from '@/lib/db-error'
import { requirePermission, denied } from '@/lib/api-guard'
import { guardScan, scanDenied } from '@/lib/scan-guard'

export const runtime = 'nodejs'

// This route reads a document with an AI model. Without this it gets the
// platform default, which is far too short for a scan - the request is cut off
// mid-read and the browser reports a network failure for work the user watched
// start. 60 is what the invoice scan next door has always used.
export const maxDuration = 60

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
  "notes": "any other notable terms (lead time, warranty, etc.) or null",
  "contact_name": "the named person / rep on the quote (estimator, salesperson, owner) or null",
  "contact_email": "their email or null",
  "contact_phone": "their phone or null"
}
Return ONLY the JSON object, no other text.`

export async function POST(request: Request, { params }: { params: { id: string; compId: string } }) {
  // THE ROUTE HAS TO ASK. `middleware.ts` returns early for every `/api/` path,
  // so nothing else gates this: the GET beside it was guarded and every write in
  // the family answered anybody with a login.
  const gate = await requirePermission(admin(), request, 'quotes', 'create')
  if (denied(gate)) return gate.denied

  const scan = await guardScan(admin(), gate.actor, 'quote', params.id)
  if (scanDenied(scan)) return scan.denied

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
        contact: {
          name: parsed.contact_name ?? null,
          email: parsed.contact_email ?? null,
          phone: parsed.contact_phone ?? null,
        },
        extract_error: extractError,
      },
    })
    .select()
    .single()

  if (error) {
    // Not the raw Postgres sentence - that is not a thing to put on a screen.
    console.error('[quotes/upload] insert failed:', error.message)
    return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 })
  }

  // NAME IT FROM WHAT WE JUST READ.
  //
  // The comparison is created before any file is uploaded, so it is born
  // "Untitled comparison" - and nothing ever replaced that, even though the
  // vendor's name came back out of the PDF moments ago. "Upload quote doesn't
  // do anything" was a collapsed row wearing that placeholder.
  //
  // Only while it is STILL the placeholder: a name somebody typed is theirs,
  // and a second upload must not rename the comparison out from under them.
  // Best-effort for the same reason the storage write is - a quote that is
  // saved and badly named is a far smaller problem than a failed upload.
  try {
    // `trade` comes off the COMPARISON. It is not a column on `quotes`, which
    // is what the first version of this read - silently undefined, so every
    // multi-file upload fell through to a generic name.
    const { data: comp } = await db
      .from('quote_comparisons').select('title, trade').eq('id', params.compId).maybeSingle()
    if (isUntitled((comp as any)?.title)) {
      const { data: all, error: readErr } = await db
        .from('quotes').select('vendor_name').eq('comparison_id', params.compId)
      // A refused query and an empty one are the same `[]` otherwise.
      if (readErr) console.error('[quotes/upload] could not read the set to name it:', readErr.message)
      const name = comparisonTitle((all ?? []) as any, (comp as any)?.trade)
      if (name) await db.from('quote_comparisons').update({ title: name }).eq('id', params.compId)
    }
  } catch (e) {
    console.error('[quotes/upload] could not name the comparison:', e)
  }

  await scan.succeeded()
  return NextResponse.json({ quote: data })
}
