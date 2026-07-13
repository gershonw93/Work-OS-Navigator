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

  const { company_id } = await request.json()
  if (!company_id) return NextResponse.json({ error: 'company_id required' }, { status: 400 })

  const [{ data: pkg }, { data: gcProfile }, { data: company }] = await Promise.all([
    db.from('bid_packages').select('scope, due_date, projects(name)').eq('id', params.packageId).single(),
    db.from('profiles').select('full_name').eq('id', user.id).single(),
    db.from('companies').select('name').eq('id', company_id).single(),
  ])

  const actorName = (gcProfile as any)?.full_name ?? 'Someone'

  const profile = await db.from('profiles').select('id').eq('company_id', company_id).single()
  if (!profile.data) {
    return NextResponse.json({ message: 'Sub has no account - reminder not sent in-app' })
  }

  const projectName = (pkg?.projects as any)?.name ?? 'a project'
  const duePart = pkg?.due_date ? ` Bid due ${new Date(pkg.due_date).toLocaleDateString()}.` : ''

  await db.from('notifications').insert({
    user_id: profile.data.id,
    type: 'bid_reminder',
    message: `Reminder: You are invited to bid on ${pkg?.scope} for ${projectName}.${duePart}`,
    read: false,
  })

  await logActivity(db, params.id, actorName, 'reminder_sent',
    `Sent bid reminder to ${(company as any)?.name ?? 'a sub'} for "${pkg?.scope}"`,
    { package_id: params.packageId, company_id }
  )

  return NextResponse.json({ sent: true })
}
