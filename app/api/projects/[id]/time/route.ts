import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: entries, error } = await db
    .from('time_entries')
    .select('*')
    .eq('project_id', params.id)
    .order('clock_in_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const myOpen = (entries ?? []).find(e => e.profile_id === user.id && !e.clock_out_at) ?? null
  return NextResponse.json({ entries: entries ?? [], myOpen, myId: user.id })
}
