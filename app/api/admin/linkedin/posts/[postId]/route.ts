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
  return { db }
}

// Edit a queued post, or publish it right now.
// { body?, scheduled_at?, action?: 'now' | 'unschedule' }
export async function PATCH(request: Request, { params }: { params: { postId: string } }) {
  const ctx = await requireOwner(request)
  if ('error' in ctx) return ctx.error

  const { data: post } = await ctx.db.from('linkedin_posts').select('*').eq('id', params.postId).maybeSingle()
  if (!post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (post.status === 'posted') return NextResponse.json({ error: 'This post is already on LinkedIn.' }, { status: 400 })

  const payload = await request.json().catch(() => ({}))
  const updates: Record<string, any> = { updated_at: new Date().toISOString() }

  if (payload.body !== undefined) {
    const body = String(payload.body).trim()
    if (!body) return NextResponse.json({ error: 'Write something first.' }, { status: 400 })
    if (body.length > POST_MAX_CHARS) {
      return NextResponse.json({ error: `LinkedIn posts max out at ${POST_MAX_CHARS} characters.` }, { status: 400 })
    }
    updates.body = body
  }
  if (payload.scheduled_at !== undefined && payload.action !== 'unschedule') {
    const when = new Date(String(payload.scheduled_at))
    if (isNaN(when.getTime())) return NextResponse.json({ error: 'Pick a valid date and time.' }, { status: 400 })
    updates.scheduled_at = when.toISOString()
    updates.status = 'scheduled'
    updates.error = null
  }
  if (payload.action === 'unschedule') {
    updates.status = 'draft'
    updates.scheduled_at = null
    updates.error = null
  }

  if (payload.action === 'now') {
    const conn = await getValidConnection(ctx.db)
    if (!conn || conn.status !== 'connected' || !conn.org_urn) {
      return NextResponse.json({ error: 'LinkedIn is not connected. Connect it above first.' }, { status: 400 })
    }
    try {
      const urn = await publishPost(conn, (updates.body as string) ?? post.body)
      Object.assign(updates, { status: 'posted', posted_at: new Date().toISOString(), linkedin_post_urn: urn, error: null })
    } catch (e: any) {
      await ctx.db.from('linkedin_posts').update({ status: 'failed', error: e.message, updated_at: new Date().toISOString() }).eq('id', post.id)
      return NextResponse.json({ error: e.message }, { status: 502 })
    }
  }

  const { data: updated, error } = await ctx.db.from('linkedin_posts')
    .update(updates).eq('id', post.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ post: updated })
}

// Remove a post from the queue/history (never deletes anything on LinkedIn).
export async function DELETE(request: Request, { params }: { params: { postId: string } }) {
  const ctx = await requireOwner(request)
  if ('error' in ctx) return ctx.error
  await ctx.db.from('linkedin_posts').delete().eq('id', params.postId)
  return NextResponse.json({ ok: true })
}
