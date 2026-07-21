import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getValidConnection, publishPost } from '@/lib/linkedin'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Publish every scheduled LinkedIn post that has come due. Runs on the Vercel
// cron; can also be pinged by an external scheduler with ?secret=CRON_SECRET
// for tighter timing than the Vercel plan allows.
export async function GET(request: Request) {
  // Auth: Vercel Cron sends x-vercel-cron; otherwise require CRON_SECRET.
  const isVercelCron = request.headers.get('x-vercel-cron') != null
  const secret = process.env.CRON_SECRET
  const provided = request.headers.get('Authorization')?.replace('Bearer ', '')
    || new URL(request.url).searchParams.get('secret')
  if (!isVercelCron && secret && provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = admin()
  const nowIso = new Date().toISOString()

  const { data: due, error } = await db.from('linkedin_posts')
    .select('id, company_id, body, created_by')
    .eq('status', 'scheduled')
    .lte('scheduled_at', nowIso)
    .order('scheduled_at', { ascending: true })
    .limit(25)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let posted = 0, failed = 0
  const connections = new Map<string, Awaited<ReturnType<typeof getValidConnection>>>()

  for (const post of due ?? []) {
    if (!connections.has(post.company_id)) {
      connections.set(post.company_id, await getValidConnection(db, post.company_id))
    }
    const conn = connections.get(post.company_id)

    let ok = false
    let message = ''
    if (!conn || conn.status !== 'connected' || !conn.org_urn) {
      message = 'LinkedIn connection is missing or expired. Reconnect in Settings > Integrations.'
    } else {
      try {
        const urn = await publishPost(conn, post.body)
        await db.from('linkedin_posts').update({
          status: 'posted', posted_at: new Date().toISOString(), linkedin_post_urn: urn, error: null, updated_at: new Date().toISOString(),
        }).eq('id', post.id)
        ok = true
        posted++
      } catch (e: any) {
        message = e.message
      }
    }

    if (!ok) {
      await db.from('linkedin_posts').update({
        status: 'failed', error: message, updated_at: new Date().toISOString(),
      }).eq('id', post.id)
      failed++
    }

    // Tell whoever queued it how it went.
    if (post.created_by) {
      const preview = post.body.length > 60 ? `${post.body.slice(0, 60)}…` : post.body
      await db.from('notifications').insert({
        user_id: post.created_by,
        type: 'linkedin_post',
        message: ok
          ? `Your scheduled LinkedIn post went out: "${preview}"`
          : `Your scheduled LinkedIn post failed: ${message}`,
        read: false,
      })
    }
  }

  return NextResponse.json({ ok: true, due: due?.length ?? 0, posted, failed })
}
