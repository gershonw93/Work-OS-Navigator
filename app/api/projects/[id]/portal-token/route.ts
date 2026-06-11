import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Generate a cryptographically random token
  const array = new Uint8Array(32)
  crypto.getRandomValues(array)
  const portalToken = Array.from(array, b => b.toString(16).padStart(2, '0')).join('')

  const { error } = await db
    .from('projects')
    .update({ client_portal_token: portalToken })
    .eq('id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${request.headers.get('host')}`
  const portalUrl = `${baseUrl}/portal/${portalToken}`

  return NextResponse.json({ token: portalToken, url: portalUrl }, { status: 201 })
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: project, error } = await db
    .from('projects')
    .select('client_portal_token')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!project?.client_portal_token) return NextResponse.json({ url: null })

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? `https://${request.headers.get('host')}`
  const portalUrl = `${baseUrl}/portal/${project.client_portal_token}`

  return NextResponse.json({ token: project.client_portal_token, url: portalUrl })
}
