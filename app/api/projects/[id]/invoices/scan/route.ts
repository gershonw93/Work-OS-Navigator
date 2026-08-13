import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { checkInvoiceAgainstQuote, checkSummary } from '@/lib/invoice-check'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']

const PROMPT = `You are reading a subcontractor or supplier invoice for a construction company.

Return ONLY a JSON object, no prose and no code fences:
{
  "vendor_name": "who is billing - the company name at the top, not the GC being billed",
  "invoice_number": "their invoice number, as printed",
  "invoice_date": "YYYY-MM-DD or null",
  "due_date": "YYYY-MM-DD or null",
  "amount": 0,
  "subtotal": 0,
  "tax": 0,
  "retainage": 0,
  "description": "one short line on what the work was",
  "trade": "the trade if you can tell - plumbing, electrical, framing... otherwise null",
  "line_items": [{ "description": "", "amount": 0 }],
  "confidence": "high | medium | low"
}

Rules that matter here:
- "amount" is the TOTAL AMOUNT DUE on this invoice - the number the GC actually
  has to pay. If the invoice shows a subtotal, tax, and a balance due, amount is
  the balance due. If retainage is withheld, amount is the figure AFTER it.
- Never invent a number. Anything you cannot read is null, not a guess.
- The vendor is whoever is ASKING to be paid. Construction invoices print both
  companies; the GC is usually under "Bill To". Do not return the GC.
- Set confidence to "low" if the document is a blurry photo, is cut off, or you
  are unsure which number is the total. The user is going to check your work,
  and saying you are unsure is more useful than being confidently wrong.`

/** Cheap name overlap - "BoroFlow Plumbing LLC" should find "BoroFlow Plumbing & Heating". */
function nameScore(a: string, b: string): number {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2 && !['llc', 'inc', 'the', 'and', 'corp', 'company', 'construction', 'services'].includes(w))
  const A = norm(a), B = new Set(norm(b))
  if (!A.length || !B.size) return 0
  return A.filter(w => B.has(w)).length / A.length
}

