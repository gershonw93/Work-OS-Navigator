import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request, { params }: { params: { id: string; compId: string } }) {
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
  return NextResponse.json({ analysis })
}
