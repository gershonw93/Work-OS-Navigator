import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getActor, actorCan } from '@/lib/server-permissions'
import { geocodeAddress, geocodeManyExact } from '@/lib/geocode'
import { tooVagueToPin } from '@/lib/geocode-match'
import { billingLock } from '@/lib/api-guard'
import { projectSlotProblem } from '@/lib/billing-read'
import { cleanRow, fullAddress, lotRowProblem, lotJobName, sharedPlace, MAX_LOTS } from '@/lib/lot-list'
import { cleanLotDetails, type LotDetails } from '@/lib/lot-details'

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
  /** Lot details, on a batch made from a lot list. */
  lot?: Partial<LotDetails>
  /** A pin already checked on the review screen, so it is not looked up twice. */
  coords?: { lat: number; lng: number } | null
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
  const locked = await billingLock(db, actor?.companyId)
  if (locked) return locked

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
  // A lot list names each job from its own address; a prefix is optional there.
  if (!namePrefix && mode !== 'list') return NextResponse.json({ error: 'A name prefix is required' }, { status: 400 })

  const children: Child[] = []
  let siteAddress = String(address ?? '').trim()
  let siteName = String(site_name ?? '').trim()

  if (mode === 'list') {
    // A LIST OF REAL ADDRESSES, read from a file and checked row by row on the
    // review screen. Asked again here: the screen is not the only caller, and
    // a row that cannot be pinned must not become a job that silently never
    // reaches the map.
    const raw: unknown[] = Array.isArray(body.rows) ? body.rows : []
    if (!raw.length) return NextResponse.json({ error: 'There are no rows to create.' }, { status: 400 })
    if (raw.length > MAX_LOTS) return NextResponse.json({ error: `That is ${raw.length} lots - the most you can create at once is ${MAX_LOTS}.` }, { status: 400 })
    const rows = raw.map(r => ({ src: r as Record<string, any>, row: cleanRow(r as Record<string, unknown>) }))
    for (let i = 0; i < rows.length; i++) {
      const problem = lotRowProblem(rows[i].row)
      if (problem) return NextResponse.json({ error: `Row ${i + 1} (${rows[i].row.street || 'no address'}): ${problem}` }, { status: 400 })
    }
    for (const { src, row } of rows) {
      const lat = Number(src.lat), lng = Number(src.lng)
      children.push({
        name: lotJobName(row, namePrefix),
        address: fullAddress(row),
        unit: null,
        floor: null,
        lot: cleanLotDetails(row as unknown as Record<string, unknown>),
        coords: src.lat != null && src.lng != null && Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null,
      })
    }
    const place = sharedPlace(rows.map(r => r.row))
    if (!siteName) siteName = namePrefix || (place ? `${place} lots` : 'Lot list')
    // The group's address is the place they share, when they share one. Not
    // geocoded: a site is a folder, and a city-centre pin on it would read as
    // a job site on the map.
    siteAddress = place ?? ''
  } else if (mode === 'street') {
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
    // THE REASON STREET BATCHES NEVER REACHED THE MAP. "Maple Ave, Lakewood"
    // has no state and no ZIP, so every house was refused by the geocoder as
    // too vague to pin - correctly - and the batch was created anyway, forty
    // jobs with no pin and nothing said. Refused here, with the fix named.
    const vague = tooVagueToPin(children[0]?.address)
    if (vague) {
      return NextResponse.json({ error: 'Add the state or ZIP to "City, state & ZIP" (e.g. Lakewood, NJ 08701) - without it no house can be placed on the map.' }, { status: 400 })
    }
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

  // EVERY HOUSE IS A JOB ON THE PLAN, so a batch asks for room for all of
  // them at once. This door used to ask nothing at all - one press could open
  // a hundred jobs on a three-job plan. The site row is a folder and is not
  // counted (`readUsage`).
  const slot = await projectSlotProblem(db, profile.company_id, new Date(), children.length)
  if (slot) return NextResponse.json({ error: slot, billing: 'project_limit' }, { status: 402 })

  // Coordinates. The client sends them when the address came from autocomplete;
  // otherwise look the address up here so bulk projects still reach the map.
  let siteCoords: { lat: number; lng: number } | null =
    lat != null && lng != null ? { lat: Number(lat), lng: Number(lng) } : null
  if (!siteCoords && siteAddress && mode !== 'list') siteCoords = await geocodeAddress(siteAddress)

  let childCoords: (typeof siteCoords)[]
  if (mode === 'list') {
    // Only the rows the review screen did not already place are looked up.
    const unplaced = children.map((c, i) => (c.coords ? -1 : i)).filter(i => i >= 0)
    const found = await geocodeManyExact(unplaced.map(i => children[i].address))
    childCoords = children.map(c => c.coords ?? null)
    unplaced.forEach((i, k) => { childCoords[i] = found[k] })
  } else {
    // Exact matches only: a house number nobody has built yet comes back as
    // the middle of the street, and forty jobs on one pin is worse than none.
    childCoords = mode === 'street'
      ? await geocodeManyExact(children.map(c => c.address))
      : children.map(() => siteCoords)
  }

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
    ...(c.lot ?? {}),
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
