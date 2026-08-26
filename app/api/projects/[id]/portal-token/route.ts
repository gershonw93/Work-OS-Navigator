import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-url'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

/**
 * MINT A NEW TOKEN. Destructive: it replaces whatever is there, so every link
 * already handed to a client stops working.
 *
 * The share dialog used to call this on every open, so merely looking at the
 * link invalidated the one the client was using. It now GETs first and only
 * comes here when there is no token, or when somebody deliberately asks to
 * regenerate.
 */
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

  const portalUrl = `${appOrigin(request.headers.get('origin'))}/portal/${portalToken}`

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
    .select('client_portal_token, customer_id, client')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // The client's address, so the Send box arrives pre-filled instead of asking
  // for something the app already knows. Best-effort - not knowing it just
  // means an empty field.
  let clientEmail: string | null = null
  if (project?.customer_id) {
    const { data: c } = await db.from('customers').select('email').eq('id', project.customer_id).maybeSingle()
    clientEmail = (c as any)?.email ?? null
  }

  if (!project?.client_portal_token) {
    return NextResponse.json({ url: null, clientEmail, clientName: project?.client ?? null })
  }

  const portalUrl = `${appOrigin(request.headers.get('origin'))}/portal/${project.client_portal_token}`

  return NextResponse.json({
    token: project.client_portal_token,
    url: portalUrl,
    clientEmail,
    clientName: project.client ?? null,
  })
}
