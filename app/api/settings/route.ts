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

  let { data: profile } = await db
    .from('profiles')
    .select('id, full_name, email, phone, role, company_id')
    .eq('id', user.id)
    .single()

  // Auto-create profile if missing
  if (!profile) {
    // Create a company first
    const { data: newCompany } = await db
      .from('companies')
      .insert({ name: user.email?.split('@')[0] ?? 'My Company', type: 'gc', contact_email: user.email ?? '', insurance_status: 'missing' })
      .select()
      .single()

    const { data: newProfile } = await db
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email ?? '',
        full_name: user.user_metadata?.full_name ?? '',
        role: 'admin',
        company_id: newCompany?.id ?? null,
      })
      .select('id, full_name, email, phone, role, company_id')
      .single()

    profile = newProfile
  }

  if (!profile) return NextResponse.json({ error: 'Could not load profile' }, { status: 500 })

  // If profile has no company_id, find the existing one from their projects first
  if (!profile.company_id) {
    // Look for a company linked to projects this user created
    const { data: projectRow } = await db
      .from('projects')
      .select('gc_company_id')
      .eq('created_by', user.id)
      .not('gc_company_id', 'is', null)
      .limit(1)
      .maybeSingle()

    // Fallback: find any project where their auth email matches company contact email
    let foundCompanyId = projectRow?.gc_company_id
    if (!foundCompanyId) {
      const { data: companyRow } = await db
        .from('companies')
        .select('id')
        .eq('contact_email', user.email ?? '')
        .limit(1)
        .maybeSingle()
      foundCompanyId = companyRow?.id
    }

    if (foundCompanyId) {
      await db.from('profiles').update({ company_id: foundCompanyId }).eq('id', user.id)
      profile.company_id = foundCompanyId
    } else {
      // Only create a blank company as last resort if truly nothing exists
      const { data: newCompany } = await db
        .from('companies')
        .insert({ name: user.user_metadata?.full_name ?? user.email?.split('@')[0] ?? 'My Company', type: 'gc', contact_email: user.email ?? '', insurance_status: 'missing' })
        .select()
        .single()
      if (newCompany) {
        await db.from('profiles').update({ company_id: newCompany.id }).eq('id', user.id)
        profile.company_id = newCompany.id
      }
    }
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
        .neq('id', user.id)
    : { data: [] }

  // Also fetch pending invites
  const { data: pendingInvites } = profile.company_id
    ? await db
        .from('company_invites')
        .select('id, email, role, status, created_at')
        .eq('company_id', profile.company_id)
        .eq('status', 'pending')
    : { data: [] }

  return NextResponse.json({
    profile,
    company: company ?? null,
    teammates: teammates ?? [],
    pendingInvites: pendingInvites ?? [],
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
