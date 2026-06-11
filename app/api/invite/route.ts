import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

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

export async function POST(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { company_id, email, company_name } = body

  if (!company_id || !email) {
    return NextResponse.json({ error: 'company_id and email are required' }, { status: 400 })
  }

  const db = admin()

  // Send Supabase auth invite
  const { error: inviteError } = await db.auth.admin.inviteUserByEmail(email, {
    data: { company_id, invited_as: 'subcontractor' },
  })

  if (inviteError) {
    // "User already registered" is acceptable — they may already have an account
    if (!inviteError.message?.toLowerCase().includes('already')) {
      return NextResponse.json({ error: inviteError.message }, { status: 500 })
    }
  }

  // Record the invite
  const { error: dbError } = await db
    .from('company_invites')
    .insert({
      company_id,
      email,
      invited_by: user.id,
      status: 'pending',
    })

  if (dbError) {
    return NextResponse.json({ error: dbError.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
