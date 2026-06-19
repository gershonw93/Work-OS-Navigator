import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

async function getUser(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const {
    data: { user },
  } = await admin().auth.getUser(token)
  return user
}

export async function GET(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()

  const { data: profile, error: profileError } = await db
    .from('profiles')
    .select('id, full_name, email, phone, role, company_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
  }

  const { data: company } = profile.company_id
    ? await db
        .from('companies')
        .select('id, name, type, contact_email, phone, address, license_number')
        .eq('id', profile.company_id)
        .single()
    : { data: null }

  const { data: teammates } = profile.company_id
    ? await db
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('company_id', profile.company_id)
    : { data: [] }

  return NextResponse.json({
    profile,
    company: company ?? null,
    teammates: teammates ?? [],
  })
}

export async function PATCH(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { full_name, phone, company, notifications } = body

  const db = admin()

  // Update profile fields
  if (full_name !== undefined || phone !== undefined) {
    const updates: Record<string, unknown> = {}
    if (full_name !== undefined) updates.full_name = full_name
    if (phone !== undefined) updates.phone = phone

    const { error } = await db.from('profiles').update(updates).eq('id', user.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Update company fields
  if (company && typeof company === 'object') {
    // Get user's company_id from their profile
    const { data: profile } = await db
      .from('profiles')
      .select('company_id')
      .eq('id', user.id)
      .single()

    if (profile?.company_id) {
      const companyUpdates: Record<string, unknown> = {}
      const allowed = ['name', 'type', 'contact_email', 'phone', 'address', 'license_number']
      for (const key of allowed) {
        if (company[key] !== undefined) companyUpdates[key] = company[key]
      }

      if (Object.keys(companyUpdates).length > 0) {
        const { error } = await db
          .from('companies')
          .update(companyUpdates)
          .eq('id', profile.company_id)
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }
  }

  // notifications: currently just acknowledged (no DB persistence yet)
  void notifications

  return NextResponse.json({ ok: true })
}
