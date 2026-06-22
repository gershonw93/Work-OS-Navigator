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
  "trade": "the trade or type of work (e.g. Plumbing, Electrical, HVAC, Roofing) or null",
  "line_items": [ { "description": "one scope item / task / material line", "amount": numeric price for that line or null } ],
  "scope": "a one-line summary of the overall scope (in case there are no clear line items)",
  "contract_amount": numeric grand total price as a number with no symbols/commas, or null,
  "contact_email": "contact email if shown or null",
  "phone": "contact phone if shown or null"
}
For "line_items": break the scope of work into individual line items — one per task, material, or priced row shown on the proposal. If the proposal is just a paragraph with no itemized pricing, still split it into the distinct scope items you can identify (amount null is fine). Return [] only if there is truly no scope described.
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
