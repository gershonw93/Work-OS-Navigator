import { NextResponse } from 'next/server'
import { admin, getValidConnection, publishPost, POST_MAX_CHARS } from '@/lib/linkedin'

export const runtime = 'nodejs'

async function requireMember(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return { error: NextResponse.json({ error: 'No company' }, { status: 400 }) }
  return { db, userId: user.id, companyId: profile.company_id as string, role: profile.role as string }
}

const canPost = (role: string) => ['admin', 'manager'].includes(role)

// The queue + history for the Settings card.
export async function GET(request: Request) {
  const ctx = await requireMember(request)
  if ('error' in ctx) return ctx.error
  const { data: posts } = await ctx.db.from('linkedin_posts')
    .select('id, body, status, scheduled_at, posted_at, linkedin_post_urn, error, created_at')
    .eq('company_id', ctx.companyId)
    .order('created_at', { ascending: false })
    .limit(50)
  return NextResponse.json({ posts: posts ?? [] })
}

// Create a post: { body, action: 'now' | 'schedule' | 'draft', scheduled_at? }
export async function POST(request: Request) {
  const ctx = await requireMember(request)
  if ('error' in ctx) return ctx.error
  if (!canPost(ctx.role)) return NextResponse.json({ error: 'Only an admin can post to LinkedIn.' }, { status: 403 })

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
    company_id: ctx.companyId,
    body,
    status: action === 'schedule' ? 'scheduled' : 'draft',
    scheduled_at,
    created_by: ctx.userId,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (action !== 'now') return NextResponse.json({ post })

  // Post now: publish synchronously so the user sees the result immediately.
  const conn = await getValidConnection(ctx.db, ctx.companyId)
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
