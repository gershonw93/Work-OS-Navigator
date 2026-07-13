import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Tells the UI how the current viewer relates to this project:
//   companyType - 'gc' | 'subcontractor' | ...
//   owns        - true if the viewer's company owns/created the project
// Used to gate project tabs (a sub awarded a subcontract on a GC's project
// should only see their own lane, not the GC's private money tabs).
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, companies(type)').eq('id', user.id).single()
  const companyType = (profile?.companies as any)?.type ?? 'gc'
  const companyId = profile?.company_id ?? null

  const { data: project } = await db.from('projects')
    .select('gc_company_id, created_by_company_id').eq('id', params.id).single()

  const owns = !!companyId && (project?.gc_company_id === companyId || project?.created_by_company_id === companyId)
  return NextResponse.json({ companyType, owns })
}
