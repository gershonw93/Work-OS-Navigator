import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * Connect selections to budget lines, in bulk, after the user has looked at it.
 *
 * The app can guess which line a selection belongs on and it's right most of
 * the time - but "most of the time" isn't good enough to apply silently, since
 * a wrong link puts a client's upgrade on somebody else's line. So the guess is
 * shown, the user changes whatever they disagree with, and only then does it
 * save.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const links: { id: string; budget_line_item_id: string | null }[] =
    Array.isArray(body.links) ? body.links : []
  if (!links.length) return NextResponse.json({ updated: 0 })

  let updated = 0
  for (const l of links) {
    if (!l?.id) continue
    const { error } = await db.from('project_selections')
      .update({ budget_line_item_id: l.budget_line_item_id || null, updated_at: new Date().toISOString() })
      .eq('id', l.id).eq('project_id', params.id)
    if (!error) updated++
  }

  return NextResponse.json({ updated })
}
