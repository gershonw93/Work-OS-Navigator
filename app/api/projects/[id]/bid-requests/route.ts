import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await db
    .from('bid_requests')
    .select('*, bid_request_attachments(*), bid_invites(*), bid_submissions(*)')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const form = await request.formData()
  const title = form.get('title') as string
  if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 })

  const { data: req, error } = await db.from('bid_requests').insert({
    project_id: params.id,
    title,
    trade: (form.get('trade') as string) || null,
    description: (form.get('description') as string) || null,
    due_date: (form.get('due_date') as string) || null,
    created_by: user.id,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Attach already-saved project plans (no re-upload)
  const existingRaw = form.get('existing_attachments') as string | null
  if (existingRaw) {
    try {
      const existing = JSON.parse(existingRaw) as { file_url: string; file_name?: string }[]
      const rows = existing.filter(e => e.file_url).map(e => ({ bid_request_id: req.id, file_url: e.file_url, file_name: e.file_name ?? null }))
      if (rows.length) await db.from('bid_request_attachments').insert(rows)
    } catch { /* ignore malformed */ }
  }

  // Newly-uploaded plans / attachments
  const files = form.getAll('attachments') as File[]
  for (const file of files) {
    if (!file || file.size === 0) continue
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${params.id}/bid-requests/${req.id}/${Date.now()}-${safe}`
    const { error: upErr } = await db.storage.from('submittals').upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })
    if (!upErr) {
      const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
      if (signed?.signedUrl) await db.from('bid_request_attachments').insert({ bid_request_id: req.id, file_url: signed.signedUrl, file_name: file.name })
    }
  }

  return NextResponse.json({ request: req })
}
