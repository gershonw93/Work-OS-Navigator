import Anthropic from '@anthropic-ai/sdk'
import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import {
  CACHE_DAYS, HELP_ANSWER_MODEL, PER_VISITOR_PER_HOUR, SITE_PER_DAY, SYSTEM_PROMPT,
  catalog, cleanAnswer, contextArticles, questionKey, questionProblem, userMessage,
} from '@/lib/help/answer'

// AI short answers for the public Help Center. PUBLIC: no sign-in, no company.
//
// Not metered by `guardScan` - there is no company to count against - so this
// route carries its own budget instead, and `billing-trial.ts` names it as the
// one exemption and checks the budget is still here. See lib/help/answer.ts.
//
// EVERY READ THAT GUARDS THE SPEND FAILS CLOSED. Elsewhere a meter that cannot
// write must never refuse a customer's scan; here a limit we cannot read is a
// public endpoint with no limit at all, and the fallback is right underneath
// the box - the articles themselves.

export const runtime = 'nodejs'
// The model route rule (scan-timeout.ts). An answer is a few seconds; the
// ceiling is the same as every other model call so one rule covers them all.
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'dev-secret'

/** An HMAC of the address: enough to count one visitor, useless for anything else. */
function visitorId(request: Request): string {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  return crypto.createHmac('sha256', SECRET).update(`help:${ip}`).digest('hex').slice(0, 32)
}

const UNAVAILABLE = 'The answer box is not available right now - search the articles below, or email us.'

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { question?: unknown } | null
  const problem = questionProblem(body?.question)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const question = (body!.question as string).trim()
  const key = questionKey(question)
  const visitor = visitorId(request)
  const db = admin()

  // ── 1. Asked before? Then it costs nothing. ─────────────────────────────────
  const since = new Date(Date.now() - CACHE_DAYS * 86_400_000).toISOString()
  const { data: cached } = await db.from('help_answers')
    .select('answer, answered, sources')
    .eq('question_key', key).eq('from_cache', false)
    .not('answer', 'is', null).gte('created_at', since)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (cached) {
    const hit = cleanAnswer(cached)
    if (hit) {
      // Still recorded - "what do people ask" counts repeats.
      await db.from('help_answers').insert({
        question, question_key: key, visitor, answer: hit.answer, answered: hit.answered,
        sources: hit.sources.map(s => s.slug), from_cache: true,
      })
      return NextResponse.json(hit)
    }
  }

  // ── 2. The budget: this visitor this hour, the whole site today. ───────────
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString()
  const today = new Date(); today.setUTCHours(0, 0, 0, 0)
  const [mine, site] = await Promise.all([
    db.from('help_answers').select('id', { count: 'exact', head: true })
      .eq('visitor', visitor).eq('from_cache', false).gte('created_at', hourAgo),
    db.from('help_answers').select('id', { count: 'exact', head: true })
      .eq('from_cache', false).gte('created_at', today.toISOString()),
  ])
  if (mine.error || site.error || mine.count == null || site.count == null) {
    console.error('[help-answer] could not read the limits', mine.error?.message, site.error?.message)
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
  }
  if (mine.count >= PER_VISITOR_PER_HOUR) {
    return NextResponse.json({
      error: 'That is a lot of questions in one hour - try again a little later, or search the articles below.',
    }, { status: 429 })
  }
  if (site.count >= SITE_PER_DAY) {
    console.error('[help-answer] daily cap reached', site.count)
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
  }

  // ── 3. The row goes in BEFORE the call, so a timeout still counts. ─────────
  const { data: row, error: insertError } = await db.from('help_answers')
    .insert({ question, question_key: key, visitor, model: HELP_ANSWER_MODEL })
    .select('id').single()
  if (insertError || !row) {
    console.error('[help-answer] could not record the question', insertError?.message)
    return NextResponse.json({ error: UNAVAILABLE }, { status: 503 })
  }

  // ── 4. Ask, grounded in the public articles only. ──────────────────────────
  const articles = contextArticles(question)
  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 25_000, maxRetries: 1 })
    const message = await anthropic.messages.create({
      model: HELP_ANSWER_MODEL,
      max_tokens: 1024,
      // The instructions and the catalog are identical on every call, so they
      // are the cached prefix; only the matched articles and the question vary.
      system: [{
        type: 'text',
        text: `${SYSTEM_PROMPT}${catalog()}\n\nReply with ONLY a JSON object: {"answered": boolean, "answer": string, "sources": string[]}`,
        cache_control: { type: 'ephemeral' },
      }],
      messages: [{ role: 'user', content: userMessage(question, articles) }],
    })
    const text = message.content.map(b => (b.type === 'text' ? b.text : '')).join('')
    const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)
    const answer = cleanAnswer(JSON.parse(json))
    if (!answer) throw new Error(`unusable answer: ${text.slice(0, 200)}`)

    await db.from('help_answers').update({
      answer: answer.answer, answered: answer.answered, sources: answer.sources.map(s => s.slug),
    }).eq('id', row.id)
    return NextResponse.json(answer)
  } catch (e) {
    console.error('[help-answer] model call failed', e instanceof Error ? e.message : e)
    return NextResponse.json({ error: UNAVAILABLE }, { status: 502 })
  }
}
