import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request, { params }: { params: { id: string; logId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { body } = await request.json()
  if (!body || !body.trim()) return NextResponse.json({ error: 'Update text is required' }, { status: 400 })

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  const { data, error } = await db
    .from('daily_log_updates')
    .insert({
      daily_log_id: params.logId,
      body: body.trim(),
      created_by: user.id,
      created_by_name: (profile as any)?.full_name ?? null,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await logActivity(db, params.id, (profile as any)?.full_name || 'Someone', 'daily_log_update',
    `Daily log update: ${body.trim().slice(0, 80)}`, { log_id: params.logId, update_id: data.id }, user.id)

  return NextResponse.json({ update: data })
}
