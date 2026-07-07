import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// If this task was created from a plan pin, return the pin so the task can
// link back to the exact spot on the sheet.
export async function GET(request: Request, { params }: { params: { id: string; taskId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: pin } = await db
    .from('plan_pins')
    .select('id, plan_id, page')
    .eq('task_id', params.taskId)
    .eq('project_id', params.id)
    .maybeSingle()

  return NextResponse.json({ pin: pin ?? null })
}
