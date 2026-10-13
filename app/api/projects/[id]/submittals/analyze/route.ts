import Anthropic from '@anthropic-ai/sdk'
import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { guardScan, scanDenied, scanActorFor } from '@/lib/scan-guard'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

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

export async function POST(request: Request, { params: _params }: { params: { id: string } }) {
  const db = admin()
  // Was: any signed-in account. Reading a tech sheet is the first half of adding
  // a submittal, so it takes the same gate as adding one.
  const gate = await requirePermission(db, request, 'submittals', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, _params.id, 'id')
  if ('denied' in owned) return owned.denied
  const user = { id: gate.actor.userId }

  const scan = await guardScan(db, await scanActorFor(db, user.id), 'submittal', _params.id)
  if (scanDenied(scan)) return scan.denied

  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

  const imageTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
  const isPdf = file.type === 'application/pdf'
  if (!imageTypes.includes(file.type) && !isPdf) {
    return NextResponse.json({ error: 'Upload an image (JPG, PNG) or PDF of the submittal.' }, { status: 400 })
  }

  const base64 = Buffer.from(await file.arrayBuffer()).toString('base64')

  const prompt = `This is a construction submittal document - a product tech/data sheet, shop drawing, or product cut sheet. Extract its key info and return ONLY a JSON object with these exact keys (use null for anything not found):
{
  "title": "a short descriptive title for this submittal (e.g. 'Roof Membrane - GAF EverGuard TPO')",
  "type": one of ["Tech Sheet","Shop Drawing","Product Data","Sample","Other"] - pick the closest,
  "trade": "the trade this relates to (e.g. Roofing, Plumbing, Electrical) or null",
  "manufacturer": "manufacturer / brand name or null",
  "model_number": "model or product number or null",
  "spec_section": "CSI spec section number if visible (e.g. 07 54 23) or null",
  "notes": "any other relevant specs, dimensions, ratings, or info"
}
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
    await scan.succeeded()
    return NextResponse.json({ fields: JSON.parse(cleaned) })
  } catch {
    return NextResponse.json({ error: 'Could not read the document. Fill in the fields manually.' }, { status: 422 })
  }
}
