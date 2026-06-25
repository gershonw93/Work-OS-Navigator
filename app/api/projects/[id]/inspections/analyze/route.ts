import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request, { params }: { params: { id: string } }) {
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
    return NextResponse.json({ error: 'Only PDF or image files (JPG, PNG, WEBP) are supported.' }, { status: 400 })
  }

  const arrayBuffer = await file.arrayBuffer()
  const base64 = Buffer.from(arrayBuffer).toString('base64')

  const prompt = `This is a construction inspection card or document. Extract all visible information and return it as JSON with these exact keys (use null for any field not found):
{
  "inspection_type": one of ["Foundation","Framing","Rough Electrical","Rough Plumbing","Rough Mechanical","Insulation","Drywall","Final Electrical","Final Plumbing","Final Mechanical","Fire Sprinkler","Building Final","Certificate of Occupancy","Other"] — pick the closest match based on what's visible,
  "trade": "the trade or work type if visible (e.g. Plumbing, Electrical) or null",
  "status": one of ["passed","failed","scheduled","not_scheduled","pending_reinspection"] — if the card shows an approval/pass mark infer "passed", otherwise null,
  "scheduled_date": "YYYY-MM-DD or null — use the date shown on the card",
  "inspector_name": "full name of inspector if visible or null",
  "inspector_phone": "phone number if visible or null",
  "scheduling_phone": "scheduling or office phone number if visible or null",
  "issuing_authority": "the city, township, department name if visible or null",
  "permit_number": "permit or job number if visible or null",
  "notes": "any other relevant info — checked boxes, sub-type of inspection (e.g. Slab, Rough, Water), address, etc."
}
Return ONLY the JSON object, no other text.`

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const fileContent: Anthropic.MessageParam['content'] = isPdf
    ? [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } } as any,
        { type: 'text', text: prompt },
      ]
    : [
        { type: 'image', source: { type: 'base64', media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 } },
        { type: 'text', text: prompt },
      ]

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 1024,
    messages: [{ role: 'user', content: fileContent }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''

  try {
    const cleaned = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim()
    const parsed = JSON.parse(cleaned)
    return NextResponse.json({ fields: parsed })
  } catch {
    return NextResponse.json({ error: 'Could not parse inspection data. Please fill in the fields manually.' }, { status: 422 })
  }
}
