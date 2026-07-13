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

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  const fileContent: Anthropic.MessageParam['content'] = isPdf
    ? [
        {
          type: 'document',
          source: { type: 'base64', media_type: 'application/pdf', data: base64 },
        } as any,
        {
          type: 'text',
          text: `This is a construction permit document. Extract all visible information and return it as JSON with these exact keys (use null for any field not found):
{
  "permit_type": one of ["Building","Electrical","Plumbing","Mechanical/HVAC","Fire Protection","Fire Alarm","Sprinkler","Demolition","Excavation","Grading","Roofing","Siding","Windows/Doors","Sewage/Septic","Stormwater","Utilities","Fence/Wall","Pool/Spa","Solar","Sign","Zoning/Land Use","Notice of Commencement","Survey","Plans Review","Other"] - pick the closest match (use "Notice of Commencement" for NOC documents; "Survey" for boundary/topographic/form-board/site surveys; "Plans Review" for architect or engineer letters responding to building department comments or plan review deficiencies),
  "permit_number": "string or null",
  "description": "specific description that distinguishes this document - for surveys include the survey type (e.g. 'Boundary/Topographic Survey', 'Form Board Survey', 'As-Built Survey'); for permits describe the scope; for NOCs describe the improvement; never leave generic",
  "status": one of ["pending","approved","active","recorded","expired","rejected"] - infer from document if possible (use "recorded" for filed NOCs),
  "issued_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "issuing_authority": "name of the issuing city/department/authority",
  "inspector_name": "string or null",
  "inspector_phone": "string or null",
  "notes": "any other relevant info visible on the permit"
}
Return ONLY the JSON object, no other text.`,
        },
      ]
    : [
        {
          type: 'image',
          source: { type: 'base64', media_type: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', data: base64 },
        },
        {
          type: 'text',
          text: `This is a construction permit document. Extract all visible information and return it as JSON with these exact keys (use null for any field not found):
{
  "permit_type": one of ["Building","Electrical","Plumbing","Mechanical/HVAC","Fire Protection","Fire Alarm","Sprinkler","Demolition","Excavation","Grading","Roofing","Siding","Windows/Doors","Sewage/Septic","Stormwater","Utilities","Fence/Wall","Pool/Spa","Solar","Sign","Zoning/Land Use","Notice of Commencement","Survey","Plans Review","Other"] - pick the closest match (use "Notice of Commencement" for NOC documents; "Survey" for boundary/topographic/form-board/site surveys; "Plans Review" for architect or engineer letters responding to building department comments or plan review deficiencies),
  "permit_number": "string or null",
  "description": "specific description that distinguishes this document - for surveys include the survey type (e.g. 'Boundary/Topographic Survey', 'Form Board Survey', 'As-Built Survey'); for permits describe the scope; for NOCs describe the improvement; never leave generic",
  "status": one of ["pending","approved","active","recorded","expired","rejected"] - infer from document if possible (use "recorded" for filed NOCs),
  "issued_date": "YYYY-MM-DD or null",
  "expiry_date": "YYYY-MM-DD or null",
  "issuing_authority": "name of the issuing city/department/authority",
  "inspector_name": "string or null",
  "inspector_phone": "string or null",
  "notes": "any other relevant info visible on the permit"
}
Return ONLY the JSON object, no other text.`,
        },
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
    return NextResponse.json({ error: 'Could not parse permit data. Please fill in the fields manually.' }, { status: 422 })
  }
}
