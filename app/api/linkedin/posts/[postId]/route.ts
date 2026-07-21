import { NextResponse } from 'next/server'
import { admin, getValidConnection, publishPost, POST_MAX_CHARS } from '@/lib/linkedin'

export const runtime = 'nodejs'

async function requireManager(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return { error: NextResponse.json({ error: 'No company' }, { status: 400 }) }
  if (!['admin', 'manager'].includes(profile.role)) {
    return { error: NextResponse.json({ error: 'Only an admin can manage LinkedIn posts.' }, { status: 403 }) }
  }
  return { db, companyId: profile.company_id as string }
}

// Edit a queued post, or publish it right now.
// { body?, scheduled_at?, action?: 'now' | 'unschedule' }
export async function PATCH(request: Request, { params }: { params: { postId: string } }) {
  const ctx = await requireManager(request)
  if ('error' in ctx) return ctx.error

  const { data: post } = await ctx.db.from('linkedin_posts')
    .select('*').eq('id', params.postId).eq('company_id', ctx.companyId).maybeSingle()
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
    const conn = await getValidConnection(ctx.db, ctx.companyId)
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

// Remove a draft/scheduled/failed post from the queue (history rows too, if
// you want them gone - it never deletes anything on LinkedIn itself).
export async function DELETE(request: Request, { params }: { params: { postId: string } }) {
  const ctx = await requireManager(request)
  if ('error' in ctx) return ctx.error
  await ctx.db.from('linkedin_posts').delete().eq('id', params.postId).eq('company_id', ctx.companyId)
  return NextResponse.json({ ok: true })
}
