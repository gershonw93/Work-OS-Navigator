import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function projectFor(db: ReturnType<typeof admin>, token: string) {
  const { data } = await db.from('projects')
    .select('id, name, address, client, client_portal_token')
    .eq('client_portal_token', token).single()
  return data
}

// The client's own view of what they still owe you. Same token as the portal
// they already have - a second link is a second thing to lose.
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const project = await projectFor(db, params.token)
  if (!project) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  const { data: selections } = await db
    .from('project_selections')
    .select(`id, category, item, location, allowance_amount, needed_by, status,
      selected_option_id, selected_name, selected_price, selected_at, notes, sort_order,
      ordered_at, expected_delivery, change_requested_at, change_request_note,
      reference_url, reference_label,
      selection_options (id, name, description, price, brand, model_number, color_hex, image_url, link_url, is_allowance, sort_order)`)
    .eq('project_id', project.id)
    .order('sort_order', { ascending: true })

  return NextResponse.json({
    project: { name: project.name, address: project.address, client_name: project.client },
    selections: selections ?? [],
  })
}

// The client makes a pick. They can change it right up until the GC marks it
// ordered - after that it's a change order, not a choice, and the app should
// say so rather than silently accept it.
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const project = await projectFor(db, params.token)
  if (!project) return NextResponse.json({ error: 'This link is no longer valid.' }, { status: 404 })

  const body = await request.json()
  const selectionId = String(body.selection_id ?? '')
  if (!selectionId) return NextResponse.json({ error: 'Which selection?' }, { status: 400 })

  const { data: sel } = await db.from('project_selections')
    .select('id, status, project_id').eq('id', selectionId).eq('project_id', project.id).single()
  if (!sel) return NextResponse.json({ error: 'Selection not found' }, { status: 404 })

  // Already ordered. Not a silent edit - it's a request somebody has to answer,
  // and pretending otherwise would have the client believe a change happened
  // when the truck is already loaded.
  if (sel.status === 'ordered' || sel.status === 'installed') {
    const note = String(body.selected_name ?? body.note ?? '').trim()
    const { error: reqErr } = await db.from('project_selections').update({
      change_requested_at: new Date().toISOString(),
      change_request_note: note ? note.slice(0, 500) : 'Client asked to change this after it was ordered.',
      updated_at: new Date().toISOString(),
    }).eq('id', selectionId)
    if (reqErr) return NextResponse.json({ error: reqErr.message }, { status: 500 })
    return NextResponse.json({
      ok: true,
      change_requested: true,
      message: sel.status === 'installed'
        ? "This one is already installed. We've passed your note on and we'll call you."
        : "This one is already on order. We've passed your request on - we'll contact you if we can't make the change.",
    })
  }

  const patch: Record<string, unknown> = {
    status: 'chosen',
    selected_at: new Date().toISOString(),
    selected_by_name: String(body.name ?? project.client ?? '').trim() || null,
    updated_at: new Date().toISOString(),
  }

  if (body.option_id) {
    const { data: opt } = await db.from('selection_options')
      .select('id, name, price').eq('id', body.option_id).eq('selection_id', selectionId).single()
    if (!opt) return NextResponse.json({ error: 'That option is no longer available.' }, { status: 400 })
    patch.selected_option_id = opt.id
    patch.selected_name = opt.name
    patch.selected_price = opt.price
  } else {
    // A write-in: "Sherwin Williams Alabaster". Just as valid a decision.
    const written = String(body.selected_name ?? '').trim()
    if (!written) return NextResponse.json({ error: 'Pick an option or tell us what you chose.' }, { status: 400 })
    patch.selected_option_id = null
    patch.selected_name = written.slice(0, 300)
    patch.selected_price = null
  }

  if (body.note != null) patch.notes = String(body.note).slice(0, 1000)

  const changing = sel.status === 'chosen'
  const { error } = await db.from('project_selections').update(patch).eq('id', selectionId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    ok: true,
    // Nothing is ordered yet, but the GC may already have started - promise the
    // change, not the outcome.
    message: changing
      ? "Updated. If we can't make the change we'll contact you."
      : 'Thanks - got it.',
  })
}
