import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { companyInspectionTypes } from '@/lib/inspection-types-read'
import { typeOptions, cleanTypeName, typeNameProblem, isDefaultType } from '@/lib/inspection-types'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/** Every inspection type this company can pick: the defaults, then its own. */
export async function GET(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'inspections', 'view')
  if (denied(gate)) return gate.denied
  const custom = await companyInspectionTypes(db, gate.actor.companyId)
  return NextResponse.json({ types: typeOptions(custom), custom })
}

/** Add a type to the company's list. Adding one that exists is not an error. */
export async function POST(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'inspections', 'edit')
  if (denied(gate)) return gate.denied
  const body = await request.json().catch(() => ({}))
  const problem = typeNameProblem(body?.name)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const name = cleanTypeName(body.name)!
  if (!gate.actor.companyId) return NextResponse.json({ error: 'Your account is not attached to a company.' }, { status: 400 })

  if (!isDefaultType(name)) {
    const { error } = await db.from('inspection_type_options').insert({ company_id: gate.actor.companyId, name })
    // 23505: already on the list, which is the outcome that was asked for.
    if (error && error.code !== '23505') {
      console.error('[inspection-types] insert failed', error.message)
      return NextResponse.json({ error: 'Could not save that inspection type.' }, { status: 500 })
    }
  }
  const custom = await companyInspectionTypes(db, gate.actor.companyId)
  return NextResponse.json({ name, types: typeOptions(custom), custom })
}
