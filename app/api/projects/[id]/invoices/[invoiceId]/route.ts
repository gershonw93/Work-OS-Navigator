import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { pushBill, pushBillPayment, updateBillInQbo, voidBillInQbo, voidBillPaymentInQbo, billQboRefs } from '@/lib/quickbooks-push'
import { updateSubBill } from '@/lib/writes/sub-bill'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; invoiceId: string } },
) {
  const db = admin()
  const gate = await requirePermission(db, request, 'invoices', 'edit')
  if (denied(gate)) return gate.denied
  // APPROVING A BILL IS THE GC'S ACT, AND IT PUSHES TO THE GC'S QUICKBOOKS.
  // `invoices: edit` alone let the admin of a sub's own company, invited onto
  // the job, approve or delete their own bill. Only the GC's Bills tab and
  // Approvals call this route - a sub's My Jobs page never does.
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  const user = { id: gate.actor.userId }

  const body = await request.json()
  const result = await updateSubBill(db, { userId: user.id, projectId: params.id, invoiceId: params.invoiceId, body })
  if (result.status >= 400 || !result.qbo) return NextResponse.json(result.body, { status: result.status })

  // An approved (or paid) bill belongs in QuickBooks. Same contract as the
  // payment push: never throws, 8s cap, not-connected is normal, and a miss is
  // caught by the Settings backlog sync. Runs AFTER the update is written so
  // the pusher reads the new status, and its result never gates the response.
  // HERE rather than in lib/writes/sub-bill.ts, which decides that a push is
  // due: nothing on the shared write path reaches QuickBooks itself.
  if (result.qbo.pushBill) {
    await pushBill(db, params.invoiceId)
  }
  // ...and paying it settles that Bill. Two records, in order: without the
  // second, the payable sat open in QuickBooks after the cash had gone out.
  // pushBill runs first so a bill approved and paid in one go has something
  // for the payment to link to.
  if (result.qbo.pushPayment) {
    await pushBillPayment(db, params.invoiceId)
  }
  // Correcting the amount on a bill ALREADY in QuickBooks. pushBill above
  // reports `already` and stops, by design - a second push would be a second
  // Bill. So the correction has its own path, and it is the only thing that
  // keeps the two systems agreeing about what is owed.
  //
  // It can refuse (the bill is paid over there; somebody re-split it there),
  // and the refusal is worth showing: the edit saved here either way, so
  // silence would leave QuickBooks quietly stale again.
  let quickbooks: { updated?: boolean; voided?: boolean; detail?: string } | undefined
  if (result.qbo.correctAmount) {
    const res = await updateBillInQbo(db, params.invoiceId)
    quickbooks = res.pushed
      ? { updated: true }
      : { updated: false, detail: res.reason === 'not_connected' ? undefined : res.detail }
  }
  // A PAID BILL MOVED BACK TO UNPAID takes its BillPayment out of QuickBooks,
  // or the money stays "paid out" there while the bill reads owing here. A
  // miss keeps qbo_payment_id, so Settings > QuickBooks > Retry voids can
  // finish it - and the screen is told rather than left believing it.
  if (result.qbo.voidPayment) {
    const res = await voidBillPaymentInQbo(db, params.invoiceId)
    if (res.pushed) quickbooks = { ...quickbooks, voided: true }
    else if (res.reason !== 'skipped') {
      quickbooks = { ...quickbooks, voided: false, detail: res.reason === 'not_connected' ? 'QuickBooks is not connected' : res.detail }
    }
  }

  return NextResponse.json({ ...result.body, quickbooks }, { status: result.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; invoiceId: string } },
) {
  const db = admin()
  const gate = await requirePermission(db, request, 'invoices', 'edit')
  if (denied(gate)) return gate.denied
  // APPROVING A BILL IS THE GC'S ACT, AND IT PUSHES TO THE GC'S QUICKBOOKS.
  // `invoices: edit` alone let the admin of a sub's own company, invited onto
  // the job, approve or delete their own bill. Only the GC's Bills tab and
  // Approvals call this route - a sub's My Jobs page never does.
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied
  const user = { id: gate.actor.userId }

  // QUICKBOOKS FIRST, THEN THE ROW. This used to delete and then void, so a
  // void QuickBooks refused left a live Bill (and BillPayment) over there with
  // nothing here to retry it from - the ids went with the row. Now a refusal
  // keeps the bill, says why, and pressing Delete again is the retry. Not
  // being connected is a normal state and does not block the delete; the
  // miss is in the sync log against the QuickBooks id.
  const refs = await billQboRefs(db, params.invoiceId)
  // On THIS project before anything reaches QuickBooks: the ids above are
  // read by id alone, and a void sent for somebody else's bill is not undone
  // by the delete below refusing it.
  const { data: named } = await db.from('invoices').select('invoice_number')
    .eq('id', params.invoiceId).eq('project_id', params.id).maybeSingle()
  if (!named) return NextResponse.json({ error: 'Invoice not found on this project' }, { status: 404 })
  const voided = await voidBillInQbo(db, {
    id: params.invoiceId, project_id: params.id, invoice_number: (named as any)?.invoice_number ?? null, ...refs,
  })
  if (!voided.pushed && voided.reason === 'failed') {
    return NextResponse.json({
      error: `QuickBooks would not remove this bill, so it has not been deleted here either (${voided.detail ?? 'no reason given'}). Fix that in QuickBooks, or delete it there by hand, then delete it again here.`,
      quickbooks: { voided: false, detail: voided.detail },
    }, { status: 502 })
  }

  // Scoped to the project in the URL. Deleting by id alone let a request name
  // any invoice in the database and have it removed, which every other route
  // here is careful not to allow.
  const { data: gone, error } = await db.from('invoices')
    .delete()
    .eq('id', params.invoiceId)
    .eq('project_id', params.id)
    .select('id, invoice_number, amount, company_name, status')
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!gone) return NextResponse.json({ error: 'Invoice not found on this project' }, { status: 404 })

  // Deleting an accepted invoice moves the budget, so it belongs in the log
  // next to the approval it undoes.
  const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  await logActivity(
    db, params.id, (profile as any)?.full_name ?? 'Someone', 'invoice_deleted',
    `Invoice ${gone.invoice_number ?? ''} deleted - $${Number(gone.amount ?? 0).toLocaleString()}${gone.company_name ? ` to ${gone.company_name}` : ''}`,
  )

  return NextResponse.json({
    success: true,
    quickbooks: refs.qbo_id
      ? { voided: voided.pushed, detail: voided.pushed ? undefined : voided.reason === 'not_connected' ? 'QuickBooks is not connected' : voided.detail }
      : undefined,
  })
}
