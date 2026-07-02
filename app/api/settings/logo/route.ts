import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Upload the company logo (PNG/JPG). Stamped on generated PDFs and reports.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })
  if (!['admin', 'manager'].includes(profile.role ?? '')) return NextResponse.json({ error: 'Only an admin can change the logo.' }, { status: 403 })

  const form = await request.formData()
  const file = form.get('file') as File | null
  if (!file || file.size === 0) return NextResponse.json({ error: 'No file' }, { status: 400 })
  if (!/image\/(png|jpe?g)/.test(file.type)) return NextResponse.json({ error: 'Use a PNG or JPG image.' }, { status: 400 })
  if (file.size > 2 * 1024 * 1024) return NextResponse.json({ error: 'Max 2MB.' }, { status: 400 })

  const ext = file.type.includes('png') ? 'png' : 'jpg'
  const path = `company-logos/${profile.company_id}/logo-${Date.now()}.${ext}`
  const { error: upErr } = await db.storage.from('submittals').upload(path, await file.arrayBuffer(), { contentType: file.type, upsert: true })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data: signed } = await db.storage.from('submittals').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
  if (!signed?.signedUrl) return NextResponse.json({ error: 'Could not create URL' }, { status: 500 })

  const { error } = await db.from('companies').update({ logo_url: signed.signedUrl }).eq('id', profile.company_id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ logo_url: signed.signedUrl })
}

// Remove the logo.
export async function DELETE(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id || !['admin', 'manager'].includes(profile.role ?? '')) return NextResponse.json({ error: 'Admin only' }, { status: 403 })
  await db.from('companies').update({ logo_url: null }).eq('id', profile.company_id)
  return NextResponse.json({ ok: true })
}
