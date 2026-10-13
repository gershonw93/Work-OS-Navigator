import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, billingLock } from '@/lib/api-guard'
import { directoryContactProblem, updateDirectoryContact } from '@/lib/writes/directory-contact-edit'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// THESE ASKED ONLY "ARE YOU SIGNED IN" - and a Directory contact is a row in
// `companies`, the table that holds every customer of ours too, so any account
// could rename or delete ANY company by its id, another GC's own included. Now:
//   - the permission that opens the Directory (`directory: view`). Not `edit`:
//     the Edit and Delete controls have always been offered to everybody who
//     can open the Directory, and the Project Manager, Office Staff and Field
//     Supervisor who use them hold `view` only - `edit` would take a typo fix
//     away from all three. Whether they SHOULD is a permissions decision, not
//     one to make silently in a route.
//   - the read-only billing lock, asked by hand because `view` does not carry it;
//   - and WHOSE CONTACT IT IS: one this company added (`directoryContactProblem`).
async function directoryGate(db: ReturnType<typeof admin>, request: Request, companyId: string) {
  const gate = await requirePermission(db, request, 'directory', 'view')
  if (denied(gate)) return { denied: gate.denied }
  const locked = await billingLock(db, gate.actor.companyId)
  if (locked) return { denied: locked }
  const refused = await directoryContactProblem(db, { myCompanyId: gate.actor.companyId, companyId })
  if (refused) return { denied: NextResponse.json(refused.body, { status: refused.status }) }
  return { actor: gate.actor }
}

export async function PATCH(request: Request, { params }: { params: { companyId: string } }) {
  const db = admin()
  const gate = await directoryGate(db, request, params.companyId)
  if ('denied' in gate) return gate.denied

  // Everything after the gate is `updateDirectoryContact`
  // (lib/writes/directory-contact-edit.ts), which asks whose contact it is
  // again, for Claude's door.
  const body = await request.json()
  const result = await updateDirectoryContact(db, { myCompanyId: gate.actor.companyId, companyId: params.companyId, body })
  return NextResponse.json(result.body, { status: result.status })
}

export async function DELETE(request: Request, { params }: { params: { companyId: string } }) {
  const db = admin()
  const gate = await directoryGate(db, request, params.companyId)
  if ('denied' in gate) return gate.denied

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
