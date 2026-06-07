import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; rfiId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db
    .from('profiles')
    .select('full_name')
    .eq('id', user.id)
    .single()

  const body = await request.json()
  const { response, status } = body

  const { data: rfi, error } = await db
    .from('rfis')
    .update({
      response: response ?? null,
      responded_by_name: (profile as any)?.full_name ?? null,
      responded_at: new Date().toISOString(),
      status,
    })
    .eq('id', params.rfiId)
    .eq('project_id', params.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const actorName = (profile as any)?.full_name ?? 'Someone'
  await logActivity(
    db,
    params.id,
    actorName,
    'rfi_answered',
    `RFI #${rfi.rfi_number} marked ${status}`,
    { rfi_id: rfi.id, rfi_number: rfi.rfi_number, status },
  )

  return NextResponse.json({ rfi })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; rfiId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db
    .from('rfis')
    .delete()
    .eq('id', params.rfiId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
