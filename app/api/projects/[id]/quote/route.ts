import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function authUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

const PROMPT = `This is a contractor's price quote/estimate. Extract its line items and total. Return ONLY JSON (use null when not found):
{"total_amount":number or null,"line_items":[{"description":"string","amount":number|null}]}
Combine obvious sub-totals into their line. Return ONLY the JSON.`

async function scan(anthropic: Anthropic, url: string) {
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

// GET — quote file + status + line items for this project.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await authUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const [{ data: project }, { data: lines }] = await Promise.all([
    db.from('projects').select('status, quote_file_url, quote_file_name, quote_total').eq('id', params.id).single(),
    db.from('budget_line_items').select('id, description, budgeted_amount, progress_pct, sort_order').eq('project_id', params.id).order('sort_order', { ascending: true }),
  ])
  return NextResponse.json({ project: project ?? null, line_items: lines ?? [] })
}

// POST — upload a quote file, AI-scan it into line items.
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const user = await authUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `${params.id}/quote/${Date.now()}-${safe}`
  const { error: upErr } = await db.storage.from('submittals').upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
  const fileUrl = signed?.signedUrl ?? null

  // AI scan → line items
  let parsed: any = null
  if (fileUrl && process.env.ANTHROPIC_API_KEY) {
    parsed = await scan(new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }), fileUrl)
  }
  const items: { description: string; amount: number | null }[] = Array.isArray(parsed?.line_items) ? parsed.line_items : []
  const total = typeof parsed?.total_amount === 'number'
    ? parsed.total_amount
    : items.reduce((s, i) => s + (Number(i.amount) || 0), 0)

  await db.from('projects').update({ quote_file_url: fileUrl, quote_file_name: file.name, quote_total: total || null }).eq('id', params.id)

  // Replace existing quote-derived line items with the freshly scanned ones.
  if (items.length) {
    await db.from('budget_line_items').delete().eq('project_id', params.id)
    const rows = items.map((it, idx) => ({
      project_id: params.id,
      category: 'Quote',
      description: it.description || `Line ${idx + 1}`,
      budgeted_amount: Number(it.amount) || 0,
      committed_amount: 0, actual_amount: 0, progress_pct: 0, sort_order: idx,
    }))
    await db.from('budget_line_items').insert(rows)
  }

  return NextResponse.json({ file_url: fileUrl, file_name: file.name, total, line_items: items, scanned: !!parsed })
}

// PATCH — convert Quote/Pending → Active (or update a line item's progress %).
export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const user = await authUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const body = await request.json()

  if (body.action === 'convert') {
    const { error } = await db.from('projects').update({ status: 'active' }).eq('id', params.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, status: 'active' })
  }
  if (body.line_item_id && body.progress_pct !== undefined) {
    const pct = Math.max(0, Math.min(Number(body.progress_pct) || 0, 100))
    await db.from('budget_line_items').update({ progress_pct: pct }).eq('id', body.line_item_id).eq('project_id', params.id)
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Nothing to do' }, { status: 400 })
}
