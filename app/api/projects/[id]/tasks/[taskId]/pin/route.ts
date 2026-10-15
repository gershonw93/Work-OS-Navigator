import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { jobGate } from '@/lib/job-access'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// If this task was created from a plan pin, return the pin so the task can
// link back to the exact spot on the sheet.
export async function GET(request: Request, { params }: { params: { id: string; taskId: string } }) {
  // Was any login, any job. Now `tasks: view` and on this job.
  const db = admin()
  const gate = await jobGate(db, request, params.id, 'tasks', 'view')
  if ('denied' in gate) return gate.denied

  const { data: pin } = await db
    .from('plan_pins')
    .select('id, plan_id, page')
    .eq('task_id', params.taskId)
    .eq('project_id', params.id)
    .maybeSingle()

  return NextResponse.json({ pin: pin ?? null })
}
