import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { actorCan } from '@/lib/server-permissions'
import { createSubcontract } from '@/lib/writes/subcontract'
import { EXPEDITER_TRADE, hireProblem } from '@/lib/permit-expediter'

export const runtime = 'nodejs'

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

/**
 * Hire the expediter on this permit: their signed proposal, with their fee,
 * recorded as their SUBCONTRACT on this job - the one row that puts the fee on
 * the budget, takes their bills and reaches QuickBooks. "Hired" is read off
 * that row (lib/permit-expediter.ts), so there is nothing else to write.
 *
 * Two gates, because it is two things: `permits: edit` for the permit, and
 * `invoices: edit` - what attaching a Directory company as a sub already asks
 * (app/api/projects/[id]/subcontracts). A person who may file permits but not
 * commit money is told so, rather than handed a contract they could not
 * otherwise write. Already hired on this job (through another permit on the
 * same unit) is not an error: `createSubcontract` hands back the one there is.
 */
export async function POST(request: Request, { params }: { params: { id: string; permitId: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'permits', 'edit')
  if (denied(gate)) return gate.denied
  if (!actorCan(gate.actor, 'invoices', 'edit')) {
    return NextResponse.json({ error: 'Recording their fee puts a contract on the budget, which needs permission to edit bills. Ask your admin.' }, { status: 403 })
  }
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { data: permit, error } = await db.from('permits')
    .select('id, permit_type, expediter_company_id').eq('id', params.permitId).eq('project_id', params.id).maybeSingle()
  if (error) {
    console.error('[permit-hire] permit read failed', error.message)
    return NextResponse.json({ error: 'Could not read this permit. Try again.' }, { status: 500 })
  }
  if (!permit) return NextResponse.json({ error: 'That permit is not on this job.' }, { status: 404 })
  if (!permit.expediter_company_id) return NextResponse.json({ error: 'Pick the expediter on this permit first (Edit details).' }, { status: 400 })

  const form = await request.formData()
  const fee = String(form.get('fee') ?? '').trim()
  const file = form.get('proposal')
  const hasFile = file instanceof File && file.size > 0
  const problem = hireProblem({ fee, hasFile })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const result = await createSubcontract(db, {
    userId: gate.actor.userId, projectId: params.id,
    body: {
      existing_company_id: permit.expediter_company_id,
      trade: EXPEDITER_TRADE,
      scope: 'Permit expediting - signed proposal',
      contract_amount: fee.replace(/[$,\s]/g, ''),
      proposal: file,
    },
  })
  if (result.status >= 300) return NextResponse.json(result.body, { status: result.status })
  return NextResponse.json({ ...result.body, hired: true }, { status: result.status })
}
