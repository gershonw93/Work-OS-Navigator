import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(
  request: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await db
    .from('task_notes')
    .select('id, task_id, content, author_name, created_at')
    .eq('task_id', params.taskId)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ notes: data ?? [] })
}

export async function POST(
  request: Request,
  { params }: { params: { id: string; taskId: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { content } = await request.json()
  if (!content?.trim()) return NextResponse.json({ error: 'Content required' }, { status: 400 })

  // Fetch author name from profiles
  const { data: profile } = await db
    .from('profiles')
    .select('full_name, email')
    .eq('id', user.id)
    .single()

  const author_name = profile?.full_name ?? profile?.email ?? user.email ?? 'Unknown'

  const { data, error } = await db
    .from('task_notes')
    .insert({ task_id: params.taskId, content: content.trim(), author_name })
    .select('id, task_id, content, author_name, created_at')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ note: data })
}