/**
 * Read an emailed invoice and fill the form in.
 *
 * The extraction is the easy half. The useful half is matching it to what was
 * already agreed - the subcontract and its payment schedule are sitting right
 * here, so a number that does not match the line it claims to be is worth
 * saying out loud BEFORE the invoice is approved rather than after it is paid.
 *
 * Nothing is saved. This returns a draft the user confirms.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json({ error: 'Invoice scanning is not configured on this environment.' }, { status: 503 })
  }

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const isPdf = file.type === 'application/pdf'
  if (!isPdf && !IMAGE_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Send a PDF or a photo/screenshot of the invoice.' }, { status: 415 })
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: 'That file is over 20MB.' }, { status: 413 })
  }

  // Keep the document regardless of how the read goes - it's the invoice
  // itself, and it should end up attached either way.
  const buf = await file.arrayBuffer()
  const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80)
  const path = `${params.id}/invoices/${Date.now()}-${safe}`
  let document_url: string | null = null
  const { error: upErr } = await db.storage.from('submittals')
    .upload(path, buf, { contentType: file.type, upsert: true })
  if (!upErr) {
    const { data: signed } = await db.storage.from('submittals')
      .createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
    document_url = signed?.signedUrl ?? null
  }

  const base64 = Buffer.from(buf).toString('base64')
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
  const content: any = isPdf
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: PROMPT }]
    : [{ type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } }, { type: 'text', text: PROMPT }]

  let parsed: any = {}
  let readError: string | null = null
  try {
    const message = await anthropic.messages.create({
      // Matches every other extraction route in the app. Worth revisiting as a
      // batch - invoice scanning runs far more often than the others, so a
      // cheaper current model would pay for itself - but not worth this feature
      // being the one that discovers a model id isn't enabled on the key.
      model: 'claude-opus-4-8',
      max_tokens: 4096,
      messages: [{ role: 'user', content }],
    })
    let raw = message.content.map(b => (b.type === 'text' ? b.text : '')).join('').trim()
    raw = raw.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```$/i, '').trim()
    const first = raw.indexOf('{'), last = raw.lastIndexOf('}')
    if (first >= 0 && last > first) raw = raw.slice(first, last + 1)
    parsed = JSON.parse(raw)
  } catch (e: any) {
    readError = 'Could not read this one automatically - the file is attached, so fill in the rest by hand.'
    console.error('[invoices/scan] extract failed:', e?.message ?? e)
  }

  const num = (v: any): number | null => {
    if (typeof v === 'number' && isFinite(v)) return v
    if (typeof v === 'string') {
      const n = Number(v.replace(/[^0-9.\-]/g, ''))
      return v.trim() && isFinite(n) ? n : null
    }
    return null
  }

  // Match to a subcontract on this job, then to a line on its payment schedule.
  const vendor = String(parsed.vendor_name ?? '').trim()
  const { data: subs } = await db
    .from('subcontracts')
    .select('id, trade, contract_amount, company_id, line_items, companies(name)')
    .eq('project_id', params.id)

  let match: any = null
  let matchScore = 0
  for (const s of subs ?? []) {
    const name = (s as any).companies?.name ?? ''
    let score = vendor && name ? nameScore(vendor, name) : 0
    // A trade match is weaker evidence than the name, but it breaks ties.
    if (parsed.trade && s.trade && String(s.trade).toLowerCase().includes(String(parsed.trade).toLowerCase())) {
      score += 0.25
    }
    if (score > matchScore) { matchScore = score; match = s }
  }
  const subcontract = matchScore >= 0.5 ? match : null

  // Check what they are billing against what they quoted. The contract total is
  // the check everyone already does; the expensive surprises are a rate nobody
  // agreed to, or a line that was never on the quote and has no change order
  // behind it - both of which look ordinary on an invoice under the contract.
  let quoteCheck: any = null
  if (subcontract) {
    const { data: prior } = await db.from('invoices')
      .select('amount, status').eq('project_id', params.id).eq('subcontract_id', subcontract.id)
    const alreadyBilled = (prior ?? [])
      .filter(i => i.status !== 'rejected')
      .reduce((s, i) => s + (Number(i.amount) || 0), 0)

    quoteCheck = checkInvoiceAgainstQuote({
      invoiceLines: Array.isArray(parsed.line_items) ? parsed.line_items : [],
      quoteLines: Array.isArray((subcontract as any).line_items) ? (subcontract as any).line_items : [],
      invoiceAmount: num(parsed.amount),
      contractAmount: Number((subcontract as any).contract_amount ?? 0) || null,
      alreadyBilled,
    })
  }

  let scheduleItem: any = null
  let scheduleNote: string | null = null
  const amount = num(parsed.amount)
  if (subcontract && amount != null) {
    const { data: items } = await db
      .from('payment_schedule_items')
      .select('id, label, amount, percentage, status')
      .eq('subcontract_id', subcontract.id)

    const open = (items ?? []).filter(i => i.status !== 'paid')
    // Closest unpaid line by value. Exact-to-the-dollar is the common case;
    // anything else is worth flagging rather than silently selecting.
    let best: any = null, bestDiff = Infinity
    for (const i of open) {
      const target = i.amount != null ? Number(i.amount)
        : i.percentage != null ? Number(subcontract.contract_amount ?? 0) * Number(i.percentage) / 100
          : null
      if (target == null) continue
      const diff = Math.abs(target - amount)
      if (diff < bestDiff) { bestDiff = diff; best = { ...i, target } }
    }
    if (best) {
      if (bestDiff < 0.01) scheduleItem = best
      else if (bestDiff / Math.max(best.target, 1) < 0.25) {
        scheduleItem = best
        const over = amount - best.target
        scheduleNote = `${over > 0 ? 'This is $' + Math.abs(over).toLocaleString() + ' more than' : 'This is $' + Math.abs(over).toLocaleString() + ' less than'} "${best.label}" on their contract.`
      }
    }
  }

  return NextResponse.json({
    read_error: readError,
    document_url,
    document_name: file.name,
    draft: {
      vendor_name: vendor || null,
      invoice_number: parsed.invoice_number ?? null,
      invoice_date: parsed.invoice_date ?? null,
      due_date: parsed.due_date ?? null,
      amount,
      description: parsed.description ?? null,
      trade: parsed.trade ?? null,
      line_items: Array.isArray(parsed.line_items) ? parsed.line_items : [],
      confidence: parsed.confidence ?? null,
    },
    match: subcontract ? {
      subcontract_id: subcontract.id,
      company_id: subcontract.company_id,
      company_name: (subcontract as any).companies?.name ?? null,
      trade: subcontract.trade,
      // Below 0.8 the name only partly overlapped - worth showing, not worth trusting.
      certain: matchScore >= 0.8,
    } : null,
    quote_check: quoteCheck ? { ...quoteCheck, summary: checkSummary(quoteCheck) } : null,
    schedule_item: scheduleItem ? {
      id: scheduleItem.id,
      label: scheduleItem.label,
      expected: scheduleItem.target,
      note: scheduleNote,
    } : null,
  })
}
