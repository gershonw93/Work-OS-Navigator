import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(request: Request, { params }: { params: { id: string; entryId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { approval_status } = await request.json()
  if (!['approved', 'rejected', 'pending'].includes(approval_status)) {
    return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
  }

  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()

  const { data, error } = await db
    .from('time_entries')
    .update({
      approval_status,
      reviewed_by: user.id,
      reviewed_by_name: (profile as any)?.full_name ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', params.entryId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ entry: data })
}
