import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function DELETE(request: Request, { params }: { params: { id: string; compId: string; quoteId: string } }) {
  // THE ROUTE HAS TO ASK. `middleware.ts` returns early for every `/api/` path,
  // so nothing else gates this: the GET beside it was guarded and every write in
  // the family answered anybody with a login.
  const gate = await requirePermission(admin(), request, 'quotes', 'delete')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db.from('quotes').delete().eq('id', params.quoteId).eq('comparison_id', params.compId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
