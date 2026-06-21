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

export async function POST(request: Request) {
  const user = await getUser(request)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: profile } = await db.from('profiles').select('company_id').eq('id', user.id).single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const body = await request.json()
  const { mode = 'unit', customer_id } = body

  const rows: Record<string, unknown>[] = []

  if (mode === 'street') {
    // Mode B – Street numbers
    const { client, name_prefix, street_name, first_number, increment, count, type, start_date } = body

    const n = Math.min(Number(count), 100)
    const inc = Number(increment) || 1
    let num = Number(first_number)

    for (let i = 0; i < n; i++) {
      const address = `${num} ${street_name}`
      const name = `${name_prefix} - ${address}`
      rows.push({
        name,
        address,
        client,
        type,
        start_date,
        status: 'planning',
        gc_company_id: profile.company_id,
        ...(customer_id ? { customer_id } : {}),
      })
      num += inc
    }
  } else {
    // Mode A – Unit numbers (existing behaviour)
    const { client, name_prefix, address_prefix, unit_start, unit_end, type, start_date } = body

    const from = Number(unit_start)
    const to = Math.min(Number(unit_end), from + 99)

    if (to < from) return NextResponse.json({ error: 'unit_end must be >= unit_start' }, { status: 400 })

    for (let n = from; n <= to; n++) {
      rows.push({
        name: `${name_prefix} Unit ${n}`,
        address: `${address_prefix} Unit ${n}`,
        client,
        type,
        start_date,
        status: 'planning',
        gc_company_id: profile.company_id,
        ...(customer_id ? { customer_id } : {}),
      })
    }
  }

  if (rows.length === 0) return NextResponse.json({ error: 'No projects to create' }, { status: 400 })

  const { data: projects, error } = await db.from('projects').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ projects: projects ?? [], count: (projects ?? []).length })
}
