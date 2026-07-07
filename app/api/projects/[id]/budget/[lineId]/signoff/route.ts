import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Sign off a finished progress line (signature + name stamped on the line item).
export async function POST(request: Request, { params }: { params: { id: string; lineId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  const { data: line } = await db.from('budget_line_items').select('id, description').eq('id', params.lineId).eq('project_id', params.id).single()
  if (!line) return NextResponse.json({ error: 'Line not found' }, { status: 404 })

  const form = await request.formData()
  const file = form.get('signature') as File | null
  const name = ((form.get('name') as string) || (profile as any)?.full_name || 'Signed').trim()
  if (!file || file.size === 0) return NextResponse.json({ error: 'Signature required' }, { status: 400 })

  const path = `signoffs/${params.id}/line-${params.lineId}-${Date.now()}.png`
  const { error: upErr } = await db.storage.from('submittals').upload(path, await file.arrayBuffer(), { contentType: file.type || 'image/png', upsert: true })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
  const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)

  const { data: updated, error } = await db.from('budget_line_items')
    .update({ signoff_signed_at: new Date().toISOString(), signoff_signed_by: name, signoff_signature_url: signed?.signedUrl ?? null })
    .eq('id', params.lineId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, params.id, name, 'task_updated', `Signed off work: "${line.description}"`, { budget_line_item_id: line.id })
  return NextResponse.json({ line: updated })
}
