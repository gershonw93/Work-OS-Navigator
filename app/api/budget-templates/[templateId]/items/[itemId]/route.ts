import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { ownedTemplate, TEMPLATE_ITEM_COLUMNS } from '@/lib/budget-template-db'
import { cleanTemplateLine } from '@/lib/budget-template-line'
import { friendlyDbError } from '@/lib/db-error'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Ctx = { params: { templateId: string; itemId: string } }

/**
 * Change a line. This changes the TEMPLATE only - houses already applied from
 * it change when somebody applies the model again and ticks the amount
 * changes, after seeing which houses follow and which were changed by hand.
 */
export async function PATCH(request: Request, { params }: Ctx) {
  const db = admin()
  const gate = await requirePermission(db, request, 'budget', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedTemplate(db, gate.actor.companyId, params.templateId)
  if ('denied' in owned) return owned.denied

  const line = cleanTemplateLine(await request.json().catch(() => ({})))
  if (!line.ok) return NextResponse.json({ error: line.error }, { status: 400 })
  const { data, error } = await db.from('budget_template_items').update(line.value)
    .eq('id', params.itemId).eq('template_id', owned.template.id)
    .select(TEMPLATE_ITEM_COLUMNS).maybeSingle()
  if (error) { console.error('[budget-templates] edit line failed', error.message); return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 }) }
  if (!data) return NextResponse.json({ error: 'That line is not on this template.' }, { status: 404 })
  return NextResponse.json({ item: data })
}

/** Remove a line. Houses keep the copy they have; it just stops following (SET NULL). */
export async function DELETE(request: Request, { params }: Ctx) {
  const db = admin()
  const gate = await requirePermission(db, request, 'budget', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedTemplate(db, gate.actor.companyId, params.templateId)
  if ('denied' in owned) return owned.denied

  const { data, error } = await db.from('budget_template_items').delete()
    .eq('id', params.itemId).eq('template_id', owned.template.id).select('id')
  if (error) { console.error('[budget-templates] remove line failed', error.message); return NextResponse.json({ error: 'Could not remove the line.' }, { status: 500 }) }
  if (!data?.length) return NextResponse.json({ error: 'That line is not on this template.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
