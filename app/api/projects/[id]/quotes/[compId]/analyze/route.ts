import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
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

export async function POST(request: Request, { params }: { params: { id: string; compId: string } }) {
  // THE ROUTE HAS TO ASK. `middleware.ts` returns early for every `/api/` path,
  // so nothing else gates this: the GET beside it was guarded and every write in
  // the family answered anybody with a login.
  const gate = await requirePermission(admin(), request, 'quotes', 'edit')
  if (denied(gate)) return gate.denied

  const scan = await guardScan(admin(), gate.actor, 'quote-comparison', params.id)
  if (scanDenied(scan)) return scan.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: comp } = await db.from('quote_comparisons').select('*, quotes(*)').eq('id', params.compId).eq('project_id', params.id).single()
  if (!comp) return NextResponse.json({ error: 'Comparison not found' }, { status: 404 })
  const quotes = comp.quotes ?? []
  if (quotes.length < 1) return NextResponse.json({ error: 'Add at least one quote first.' }, { status: 400 })

  const quotesSummary = quotes.map((q: any) => ({
    quote_id: q.id,
    vendor: q.vendor_name,
    total: q.total_amount,
    scope: q.scope_summary,
    line_items: (q.data?.line_items ?? []).map((li: any) => li.description),
    inclusions: q.data?.inclusions ?? [],
    exclusions: q.data?.exclusions ?? [],
    notes: q.data?.notes ?? null,
  }))

  const prompt = `You are helping a general contractor compare price quotes for: "${comp.title}"${comp.trade ? ` (${comp.trade})` : ''}.

What the GC needs (requirements):
${comp.requirements?.trim() || '(no explicit requirements given - infer reasonable scope expectations for this trade)'}

Here are the quotes (JSON):
${JSON.stringify(quotesSummary, null, 2)}

Analyze and return ONLY a JSON object:
{
  "per_quote": [
    { "quote_id": "id", "missing": ["requirement or scope item this quote does NOT cover"], "strengths": ["where this quote is strong / clearly includes"], "concerns": ["red flags, vague items, or notable exclusions"] }
  ],
  "recommendation": "2-4 sentences: which quote is the best value considering price AND completeness, and why",
  "recommended_quote_id": "the id of the recommended quote (or null)"
}
Compare each quote against the requirements and against the other quotes. Be specific and practical. Return ONLY the JSON.`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  let analysis: any
  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    })
    const raw = message.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
    let jsonStr = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
    const first = jsonStr.indexOf('{'); const last = jsonStr.lastIndexOf('}')
    if (first >= 0 && last > first) jsonStr = jsonStr.slice(first, last + 1)
    analysis = JSON.parse(jsonStr)
  } catch {
    return NextResponse.json({ error: 'Could not analyze the quotes. Try again.' }, { status: 422 })
  }

  await db.from('quote_comparisons').update({ analysis }).eq('id', params.compId)
  await scan.succeeded()
  return NextResponse.json({ analysis })
}
