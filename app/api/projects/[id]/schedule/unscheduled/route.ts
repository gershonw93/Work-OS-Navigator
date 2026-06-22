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

  // Subs that don't have a schedule_items row yet
  const { data: subs } = await db
    .from('subcontracts')
    .select('id, scope, trade, companies(id, name)')
    .eq('project_id', params.id)
    .not('id', 'in',
      `(SELECT subcontract_id FROM schedule_items WHERE project_id = '${params.id}' AND subcontract_id IS NOT NULL)`
    )

  return NextResponse.json({ subs: subs ?? [] })
}
