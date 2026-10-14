import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { jobGate } from '@/lib/job-access'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Any login read any job's history - every bill, change order and payment
  // line in it - by id. Now `projects: view` and ON this job: the history
  // button sits in the header every sub and crew member on the job sees.
  const db = admin()
  const gate = await jobGate(db, request, params.id, 'projects', 'view')
  if ('denied' in gate) return gate.denied

  const { data: activity } = await db
    .from('project_activity')
    .select('*')
    .eq('project_id', params.id)
    .order('created_at', { ascending: false })
    .limit(200)

  return NextResponse.json({ activity: activity ?? [] })
}
