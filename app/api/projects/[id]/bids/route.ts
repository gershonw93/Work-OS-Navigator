import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function getUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const { data: { user } } = await admin().auth.getUser(token)
  return user
}

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()

  const [{ data: packages }, { data: bids }, { data: plans }, { data: companies }] = await Promise.all([
    db.from('bid_packages')
      .select('*, bid_invitations(id, company_id, status, companies(name)), bid_package_attachments(id, plan_id, project_plans(name, plan_type))')
      .eq('project_id', params.id)
      .order('created_at', { ascending: false }),
    db.from('bids')
      .select('*, bid_packages!inner(project_id, scope), companies(name)')
      .eq('bid_packages.project_id', params.id)
      .order('amount', { ascending: true }),
    db.from('project_plans')
      .select('id, name, plan_type')
      .eq('project_id', params.id)
      .order('name'),
    db.from('companies')
      .select('id, name, trade, contact_email')
      .eq('type', 'subcontractor')
      .order('name'),
  ])

  return NextResponse.json({
    packages: packages ?? [],
    bids: bids ?? [],
    plans: plans ?? [],
    companies: companies ?? [],
  })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { scope, description, due_date, trade, invited_company_ids, plan_ids } = await request.json()

  if (!scope || !description) {
    return NextResponse.json({ error: 'Scope and description are required' }, { status: 400 })
  }

  const { data: profile } = await db.from('profiles').select('full_name, companies(name)').eq('id', user.id).single()
  const actorName = (profile as any)?.full_name ?? 'Someone'

  const { data: pkg, error } = await db
    .from('bid_packages')
    .insert({ project_id: params.id, scope, description, due_date: due_date || null, trade: trade || null, status: 'open' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (invited_company_ids?.length > 0) {
    await db.from('bid_invitations').insert(
      invited_company_ids.map((company_id: string) => ({
        bid_package_id: pkg.id,
        company_id,
        status: 'invited',
      }))
    )

    // Notify subs with accounts
    const { data: profiles } = await db.from('profiles').select('id, company_id').in('company_id', invited_company_ids)
    if (profiles?.length) {
      const { data: project } = await db.from('projects').select('name').eq('id', params.id).single()
      await db.from('notifications').insert(
        profiles.map(p => ({
          user_id: p.id,
          type: 'new_bid',
          message: `You have been invited to bid on ${scope} for ${(project as any)?.name ?? 'a project'}.`,
          read: false,
        }))
      )
    }
  }

  if (plan_ids?.length > 0) {
    await db.from('bid_package_attachments').insert(
      plan_ids.map((plan_id: string) => ({
        bid_package_id: pkg.id,
        plan_id,
      }))
    )
  }

  const inviteCount = invited_company_ids?.length ?? 0
  await logActivity(db, params.id, actorName, 'package_created',
    `Created bid package "${scope}"${inviteCount > 0 ? ` and invited ${inviteCount} subcontractor${inviteCount > 1 ? 's' : ''}` : ''}`,
    { package_id: pkg.id, scope, trade: trade || null, invited_count: inviteCount }
  )

  return NextResponse.json({ package: pkg })
}
