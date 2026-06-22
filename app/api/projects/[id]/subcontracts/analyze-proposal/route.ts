import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request, { params: _params }: { params: { id: string } }) {
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
    return NextResponse.json({ error: 'Upload an image (JPG, PNG) or PDF of the proposal.' }, { status: 400 })
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  const prompt = `This is a subcontractor's proposal / bid / quote for a construction project. Extract the key info and return ONLY a JSON object with these exact keys (use null for anything not found):
{
  "company_name": "the subcontractor / vendor company name",
  "trade": "the trade or type of work (e.g. Plumbing, Electrical, HVAC, Roofing, Flooring) or null",
  "line_items": [ { "description": "the line item description", "qty": numeric quantity or null, "unit": "unit like SF, LF, EA, LS or null", "unit_price": numeric unit price or null, "amount": numeric line total or null } ],
  "payment_schedule": [ { "label": "the milestone text, e.g. 'Deposit due on approval'", "percent": numeric percent (e.g. 40) or null, "amount": numeric dollar amount or null } ],
  "scope": "a one-line summary of the overall scope",
  "contract_amount": numeric grand total / project total as a number with no symbols/commas, or null,
  "contact_email": "contact email if shown or null",
  "phone": "contact phone if shown or null"
}
For "line_items": copy the pricing-summary rows exactly — one object per priced row, preserving qty, unit, unit price and line total when shown. If there's no itemized pricing, split the scope paragraph into distinct items (amounts null is fine).
For "payment_schedule": extract the proposal's payment terms / payment schedule (e.g. deposit %, amount due at start, balance at completion). One object per milestone with its percent and dollar amount. Return [] if no payment terms are stated.
Return ONLY the JSON object, no other text.`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const content: any[] = isPdf
    ? [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: prompt }]
    : [{ type: 'image', source: { type: 'base64', media_type: file.type, data: base64 } }, { type: 'text', text: prompt }]

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    messages: [{ role: 'user', content }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
    return NextResponse.json({ fields: JSON.parse(cleaned) })
  } catch {
    return NextResponse.json({ error: 'Could not read the proposal. Fill in the fields manually.' }, { status: 422 })
  }
}
