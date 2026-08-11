import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  return user ? db : null
}

// What the client gets to choose from. Optional - plenty of picks are "go to
// the showroom and tell us what you liked" - but when options exist with prices
// against them, the client can see the upgrade cost before they commit to it.
export async function POST(request: Request, { params }: { params: { selId: string } }) {
  const db = await auth(request)
  if (!db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Give the option a name' }, { status: 400 })

  const { data: last } = await db.from('selection_options')
    .select('sort_order').eq('selection_id', params.selId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()

  const { data, error } = await db.from('selection_options').insert({
    selection_id: params.selId,
    name,
    description: body.description || null,
    price: body.price ?? null,
    vendor: body.vendor || null,
    image_url: body.image_url || null,
    link_url: body.link_url || null,
    is_allowance: !!body.is_allowance,
    sort_order: (last?.sort_order ?? 0) + 10,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ option: data })
}

export async function DELETE(request: Request, { params }: { params: { selId: string } }) {
  const db = await auth(request)
  if (!db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const optionId = new URL(request.url).searchParams.get('optionId')
  if (!optionId) return NextResponse.json({ error: 'Which option?' }, { status: 400 })

  const { error } = await db.from('selection_options')
    .delete().eq('id', optionId).eq('selection_id', params.selId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
