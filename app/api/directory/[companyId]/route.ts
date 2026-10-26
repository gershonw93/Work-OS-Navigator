import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { directoryContactProblem, updateDirectoryContact } from '@/lib/writes/directory-contact-edit'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// THESE ASKED ONLY "ARE YOU SIGNED IN" - and a Directory contact is a row in
// `companies`, the table that holds every customer of ours too, so any account
// could rename or delete ANY company by its id, another GC's own included. Now:
//   - the permission for the ACT: `directory: edit` to change a contact,
//     `directory: delete` to remove one. The screen only offers each control to
//     somebody who holds it - the owner's decision: a person without the
//     permission must not be able to do it, from the screen or around it.
//     (Write actions carry the read-only billing lock with them.)
//   - and WHOSE CONTACT IT IS: one this company added (`directoryContactProblem`).
async function directoryGate(db: ReturnType<typeof admin>, request: Request, companyId: string, action: 'edit' | 'delete') {
  const gate = await requirePermission(db, request, 'directory', action)
  if (denied(gate)) return { denied: gate.denied }
  const refused = await directoryContactProblem(db, { myCompanyId: gate.actor.companyId, companyId })
  if (refused) return { denied: NextResponse.json(refused.body, { status: refused.status }) }
  return { actor: gate.actor }
}

export async function PATCH(request: Request, { params }: { params: { companyId: string } }) {
  const db = admin()
  const gate = await directoryGate(db, request, params.companyId, 'edit')
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
  const gate = await directoryGate(db, request, params.companyId, 'delete')
  if ('denied' in gate) return gate.denied

  // A DIRECTORY ENTRY CAN HAVE PEOPLE IN IT, AND DELETING IT DELETED THEM.
  // A sub invited before they had an account lands inside the GC's entry, and
  // `profiles.company_id` is ON DELETE CASCADE - so removing the entry removed
  // their sign-in, and everything of theirs that cascades from a profile, with
  // no warning to either side. An entry somebody has built an address book
  // in (`added_by_company_id`, CASCADE since 155) goes the same way. Both are
  // refused, and said, before anything is deleted. Read failures refuse too:
  // a count we could not take is not a count of zero.
  const [people, book] = await Promise.all([
    db.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', params.companyId),
    db.from('companies').select('id', { count: 'exact', head: true }).eq('added_by_company_id', params.companyId),
  ])
  if (people.error || book.error) {
    console.error('[directory DELETE] pre-check failed', { company: params.companyId, error: (people.error ?? book.error)?.message })
    return NextResponse.json({ error: 'Could not check that contact before removing it. Try again.' }, { status: 500 })
  }
  if ((people.count ?? 0) > 0 || (book.count ?? 0) > 0) {
    return NextResponse.json({
      error: (people.count ?? 0) > 0
        ? 'People from this company sign in to SyteNav under this contact, so removing it would remove their accounts. It stays; contact support to separate them.'
        : 'This company keeps its own contacts in SyteNav under this entry, so removing it would remove them too. It stays; contact support to separate them.',
    }, { status: 409 })
  }

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
