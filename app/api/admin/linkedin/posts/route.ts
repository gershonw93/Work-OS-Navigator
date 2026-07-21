import { NextResponse } from 'next/server'
import { isSuperAdmin } from '@/lib/super-admin'
import { admin, getValidConnection, publishPost, POST_MAX_CHARS } from '@/lib/linkedin'

export const runtime = 'nodejs'

async function requireOwner(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  if (!isSuperAdmin(user.email)) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  return { db, userId: user.id }
}

// The queue + history for the admin console.
export async function GET(request: Request) {
  const ctx = await requireOwner(request)
  if ('error' in ctx) return ctx.error
  const { data: posts } = await ctx.db.from('linkedin_posts')
    .select('id, body, status, scheduled_at, posted_at, linkedin_post_urn, error, created_at')
    .order('created_at', { ascending: false })
    .limit(50)
  return NextResponse.json({ posts: posts ?? [] })
}

// Create a post: { body, action: 'now' | 'schedule' | 'draft', scheduled_at? }
export async function POST(request: Request) {
  const ctx = await requireOwner(request)
  if ('error' in ctx) return ctx.error

  const payload = await request.json().catch(() => ({}))
  const body = String(payload.body ?? '').trim()
  const action = String(payload.action ?? 'draft')
  if (!body) return NextResponse.json({ error: 'Write something first.' }, { status: 400 })
  if (body.length > POST_MAX_CHARS) {
    return NextResponse.json({ error: `LinkedIn posts max out at ${POST_MAX_CHARS} characters.` }, { status: 400 })
  }

  let scheduled_at: string | null = null
  if (action === 'schedule') {
    const when = new Date(String(payload.scheduled_at ?? ''))
    if (isNaN(when.getTime())) return NextResponse.json({ error: 'Pick a valid date and time.' }, { status: 400 })
    scheduled_at = when.toISOString()
  }

  const { data: post, error } = await ctx.db.from('linkedin_posts').insert({
    body,
    status: action === 'schedule' ? 'scheduled' : 'draft',
    scheduled_at,
    created_by: ctx.userId,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (action !== 'now') return NextResponse.json({ post })

  // Post now: publish synchronously so the user sees the result immediately.
  const conn = await getValidConnection(ctx.db)
  if (!conn || conn.status !== 'connected' || !conn.org_urn) {
    await ctx.db.from('linkedin_posts').update({ status: 'failed', error: 'LinkedIn is not connected.', updated_at: new Date().toISOString() }).eq('id', post.id)
    return NextResponse.json({ error: 'LinkedIn is not connected. Connect it above first.' }, { status: 400 })
  }
  try {
    const urn = await publishPost(conn, body)
    const { data: updated } = await ctx.db.from('linkedin_posts').update({
      status: 'posted', posted_at: new Date().toISOString(), linkedin_post_urn: urn, error: null, updated_at: new Date().toISOString(),
    }).eq('id', post.id).select().single()
    return NextResponse.json({ post: updated })
  } catch (e: any) {
    await ctx.db.from('linkedin_posts').update({ status: 'failed', error: e.message, updated_at: new Date().toISOString() }).eq('id', post.id)
    return NextResponse.json({ error: e.message }, { status: 502 })
  }
}
