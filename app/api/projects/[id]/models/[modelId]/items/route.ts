import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { modelOnSite } from '@/lib/site-models-read'
import { cleanTypeList, typeSortOrder } from '@/lib/inspection-types'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Ctx = { params: { id: string; modelId: string } }

/** Add inspections or punch items to a model. `titles` is a list; repeats are dropped. */
export async function POST(request: Request, { params }: Ctx) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  const model = await modelOnSite(db, params.id, params.modelId)
  if (!model) return NextResponse.json({ error: 'That model is not in this group.' }, { status: 404 })

  const body = await request.json().catch(() => ({}))
  const kind = body?.kind === 'inspection' ? 'inspection' : body?.kind === 'punch' ? 'punch' : null
  if (!kind) return NextResponse.json({ error: 'Say whether these are inspections or punch items.' }, { status: 400 })
  const titles = cleanTypeList(body.titles)
  if (!titles.length) return NextResponse.json({ error: kind === 'inspection' ? 'Pick at least one inspection.' : 'Write at least one punch item.' }, { status: 400 })

  const { data: existing } = await db.from('site_model_items').select('title').eq('model_id', model.id).eq('kind', kind)
  const held = new Set((existing ?? []).map(e => e.title.trim().toLowerCase()))
  const rows = titles.filter(t => !held.has(t.toLowerCase())).map((title, i) => ({
    model_id: model.id, kind, title,
    sort_order: kind === 'inspection' ? typeSortOrder(title, i) : (existing?.length ?? 0) + i,
  }))
  if (rows.length) {
    const { error } = await db.from('site_model_items').insert(rows)
    if (error) {
      console.error('[models/items] insert failed', error.message)
      return NextResponse.json({ error: 'Could not save them.' }, { status: 500 })
    }
  }
  return NextResponse.json({ added: rows.length })
}

/** Take one item off the model. Copies already on houses stay. */
export async function DELETE(request: Request, { params }: Ctx) {
  const db = admin()
  const gate = await requirePermission(db, request, 'projects', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  const model = await modelOnSite(db, params.id, params.modelId)
  if (!model) return NextResponse.json({ error: 'That model is not in this group.' }, { status: 404 })
  const item = new URL(request.url).searchParams.get('item')
  if (!item) return NextResponse.json({ error: 'Which item?' }, { status: 400 })
  const { error } = await db.from('site_model_items').delete().eq('id', item).eq('model_id', model.id)
  if (error) {
    console.error('[models/items] delete failed', error.message)
    return NextResponse.json({ error: 'Could not remove it.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
