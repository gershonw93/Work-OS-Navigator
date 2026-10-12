import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { ownedTemplate } from '@/lib/budget-template-db'
import { templateNameProblem } from '@/lib/budget-template-line'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Ctx = { params: { templateId: string } }

/** Rename a template. */
export async function PATCH(request: Request, { params }: Ctx) {
  const db = admin()
  const gate = await requirePermission(db, request, 'budget', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedTemplate(db, gate.actor.companyId, params.templateId)
  if ('denied' in owned) return owned.denied

  const body = await request.json().catch(() => ({}))
  const problem = templateNameProblem(body?.name)
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const name = String(body.name).replace(/\s+/g, ' ').trim()
  const { error } = await db.from('budget_templates').update({ name }).eq('id', owned.template.id)
  if (error) { console.error('[budget-templates] rename failed', error.message); return NextResponse.json({ error: 'Could not rename the template.' }, { status: 500 }) }
  return NextResponse.json({ ok: true, name })
}

/**
 * Delete a template. Houses that were applied from it keep their budgets -
 * their lines stop following it (ON DELETE SET NULL, migration 138) - and a
 * model pointing at it is left with no budget (133, SET NULL).
 */
export async function DELETE(request: Request, { params }: Ctx) {
  const db = admin()
  const gate = await requirePermission(db, request, 'budget', 'delete')
  if (denied(gate)) return gate.denied
  const owned = await ownedTemplate(db, gate.actor.companyId, params.templateId)
  if ('denied' in owned) return owned.denied

  const { error } = await db.from('budget_templates').delete().eq('id', owned.template.id)
  if (error) { console.error('[budget-templates] delete failed', error.message); return NextResponse.json({ error: 'Could not delete the template.' }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
