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

const PROMPT = `This is a contractor's price quote/estimate. Extract it faithfully. Return ONLY JSON (use null when not found):
{"total_amount":number or null,
 "payment_terms":"the raw payment-terms paragraph, or null",
 "payment_stages":[{"label":"e.g. Deposit/mobilization","percent":number|null,"amount":number|null,"trigger":"when it's due, or null"}],
 "line_items":[{"section":"the section/group heading this line sits under (e.g. Rough-in, Trim, Cleanup), or null","description":"string","quantity":number|null,"unit_price":number|null,"amount":number|null}]}
For each line: quantity = qty/units if shown, unit_price = price per unit, amount = line total. Preserve the section a line appears under. Break the payment terms into ordered stages. Return ONLY the JSON.`

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

// Parse a free-text payment-terms paragraph into ordered stages, so quotes
// scanned before structured stages existed still render as a schedule.
function parseTerms(text: string | null): any[] | null {
  if (!text || !text.trim()) return null
  const head = text.split(/invoices?\s+due|net\s+\d|change orders?/i)[0] || text
  const segs = head.split(/;|\.\s+(?=[0-9])|\n/).map(s => s.trim()).filter(Boolean)
  const stages: any[] = []
  for (const seg of segs) {
    const pct = seg.match(/(\d+(?:\.\d+)?)\s*%/)
    const amt = seg.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/)
    if (!pct && !amt) continue
    let label = seg.replace(/\$\s*[\d,]+(?:\.\d{1,2})?/g, '').replace(/^\s*\d+(?:\.\d+)?\s*%\s*/, '').replace(/[()]/g, '').trim()
    label = label.replace(/^(of\s+|due\s+)/i, '').trim() || 'Payment'
    stages.push({
      label: label.charAt(0).toUpperCase() + label.slice(1),
      percent: pct ? Number(pct[1]) : null,
      amount: amt ? Number(amt[1].replace(/,/g, '')) : null,
      trigger: null,
    })
  }
  return stages.length ? stages : null
}

// GET — quote file + status + line items for this project.
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await authUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: profile } = await db.from('profiles').select('companies(default_payment_terms)').eq('id', user.id).single()
  const defaultTerms = (profile?.companies as any)?.default_payment_terms ?? null
  const [{ data: project }, { data: lines }] = await Promise.all([
    db.from('projects').select('status, quote_file_url, quote_file_name, quote_total, payment_terms, payment_stages').eq('id', params.id).single(),
    db.from('budget_line_items').select('id, description, budgeted_amount, progress_pct, progress_status, progress_note, sort_order, quantity, unit_price, section').eq('project_id', params.id).order('sort_order', { ascending: true }),
  ])
  // Attach any task linked to each line (two-way link).
  const lineIds = (lines ?? []).map((l: any) => l.id)
  if (lineIds.length) {
    const { data: tasks } = await db.from('project_tasks').select('id, title, status, budget_line_item_id').in('budget_line_item_id', lineIds)
    const byLine = new Map((tasks ?? []).map((t: any) => [t.budget_line_item_id, t]))
    for (const l of lines ?? []) (l as any).task = byLine.get((l as any).id) ?? null
  }
  // Backfill structured stages from the raw terms text for quotes scanned before stages existed.
  if (project && !(project as any).payment_stages && (project as any).payment_terms) {
    ;(project as any).payment_stages = parseTerms((project as any).payment_terms)
  }
  return NextResponse.json({ project: project ?? null, line_items: lines ?? [], default_payment_terms: defaultTerms })
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
  const items: any[] = Array.isArray(parsed?.line_items) ? parsed.line_items : []
  const lineAmount = (it: any) => typeof it.amount === 'number' ? it.amount
    : (Number(it.quantity) || 0) * (Number(it.unit_price) || 0)
  const total = typeof parsed?.total_amount === 'number'
    ? parsed.total_amount
    : items.reduce((s, i) => s + (lineAmount(i) || 0), 0)

  // Payment terms: from the quote if found, else fall back to the company default.
  const { data: profile } = await db.from('profiles').select('companies(default_payment_terms)').eq('id', user.id).single()
  const defaultTerms = (profile?.companies as any)?.default_payment_terms ?? null
  const paymentTerms = (typeof parsed?.payment_terms === 'string' && parsed.payment_terms.trim()) ? parsed.payment_terms.trim() : defaultTerms
  const stages = Array.isArray(parsed?.payment_stages) && parsed.payment_stages.length ? parsed.payment_stages : null

  await db.from('projects').update({
    quote_file_url: fileUrl, quote_file_name: file.name, quote_total: total || null,
    payment_terms: paymentTerms, payment_stages: stages,
  }).eq('id', params.id)

  // Replace existing quote-derived line items with the freshly scanned ones.
  if (items.length) {
    await db.from('budget_line_items').delete().eq('project_id', params.id)
    const rows = items.map((it, idx) => ({
      project_id: params.id,
      category: 'Quote',
      section: (typeof it.section === 'string' && it.section.trim()) ? it.section.trim() : null,
      description: it.description || `Line ${idx + 1}`,
      quantity: it.quantity != null ? Number(it.quantity) : null,
      unit_price: it.unit_price != null ? Number(it.unit_price) : null,
      budgeted_amount: Number(lineAmount(it)) || 0,
      committed_amount: 0, actual_amount: 0, progress_pct: 0, sort_order: idx,
    }))
    await db.from('budget_line_items').insert(rows)
  }

  return NextResponse.json({ file_url: fileUrl, file_name: file.name, total, payment_terms: paymentTerms, payment_stages: stages, line_items: items, scanned: !!parsed })
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
  if (body.payment_terms !== undefined) {
    await db.from('projects').update({ payment_terms: body.payment_terms || null }).eq('id', params.id)
    return NextResponse.json({ ok: true })
  }
  // Create a task from a progress line, linked both ways.
  if (body.action === 'create_task' && body.line_item_id) {
    const { data: line } = await db.from('budget_line_items').select('description').eq('id', body.line_item_id).eq('project_id', params.id).single()
    const { data: task, error } = await db.from('project_tasks').insert({
      project_id: params.id,
      title: line?.description || 'Task',
      status: 'open',
      budget_line_item_id: body.line_item_id,
    }).select('id, title, status, budget_line_item_id').single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, task })
  }

  // Update a line's status / progress / note.
  if (body.line_item_id) {
    const updates: Record<string, unknown> = {}
    if (body.progress_status !== undefined) {
      updates.progress_status = body.progress_status
      // keep the % in sync so Budget bars + overall % reflect the status
      updates.progress_pct = body.progress_status === 'done' ? 100 : body.progress_status === 'working' ? 50 : 0
    }
    if (body.progress_pct !== undefined) updates.progress_pct = Math.max(0, Math.min(Number(body.progress_pct) || 0, 100))
    if (body.progress_note !== undefined) updates.progress_note = body.progress_note || null
    if (Object.keys(updates).length) {
      await db.from('budget_line_items').update(updates).eq('id', body.line_item_id).eq('project_id', params.id)
    }
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Nothing to do' }, { status: 400 })
}
