import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

  const { data: pkg } = await db
    .from('bid_packages')
    .select('scope, due_date, projects(name)')
    .eq('id', params.packageId)
    .single()

  // Find the sub's profile
  const { data: profile } = await db
    .from('profiles')
    .select('id')
    .eq('company_id', company_id)
    .single()

  if (!profile) {
    return NextResponse.json({ message: 'Sub has no account — reminder not sent in-app' })
  }

  const projectName = (pkg?.projects as any)?.name ?? 'a project'
  const duePart = pkg?.due_date ? ` Bid due ${new Date(pkg.due_date).toLocaleDateString()}.` : ''

  await db.from('notifications').insert({
    user_id: profile.id,
    type: 'bid_reminder',
    message: `Reminder: You are invited to bid on ${pkg?.scope} for ${projectName}.${duePart}`,
    read: false,
  })

  return NextResponse.json({ sent: true })
}
