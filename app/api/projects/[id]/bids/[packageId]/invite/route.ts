import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(
  request: Request,
  { params }: { params: { id: string; packageId: string } }
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { company_ids } = await request.json()
  if (!company_ids?.length) return NextResponse.json({ error: 'No companies provided' }, { status: 400 })

  const [{ data: pkg }, { data: profile }] = await Promise.all([
    db.from('bid_packages').select('scope, projects(name)').eq('id', params.packageId).single(),
    db.from('profiles').select('full_name').eq('id', user.id).single(),
  ])

  const actorName = (profile as any)?.full_name ?? 'Someone'

  const { data: existing } = await db
    .from('bid_invitations')
    .select('company_id')
    .eq('bid_package_id', params.packageId)

  const alreadyInvited = new Set((existing ?? []).map(i => i.company_id))
  const newCompanyIds = company_ids.filter((id: string) => !alreadyInvited.has(id))

  if (newCompanyIds.length === 0) {
    return NextResponse.json({ message: 'All selected companies already invited' })
  }

  await db.from('bid_invitations').insert(
    newCompanyIds.map((company_id: string) => ({
      bid_package_id: params.packageId,
      company_id,
      status: 'invited',
    }))
  )

  const { data: profiles } = await db.from('profiles').select('id, company_id').in('company_id', newCompanyIds)
  if (profiles?.length) {
    const projectName = (pkg?.projects as any)?.name ?? 'a project'
    await db.from('notifications').insert(
      profiles.map(p => ({
        user_id: p.id,
        type: 'new_bid',
        message: `You have been invited to bid on ${pkg?.scope} for ${projectName}.`,
        read: false,
      }))
    )
  }

  // Fetch company names for the log
  const { data: companies } = await db.from('companies').select('name').in('id', newCompanyIds)
  const names = (companies ?? []).map(c => c.name).join(', ')
  await logActivity(db, params.id, actorName, 'subs_invited',
    `Invited ${newCompanyIds.length} sub${newCompanyIds.length > 1 ? 's' : ''} to bid on "${pkg?.scope}": ${names}`,
    { package_id: params.packageId, scope: pkg?.scope, company_ids: newCompanyIds }
  )

  return NextResponse.json({ invited: newCompanyIds.length })
}
