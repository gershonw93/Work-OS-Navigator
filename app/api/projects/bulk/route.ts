import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor, actorCan } from '@/lib/server-permissions'
import { geocodeAddress, geocodeMany } from '@/lib/geocode'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const MAX_CHILDREN = 100

interface Child {
  name: string
  address: string
  unit: string | null
  floor: string | null
}

/**
 * Create a batch of related projects in one go.
 *
 * Every batch produces a SITE (a container project holding the building or
 * street, its address and its client) plus one child project per unit / floor /
 * house number. The children carry the work; the site carries the identity.
 *
 * Coordinates: for unit and floor batches every child is the same building, so
 * the address is geocoded once and shared. Street batches are genuinely
 * different addresses, so each one is looked up.
 */
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const actor = await getActor(db, token)
  if (!actorCan(actor, 'projects', 'create')) {
    return NextResponse.json({ error: 'You do not have permission to create projects.' }, { status: 403 })
  }

  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const body = await request.json()
  const {
    mode = 'unit',
    customer_id, client, type, start_date,
    name_prefix,
    site_name,
    // The building address, picked from autocomplete so it arrives complete
    // and usually already geocoded.
    address, lat, lng,
  } = body

  const namePrefix = String(name_prefix ?? '').trim()
  if (!namePrefix) return NextResponse.json({ error: 'A name prefix is required' }, { status: 400 })

  const children: Child[] = []
  let siteAddress = String(address ?? '').trim()
  let siteName = String(site_name ?? '').trim()

  if (mode === 'street') {
    // A run of house numbers on one street. Each child is its own address.
    const { street_name, first_number, increment, count } = body
    const street = String(street_name ?? '').trim()
    if (!street) return NextResponse.json({ error: 'A street name is required' }, { status: 400 })

    const n = Math.min(Math.max(Number(count) || 0, 1), MAX_CHILDREN)
    const inc = Number(increment) || 1
    let num = Number(first_number) || 1

    // "Main St, Lakewood, NJ 08701" - the town part of the address, reused for
    // every house so each one geocodes to the right place.
    const areaSuffix = siteAddress ? `, ${siteAddress}` : ''

    for (let i = 0; i < n; i++) {
      const childAddress = `${num} ${street}${areaSuffix}`
      children.push({
        name: `${namePrefix} - ${num} ${street}`,
        address: childAddress,
        unit: null,
        floor: null,
      })
      num += inc
    }
    if (!siteName) siteName = `${namePrefix} - ${street}`
    siteAddress = `${street}${areaSuffix}`
  } else if (mode === 'floor') {
    // One building, one project per floor.
    const { floor_start, floor_end, floor_label } = body
    if (!siteAddress) return NextResponse.json({ error: 'A building address is required' }, { status: 400 })

    const from = Number(floor_start) || 1
    const to = Number(floor_end) || from
    if (to < from) return NextResponse.json({ error: 'The last floor must be the same as or after the first' }, { status: 400 })
    if (to - from + 1 > MAX_CHILDREN) {
      return NextResponse.json({ error: `That is more than ${MAX_CHILDREN} floors` }, { status: 400 })
    }

    const label = String(floor_label ?? 'Floor').trim() || 'Floor'
    for (let f = from; f <= to; f++) {
      children.push({
        name: `${namePrefix} - ${label} ${f}`,
        address: siteAddress,
        unit: null,
        floor: String(f),
      })
    }
    if (!siteName) siteName = namePrefix
  } else {
    // One building, one project per unit.
    const { unit_start, unit_end } = body
    if (!siteAddress) return NextResponse.json({ error: 'A building address is required' }, { status: 400 })

    const from = Number(unit_start) || 1
    const to = Number(unit_end) || from
    if (to < from) return NextResponse.json({ error: 'The last unit must be the same as or after the first' }, { status: 400 })
    if (to - from + 1 > MAX_CHILDREN) {
      return NextResponse.json({ error: `That is more than ${MAX_CHILDREN} units` }, { status: 400 })
    }

    for (let n = from; n <= to; n++) {
      children.push({
        name: `${namePrefix} - Unit ${n}`,
        address: siteAddress,
        unit: String(n),
        floor: null,
      })
    }
    if (!siteName) siteName = namePrefix
  }

  if (children.length === 0) return NextResponse.json({ error: 'No projects to create' }, { status: 400 })

  // Coordinates. The client sends them when the address came from autocomplete;
  // otherwise look the address up here so bulk projects still reach the map.
  let siteCoords: { lat: number; lng: number } | null =
    lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : null
  if (!siteCoords && siteAddress) siteCoords = await geocodeAddress(siteAddress)

  const childCoords: (typeof siteCoords)[] = mode === 'street'
    ? await geocodeMany(children.map(c => c.address))
    : children.map(() => siteCoords)

  const shared = {
    client: client || null,
    type: type || 'residential',
    start_date: start_date || null,
    status: 'planning',
    gc_company_id: profile.company_id,
    created_by_company_id: profile.company_id,
    ...(customer_id ? { customer_id } : {}),
  }

  const geo = (c: { lat: number; lng: number } | null, addr: string) =>
    c ? { lat: c.lat, lng: c.lng, geocoded_address: addr } : {}

  // The site first - the children need its id.
  const siteRow: Record<string, unknown> = {
    ...shared,
    name: siteName || namePrefix,
    address: siteAddress || null,
    is_site: true,
    ...geo(siteCoords, siteAddress),
  }

  let { data: site, error: siteError } = await db.from('projects').insert(siteRow).select().single()
  // Pre-migration fallback: without is_site the batch is still worth creating,
  // it just lands flat the way it used to.
  let grouped = true
  if (siteError && (siteError as any).code === '42703') {
    grouped = false
    site = null
    siteError = null
  }
  if (siteError) return NextResponse.json({ error: siteError.message }, { status: 500 })

  const childRows: Record<string, unknown>[] = children.map((c, i) => ({
    ...shared,
    name: c.name,
    address: c.address,
    ...(grouped ? { parent_project_id: site?.id, unit: c.unit, floor: c.floor } : {}),
    ...geo(childCoords[i], c.address),
  }))

  let { data: projects, error } = await db.from('projects').insert(childRows).select()
  if (error && (error as any).code === '42703') {
    const flat = childRows.map(({ parent_project_id: _p, unit: _u, floor: _f, ...rest }: any) => rest)
    const retry = await db.from('projects').insert(flat).select()
    projects = retry.data; error = retry.error
    grouped = false
  }

  if (error) {
    // Don't strand an empty site if the children failed.
    if (site?.id) await db.from('projects').delete().eq('id', site.id)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    site: grouped ? site : null,
    projects: projects ?? [],
    count: (projects ?? []).length,
    located: childCoords.filter(Boolean).length,
  })
}
