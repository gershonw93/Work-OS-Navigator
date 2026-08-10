import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getActor, actorCan } from '@/lib/server-permissions'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Where the recipient's link lives. The product may be on its own hostname, and
// this URL goes into an email, so it has to be absolute and correct.
function shareBase(request: Request) {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL
  if (configured) return configured.replace(/\/$/, '')
  const host = request.headers.get('host')
  return host ? `https://${host}` : ''
}

export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ shares: [] })

  // ?project_id= scopes to one job, for the Sharing tab inside a project.
  const projectId = new URL(request.url).searchParams.get('project_id')

  let query = db
    .from('file_shares')
    .select('*, file_share_uploads(id, name, file_url, file_type, created_at)')
    .eq('company_id', profile.company_id)
  if (projectId) query = query.eq('project_id', projectId)

  const { data, error } = await query.order('created_at', { ascending: false }).limit(200)

  if (error) return NextResponse.json({ shares: [] })

  const base = shareBase(request)
  return NextResponse.json({
    shares: (data ?? []).map((s: any) => ({ ...s, url: `${base}/share/${s.token}` })),
  })
}

// POST - share a set of documents with one person.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Sharing documents outward is a files action, so it needs files rights.
  const actor = await getActor(db, token)
  if (!actorCan(actor, 'files', 'view')) {
    return NextResponse.json({ error: 'You do not have permission to share files.' }, { status: 403 })
  }

  const { data: profile } = await db
    .from('profiles').select('company_id, full_name').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const body = await request.json()
  const files = Array.isArray(body.files) ? body.files.filter((f: any) => f?.url && f?.name) : []
  if (files.length === 0) return NextResponse.json({ error: 'Pick at least one document to send' }, { status: 400 })

  const name = String(body.name ?? '').trim() || 'Shared documents'
  const expiresDays = Number(body.expires_days)

  const { data, error } = await db.from('file_shares').insert({
    company_id: profile.company_id,
    project_id: body.project_id || null,
    token: randomBytes(24).toString('base64url'),
    name,
    message: body.message || null,
    files,
    recipient_name: body.recipient_name || null,
    recipient_email: body.recipient_email || null,
    allow_upload: body.allow_upload !== false,
    upload_prompt: body.upload_prompt || null,
    expires_at: Number.isFinite(expiresDays) && expiresDays > 0
      ? new Date(Date.now() + expiresDays * 86400000).toISOString()
      : null,
    created_by: user.id,
    created_by_name: profile.full_name ?? null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ share: { ...data, url: `${shareBase(request)}/share/${data.token}` } })
}
