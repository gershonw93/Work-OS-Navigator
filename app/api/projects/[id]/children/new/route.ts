import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { projectSlotProblem } from '@/lib/billing-read'
import { geocodeAddress } from '@/lib/geocode'
import { tooVagueToPin } from '@/lib/geocode-match'
import { cleanLotDetails } from '@/lib/lot-details'
import { modelOnSite } from '@/lib/site-models-read'
import { newJobName, newJobProblem } from '@/lib/development'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * One more job in a development - "where I can add another one". Bulk Add was
 * the only way into a development, so the 31st lot meant starting a batch of
 * one from the Projects page.
 *
 * The new job takes what every job in the development shares - the client,
 * the customer, the type - from the development itself, the way Bulk Add
 * gives them out. A house MODEL is only assigned here; applying it (plans,
 * budget, inspections, punch) is the existing apply route, which the screen
 * calls next for this one house, so there is one way a model reaches a house.
 *
 * THE SAME DOOR AS ANY NEW JOB, so the same three questions: `projects:
 * create`, the read-only lock (inside `requirePermission`) and the plan's
 * project cap - a house is a job on the plan wherever it is created.
 */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'create')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject<any>(db, gate.actor, params.id, 'id, is_site, client, customer_id, type, start_date')
  if ('denied' in owned) return owned.denied
  const dev = owned.project
  if (!dev.is_site) return NextResponse.json({ error: 'That job is not a development.' }, { status: 400 })

  const body = await request.json().catch(() => ({} as any))
  const problem = newJobProblem(body ?? {})
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const companyId = gate.actor.companyId!
  const slot = await projectSlotProblem(db, companyId, new Date(), 1)
  if (slot) return NextResponse.json({ error: slot, billing: 'project_limit' }, { status: 402 })

  // A model has to be one of THIS development's.
  let modelId: string | null = null
  if (body?.model_id) {
    const model = await modelOnSite(db, params.id, String(body.model_id))
    if (!model) return NextResponse.json({ error: 'That model is not in this development.' }, { status: 400 })
    modelId = model.id
  }

  const address = String(body?.address ?? '').trim() || null
  // Only an address that names somewhere specific is looked up - a street with
  // no town puts the pin wherever the map guesses, and a wrong pin is worse
  // than none (lib/geocode-match.ts).
  const coords = address && !tooVagueToPin(address) ? await geocodeAddress(address) : null

  const row: Record<string, unknown> = {
    name: newJobName(body),
    address,
    client: dev.client ?? null,
    type: dev.type || 'residential',
    start_date: body?.start_date || dev.start_date || null,
    status: 'planning',
    gc_company_id: companyId,
    created_by_company_id: companyId,
    parent_project_id: params.id,
    ...(dev.customer_id ? { customer_id: dev.customer_id } : {}),
    ...(modelId ? { model_id: modelId } : {}),
    ...(coords ? { lat: coords.lat, lng: coords.lng, geocoded_address: address } : {}),
    ...cleanLotDetails(body ?? {}),
  }

  const { data: project, error } = await db.from('projects').insert(row).select('id, name').single()
  if (error || !project) {
    console.error('[development/new] insert failed', error?.message)
    return NextResponse.json({ error: 'Could not create the job. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ project, located: !!coords })
}
