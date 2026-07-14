import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { hashKey } from '@/lib/delete-key'

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
    // Check if this user was invited - invited users have company_id + role in their metadata
    const metaCompanyId = user.user_metadata?.company_id as string | undefined
    const metaRole = user.user_metadata?.role as string | undefined

    let assignedCompanyId: string | null = metaCompanyId ?? null

    if (!assignedCompanyId) {
      // Brand-new user (not via invite) - create a company for them
      const { data: newCompany } = await db
        .from('companies')
        .insert({ name: user.email?.split('@')[0] ?? 'My Company', type: 'gc', contact_email: user.email ?? '', insurance_status: 'missing' })
        .select()
        .single()
      assignedCompanyId = newCompany?.id ?? null
    }

    const { data: newProfile } = await db
      .from('profiles')
      .upsert({
        id: user.id,
        email: user.email ?? '',
        full_name: user.user_metadata?.full_name ?? '',
        role: metaRole ?? 'admin',
        company_id: assignedCompanyId,
      })
      .select('id, full_name, email, phone, role, company_id')
      .single()

    profile = newProfile
  }

  if (!profile) return NextResponse.json({ error: 'Could not load profile' }, { status: 500 })

  // Mark this user's invite as accepted (they've logged in and have a profile)
  if (profile.company_id && user.email) {
    await db
      .from('company_invites')
      .update({ status: 'accepted' })
      .eq('company_id', profile.company_id)
      .eq('email', user.email)
      .eq('status', 'pending')
  }

  // Backfill email/full_name from auth if the profile row has blanks
  const needsBackfill =
    (!profile.email && user.email) ||
    (!profile.full_name && user.user_metadata?.full_name)
  if (needsBackfill) {
    const backfill: Record<string, string> = {}
    if (!profile.email && user.email) backfill.email = user.email
    if (!profile.full_name && user.user_metadata?.full_name) backfill.full_name = user.user_metadata.full_name
    await db.from('profiles').update(backfill).eq('id', user.id)
    if (backfill.email) profile.email = backfill.email
    if (backfill.full_name) profile.full_name = backfill.full_name
  }

  // Always ensure email matches auth (source of truth)
  if (user.email && profile.email !== user.email) {
    profile.email = user.email
  }

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

  let company: any = null
  if (profile.company_id) {
    const full = await db.from('companies')
      .select('id, name, type, contact_email, phone, address, license_number, default_payment_terms, default_billing_mode, default_retainage_pct, logo_url, delete_protection_enabled, delete_key_hash')
      .eq('id', profile.company_id).single()
    if (!full.error) company = full.data
    else {
      // Pre-migration fallback: billing default columns may not exist yet.
      const basic = await db.from('companies')
        .select('id, name, type, contact_email, phone, address, license_number, default_payment_terms, logo_url, delete_protection_enabled, delete_key_hash')
        .eq('id', profile.company_id).single()
      company = basic.data
    }
  }

  // Never leak the hash - expose only whether protection is on and a key is set.
  const deleteProtection = {
    enabled: !!(company as any)?.delete_protection_enabled,
    keySet: !!(company as any)?.delete_key_hash,
  }
  if (company) { delete (company as any).delete_key_hash; delete (company as any).delete_protection_enabled }

  // Include ALL company members (including self) so the list is never empty
  const { data: allMembers } = profile.company_id
    ? await db
        .from('profiles')
        .select('id, full_name, email, role')
        .eq('company_id', profile.company_id)
        .order('full_name')
    : { data: [] }

  const teammates = allMembers ?? []

  // Also fetch pending invites - select * to avoid column-not-found if role column missing
  let pendingInvites: unknown[] = []
  if (profile.company_id) {
    const { data: rawInvites } = await db
      .from('company_invites')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('status', 'pending')
    pendingInvites = (rawInvites ?? []).map((r: Record<string, unknown>) => ({
      id: r.id,
      email: r.email,
      role: r.role ?? 'read_only',
      status: r.status,
      created_at: r.created_at,
    }))
  }

  return NextResponse.json({
    profile,
    company: company ?? null,
    teammates: teammates ?? [],
    pendingInvites,
    deleteProtection,
  })
}

export async function PATCH(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { full_name, phone, company, notifications, delete_protection } = body

  const db = admin()

  // Delete-protection: company-wide secret key. Admin/manager only.
  if (delete_protection && typeof delete_protection === 'object') {
    const { data: prof } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
    if (!prof?.company_id || !['admin', 'manager'].includes(prof.role ?? '')) {
      return NextResponse.json({ error: 'Only an admin can change delete protection.' }, { status: 403 })
    }
    const updates: Record<string, unknown> = {}
    if (typeof delete_protection.enabled === 'boolean') updates.delete_protection_enabled = delete_protection.enabled
    if (typeof delete_protection.key === 'string') {
      const k = delete_protection.key.trim()
      updates.delete_key_hash = k ? hashKey(k) : null
    }
    if (Object.keys(updates).length) {
      const { error } = await db.from('companies').update(updates).eq('id', prof.company_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
  }

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
      const allowed = ['name', 'type', 'contact_email', 'phone', 'address', 'license_number', 'default_payment_terms', 'default_billing_mode', 'default_retainage_pct']
      for (const key of allowed) {
        if (company[key] !== undefined) companyUpdates[key] = company[key]
      }

      if (Object.keys(companyUpdates).length > 0) {
        let { error } = await db.from('companies').update(companyUpdates).eq('id', profile.company_id)
        // Pre-migration fallback: drop the billing default columns if absent.
        if (error && (error as any).code === '42703') {
          const { default_billing_mode: _b, default_retainage_pct: _r, ...rest } = companyUpdates
          error = (await db.from('companies').update(rest).eq('id', profile.company_id)).error
        }
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      }
    }
  }

  // notifications: currently just acknowledged (no DB persistence yet)
  void notifications

  return NextResponse.json({ ok: true })
}
