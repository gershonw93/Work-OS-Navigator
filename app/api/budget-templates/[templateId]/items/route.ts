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

/** Add one line to a template, at the end. */
export async function POST(request: Request, { params }: { params: { templateId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'budget', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedTemplate(db, gate.actor.companyId, params.templateId)
  if ('denied' in owned) return owned.denied

  const line = cleanTemplateLine(await request.json().catch(() => ({})))
  if (!line.ok) return NextResponse.json({ error: line.error }, { status: 400 })

  const { data: last } = await db.from('budget_template_items').select('sort_order')
    .eq('template_id', owned.template.id).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const { data, error } = await db.from('budget_template_items')
    .insert({ template_id: owned.template.id, ...line.value, sort_order: ((last as any)?.sort_order ?? -1) + 1 })
    .select(TEMPLATE_ITEM_COLUMNS).single()
  if (error) { console.error('[budget-templates] add line failed', error.message); return NextResponse.json({ error: friendlyDbError(error) }, { status: 500 }) }
  return NextResponse.json({ item: data })
}
