import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const PROMPT = `This is a contractor/vendor price quote. Extract its details and return ONLY a JSON object (use null when not found):
{"vendor_name":"company that issued the quote","total_amount":number or null,"valid_until":"YYYY-MM-DD or null","scope_summary":"1-2 sentence summary","line_items":[{"description":"string","amount":number|null}],"inclusions":["..."],"exclusions":["..."],"payment_terms":"string or null","notes":"string or null","contact_name":"rep name or null","contact_email":"or null","contact_phone":"or null"}
Return ONLY the JSON.`

async function extract(anthropic: Anthropic, url: string) {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = res.headers.get('content-type') || ''
    const isPdf = ct.includes('pdf') || url.toLowerCase().includes('.pdf')
    const media = isPdf ? 'application/pdf' : (ct.includes('png') ? 'image/png' : 'image/jpeg')
    const content: any = isPdf
      ? [{ type: 'document', source: { type: 'base64', media_type: media, data: buf.toString('base64') } }, { type: 'text', text: PROMPT }]
      : [{ type: 'image', source: { type: 'base64', media_type: media, data: buf.toString('base64') } }, { type: 'text', text: PROMPT }]
    const msg = await anthropic.messages.create({ model: 'claude-opus-4-8', max_tokens: 8192, messages: [{ role: 'user', content }] })
    const raw = msg.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
    let j = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
    const a = j.indexOf('{'), b = j.lastIndexOf('}')
    if (a >= 0 && b > a) j = j.slice(a, b + 1)
    return JSON.parse(j)
  } catch { return null }
}

// Pull a bid request's submissions into a Compare-Quotes comparison, AI-reading each file.
export async function POST(request: Request, { params }: { params: { id: string; reqId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: req } = await db.from('bid_requests')
    .select('*, bid_submissions(*, bid_invites(vendor_name))')
    .eq('id', params.reqId).eq('project_id', params.id).single()
  if (!req) return NextResponse.json({ error: 'Bid request not found' }, { status: 404 })

  const subs = req.bid_submissions ?? []
  if (!subs.length) return NextResponse.json({ error: 'No submissions to compare yet.' }, { status: 400 })

  // Reuse the comparison already linked to this request (re-pulling refreshes it) instead of duplicating.
  const { data: existing } = await db.from('quote_comparisons')
    .select('id').eq('bid_request_id', params.reqId).eq('project_id', params.id).maybeSingle()

  let comp: { id: string }
  if (existing) {
    comp = existing
    await db.from('quotes').delete().eq('comparison_id', existing.id)
  } else {
    const { data: created, error: cErr } = await db.from('quote_comparisons').insert({
      project_id: params.id, title: req.title, trade: req.trade, requirements: req.description,
      bid_request_id: params.reqId, created_by: user.id,
    }).select('id').single()
    if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
    comp = created
  }

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const rows = await Promise.all(subs.map(async (s: any) => {
    const parsed = s.file_url ? await extract(anthropic, s.file_url) : null
    const fallbackName = s.submitted_by_name || s.bid_invites?.vendor_name || null
    return {
      comparison_id: comp.id,
      file_url: s.file_url,
      file_name: s.file_name,
      vendor_name: parsed?.vendor_name ?? fallbackName,
      total_amount: typeof parsed?.total_amount === 'number' ? parsed.total_amount : (s.amount != null ? Number(s.amount) : null),
      valid_until: parsed?.valid_until ?? null,
      scope_summary: parsed?.scope_summary ?? s.notes ?? null,
      data: {
        line_items: parsed?.line_items ?? [],
        inclusions: parsed?.inclusions ?? [],
        exclusions: parsed?.exclusions ?? [],
        payment_terms: parsed?.payment_terms ?? null,
        notes: parsed?.notes ?? s.notes ?? null,
        contact: { name: parsed?.contact_name ?? null, email: parsed?.contact_email ?? null, phone: parsed?.contact_phone ?? null },
      },
    }
  }))
  await db.from('quotes').insert(rows)

  return NextResponse.json({ comparison_id: comp.id, quotes: rows.length })
}
