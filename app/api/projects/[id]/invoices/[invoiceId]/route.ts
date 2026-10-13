import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { pushBill, pushBillPayment, updateBillInQbo, voidBillInQbo, billQboRefs } from '@/lib/quickbooks-push'
import { updateSubBill } from '@/lib/writes/sub-bill'
import { requirePermission, denied } from '@/lib/api-guard'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; invoiceId: string } },
) {
  const gate = await requirePermission(admin(), request, 'invoices', 'edit')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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
  let quickbooks: { updated: boolean; detail?: string } | undefined
  if (result.qbo.correctAmount) {
    const res = await updateBillInQbo(db, params.invoiceId)
    quickbooks = res.pushed
      ? { updated: true }
      : { updated: false, detail: res.reason === 'not_connected' ? undefined : res.detail }
  }

  return NextResponse.json({ ...result.body, quickbooks }, { status: result.status })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; invoiceId: string } },
) {
  const gate = await requirePermission(admin(), request, 'invoices', 'edit')
  if (denied(gate)) return gate.denied

  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Read what QuickBooks holds BEFORE the row goes - afterwards there is
  // nothing left to read the ids off, and an un-voided Bill is a payable for
  // money that no longer exists.
  const refs = await billQboRefs(db, params.invoiceId)

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

  // The payment first, then the bill - QuickBooks will not void a Bill a
  // BillPayment still points at. Never blocks the delete: the row is already
  // gone, and a miss lands in quickbooks_sync_log like every other push.
  const voided = await voidBillInQbo(db, { id: params.invoiceId, project_id: params.id, ...refs })

  return NextResponse.json({
    success: true,
    quickbooks: refs.qbo_id
      ? { voided: voided.pushed, detail: voided.pushed ? undefined : voided.detail }
      : undefined,
  })
}
