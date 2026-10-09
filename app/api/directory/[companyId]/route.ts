import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { cleanTypeList } from '@/lib/inspection-types'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(request: Request, { params }: { params: { companyId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  // No 'website': `companies` has no such column, and Supabase answers an
  // unknown one with data: null rather than an error - so every edit on this
  // form was one typo away from saving nothing and reporting success.
  const allowed = ['name', 'type', 'trade', 'contact_email', 'phone', 'address', 'license_number']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key] || null
  }

  // Which inspections an inspector does lives in `extra` beside the
  // jurisdiction, so it is MERGED in - replacing `extra` wholesale would wipe
  // the jurisdiction and cert number this form never shows.
  if (body.inspection_types !== undefined) {
    const { data: cur } = await db.from('companies').select('extra').eq('id', params.companyId).maybeSingle()
    updates.extra = { ...(((cur as any)?.extra as Record<string, unknown>) ?? {}), inspection_types: cleanTypeList(body.inspection_types) }
  }

  const { data, error } = await db.from('companies').update(updates).eq('id', params.companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ company: data })
}

export async function DELETE(request: Request, { params }: { params: { companyId: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db.from('companies').delete().eq('id', params.companyId)
  if (error) {
    // A foreign key still pointing here is a SENTENCE, not a 500 with
    // Postgres's own words in it. 23503 means something of theirs is still on a
    // job, and the person needs to know which - not `violates foreign key
    // constraint "x_company_id_fkey"`.
    if ((error as any).code === '23503') {
      return NextResponse.json({
        error: 'That contact is still attached to something on a job - a subcontract, a bill or a submittal. Remove those first.',
      }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
