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

const RESTRICTED_ROLES = ['field_supervisor', 'worker', 'read_only', 'member']

export async function GET(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('company_id, role, companies(type)').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ projects: [] })

  // Subcontractors: "Projects" lists the jobs they created/own. (Awarded GC
  // jobs live under My Jobs, since those projects are owned by the GC.)
  if ((profile.companies as any)?.type === 'subcontractor' && profile.company_id) {
    const subScope = `created_by_company_id.eq.${profile.company_id},gc_company_id.eq.${profile.company_id}`
    let { data: ownProjects, error: e1 } = await db.from('projects')
      .select('id, name, status, start_date, end_date, address, client, type, created_at, lat, lng')
      .or(subScope).order('created_at', { ascending: false })
    if (e1 && (e1 as any).code === '42703') {
      ownProjects = (await db.from('projects')
        .select('id, name, status, start_date, end_date, address, client, type, created_at')
        .or(subScope).order('created_at', { ascending: false })).data as any
    }
    return NextResponse.json({ projects: ownProjects ?? [] })
  }

  // Restricted roles only see projects they are explicitly assigned to
  if (profile.role && RESTRICTED_ROLES.includes(profile.role)) {
    const { data: profile2 } = await db.from('profiles').select('email, full_name').eq('id', user.id).single()

    // Try profile_id match first (needs SQL migration), then fall back to email/name match
    const { data: byProfileId } = await db
      .from('project_team_members')
      .select('project_id')
      .eq('profile_id', user.id)

    let projectIds = (byProfileId ?? []).map((a: any) => a.project_id).filter(Boolean)

    // Fallback: match by email or name in project_team_members
    if (projectIds.length === 0 && profile2) {
      const conditions: string[] = []
      if (profile2.email) conditions.push(`email.eq.${profile2.email}`)
      if (profile2.full_name) conditions.push(`name.eq.${profile2.full_name}`)

      if (conditions.length > 0) {
        const { data: byNameEmail } = await db
          .from('project_team_members')
          .select('project_id')
          .or(conditions.join(','))
        projectIds = (byNameEmail ?? []).map((a: any) => a.project_id).filter(Boolean)
      }
    }

    if (projectIds.length === 0) return NextResponse.json({ projects: [] })

    let { data, error: e2 } = await db
      .from('projects')
      .select('id, name, status, start_date, end_date, address, client, type, created_at, lat, lng')
      .in('id', projectIds)
      .order('created_at', { ascending: false })
    if (e2 && (e2 as any).code === '42703') {
      data = (await db.from('projects')
        .select('id, name, status, start_date, end_date, address, client, type, created_at')
        .in('id', projectIds).order('created_at', { ascending: false })).data as any
    }

    return NextResponse.json({ projects: data ?? [] })
  }

  // All company projects - either as GC or as standalone owner.
  // Includes address + coords so the Projects map can place pins.
  const scope = `gc_company_id.eq.${profile.company_id},created_by_company_id.eq.${profile.company_id}`
  let { data, error } = await db
    .from('projects')
    .select('id, name, status, start_date, end_date, type, customer_id, address, client, lat, lng, interior_sqft, exterior_sqft')
    .or(scope)
    .order('created_at', { ascending: false })

  // Pre-migration fallback: sqft and/or lat/lng columns may not exist yet.
  if (error && (error as any).code === '42703') {
    const retry1 = await db
      .from('projects')
      .select('id, name, status, start_date, end_date, type, customer_id, address, client, lat, lng')
      .or(scope)
      .order('created_at', { ascending: false })
    data = retry1.data as any; error = retry1.error
    if (error && (error as any).code === '42703') {
      const retry2 = await db
        .from('projects')
        .select('id, name, status, start_date, end_date, type, customer_id, address, client')
        .or(scope)
        .order('created_at', { ascending: false })
      data = retry2.data as any; error = retry2.error
    }
  }

  return NextResponse.json({ projects: data ?? [] })
}

export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization')
  const token = authHeader?.replace('Bearer ', '')

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )

  // Verify token and get user
  const { data: { user }, error: userError } = await admin.auth.getUser(token)
  if (userError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Get company_id from profile
  const { data: profile, error: profileError } = await admin
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single()

  if (profileError || !profile) {
    return NextResponse.json({ error: 'Profile not found. Please contact support.' }, { status: 400 })
  }

  const body = await request.json()
  const { name, address, client, type, start_date, end_date, customer_id, lat, lng, interior_sqft, exterior_sqft, billing_mode, default_retainage_pct } = body

  const base = {
    name, address, client, type, start_date,
    end_date: end_date || null,
    status: 'planning',
    customer_id: customer_id || null,
    gc_company_id: profile.company_id,
    created_by_company_id: profile.company_id,
  }
  const withGeo = lat != null && lng != null ? { ...base, lat, lng, geocoded_address: address } : base
  const withSqft = (interior_sqft != null || exterior_sqft != null)
    ? { ...withGeo, interior_sqft: interior_sqft ?? null, exterior_sqft: exterior_sqft ?? null }
    : withGeo
  const full = billing_mode
    ? { ...withSqft, billing_mode, ...(default_retainage_pct != null ? { default_retainage_pct } : {}) }
    : withSqft

  let { data: project, error: insertError } = await admin.from('projects').insert(full).select().single()
  // Pre-migration fallback: billing_mode / sqft / geo columns may not exist yet.
  if (insertError && (insertError as any).code === '42703') {
    const retryBilling = await admin.from('projects').insert(withSqft).select().single()
    project = retryBilling.data; insertError = retryBilling.error
  }
  if (insertError && (insertError as any).code === '42703') {
    const retry1 = await admin.from('projects').insert(withGeo).select().single()
    project = retry1.data; insertError = retry1.error
    if (insertError && (insertError as any).code === '42703') {
      const retry2 = await admin.from('projects').insert(base).select().single()
      project = retry2.data; insertError = retry2.error
    }
  }

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  return NextResponse.json({ project })
}
