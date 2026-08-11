import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { normalizeHex, parseOptionLines } from '@/lib/selections'

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

// What the client gets to choose from.
//
// A selection is a VISUAL decision - you cannot pick a paint color off a text
// label - so an option carries a swatch, a photo and a link to the product page
// alongside the price.
export async function POST(request: Request, { params }: { params: { selId: string } }) {
  const db = await auth(request)
  if (!db) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()

  const { data: last } = await db.from('selection_options')
    .select('sort_order').eq('selection_id', params.selId)
    .order('sort_order', { ascending: false }).limit(1).maybeSingle()
  let order = last?.sort_order ?? 0

  // Bulk paste. Twelve colors off a fan deck is not twelve trips through a form.
  if (typeof body.paste === 'string' && body.paste.trim()) {
    const parsed = parseOptionLines(body.paste)
    if (!parsed.length) {
      return NextResponse.json({ error: 'Could not read any options out of that.' }, { status: 422 })
    }
    const rows = parsed.map(p => ({
      selection_id: params.selId,
      name: p.name,
      brand: p.brand ?? null,
      price: p.price ?? null,
      color_hex: p.color_hex ?? null,
      link_url: p.link_url ?? null,
      vendor_company_id: body.vendor_company_id || null,
      sort_order: (order += 10),
    }))
    const { data, error } = await db.from('selection_options').insert(rows).select()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ options: data, created: data?.length ?? 0 })
  }

  const name = String(body.name ?? '').trim()
  if (!name) return NextResponse.json({ error: 'Give the option a name' }, { status: 400 })

  const { data, error } = await db.from('selection_options').insert({
    selection_id: params.selId,
    name,
    brand: body.brand || null,
    model_number: body.model_number || null,
    description: body.description || null,
    price: body.price ?? null,
    color_hex: normalizeHex(body.color_hex),
    image_url: body.image_url || null,
    link_url: body.link_url || null,
    vendor: body.vendor || null,
    vendor_company_id: body.vendor_company_id || null,
    is_allowance: !!body.is_allowance,
    sort_order: order + 10,
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
