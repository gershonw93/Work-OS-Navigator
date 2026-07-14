import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST - create (or reuse) the one-time answer link for this RFI, so the GC
// can send it to the architect/designer. Reusing keeps one live link per RFI.
export async function POST(request: Request, { params }: { params: { id: string; rfiId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { data: rfi, error } = await db.from('rfis')
    .select('id, answer_token').eq('id', params.rfiId).eq('project_id', params.id).single()
  if (error || !rfi) return NextResponse.json({ error: 'RFI not found' }, { status: 404 })

  let answerToken = (rfi as any).answer_token as string | null
  if (!answerToken) {
    answerToken = (globalThis.crypto as Crypto).randomUUID().replace(/-/g, '')
  }

  const { error: upErr } = await db.from('rfis').update({
    answer_token: answerToken,
    answer_requested_name: body.name || null,
    answer_requested_email: body.email || null,
    answer_link_created_at: new Date().toISOString(),
  }).eq('id', params.rfiId)
  if (upErr) {
    if ((upErr as any).code === '42703') {
      return NextResponse.json({ error: 'Run the latest migration to enable RFI answer links.' }, { status: 400 })
    }
    return NextResponse.json({ error: upErr.message }, { status: 500 })
  }

  return NextResponse.json({ token: answerToken })
}
