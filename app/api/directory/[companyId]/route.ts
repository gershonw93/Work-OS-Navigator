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

  // A DIRECTORY ENTRY IS NOT ONLY AN ADDRESS, AND DELETING IT DELETED WHAT
  // HANGS OFF IT. Everything below cascades from the entry, silently:
  //   - the people who sign in under it (a sub invited before they had an
  //     account lands inside the GC's entry; profiles.company_id cascades);
  //   - every subcontract naming it - and from each of those the sub's BILLS
  //     (paid ones and ones already in QuickBooks, whose ids went with them),
  //     pay apps and schedule lines, on every job, other companies' included;
  //   - its compliance documents;
  //   - the contacts in its own address book (added_by_company_id cascades).
  // The route said "remove those first" only when a change order happened to
  // block the delete. Each is counted BEFORE anything is deleted and refused by
  // name; a count that could not be taken refuses too - it is not a zero.
  // Migration 156 refuses the worst two (people, another company's job) in the
  // database as well, so no other door can do it either.
  const count = (q: any) => q.select('id', { count: 'exact', head: true })
  const [people, book, contracts, bills, docs] = await Promise.all([
    count(db.from('profiles')).eq('company_id', params.companyId),
    count(db.from('companies')).eq('added_by_company_id', params.companyId),
    count(db.from('subcontracts')).eq('company_id', params.companyId),
    count(db.from('invoices')).eq('company_id', params.companyId),
    count(db.from('compliance_documents')).eq('company_id', params.companyId),
  ])
  const failed = [people, book, contracts, bills, docs].find(r => r.error)
  if (failed) {
    console.error('[directory DELETE] pre-check failed', { company: params.companyId, error: failed.error?.message })
    return NextResponse.json({ error: 'Could not check that contact before removing it. Try again.' }, { status: 500 })
  }
  const n = (r: { count: number | null }) => r.count ?? 0
  const plural = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
  const refusal =
    n(people) > 0 ? 'People from this company sign in to SyteNav under this contact, so removing it would remove their accounts. It stays; contact support to separate them.'
    : n(book) > 0 ? 'This company keeps its own contacts in SyteNav under this entry, so removing it would remove them too. It stays; contact support to separate them.'
    : n(contracts) + n(bills) + n(docs) > 0
      ? `This contact is on ${[
          n(contracts) && plural(n(contracts), 'subcontract', 'subcontracts'),
          n(bills) && plural(n(bills), 'bill', 'bills'),
          n(docs) && plural(n(docs), 'compliance document', 'compliance documents'),
        ].filter(Boolean).join(', ')}. Removing it would delete those too, so it stays. Remove it from those jobs first.`
    : null
  if (refusal) return NextResponse.json({ error: refusal }, { status: 409 })

  const { error } = await db.from('companies').delete().eq('id', params.companyId)
  if (error) {
    // A foreign key still pointing here is a SENTENCE, not a 500 with
    // Postgres's own words in it. 23503 means something of theirs is still on a
    // job, and the person needs to know which - not `violates foreign key
    // constraint "x_company_id_fkey"`.
    // Migration 156's guard: the database refused, and said why.
    if ((error as any).code === 'P0001') {
      console.error('[directory DELETE] refused by the database guard', { company: params.companyId, error: error.message })
      return NextResponse.json({ error: 'This contact is still tied to people or to another company\'s job, so it stays. Contact support to separate them.' }, { status: 409 })
    }
    if ((error as any).code === '23503') {
      return NextResponse.json({
        error: 'That contact is still attached to something on a job - a subcontract, a bill or a submittal. Remove those first.',
      }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
