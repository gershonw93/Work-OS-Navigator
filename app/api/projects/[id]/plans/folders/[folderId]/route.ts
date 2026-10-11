import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; folderId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const gate = await requirePermission(db, request, 'plans', 'delete')
  if (denied(gate)) return gate.denied
  // THE PLAN SET IS THE GC'S. A sub's own company admin holds plans:delete in
  // THEIR company, which said nothing about this job's drawings.
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { error } = await db
    .from('plan_folders')
    .delete()
    .eq('id', params.folderId)
    .eq('project_id', params.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
