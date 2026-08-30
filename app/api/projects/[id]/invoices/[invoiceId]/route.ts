import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'
import { notify } from '@/lib/notify'
import { validateAllocations } from '@/lib/allocations'
import { pushBill, pushBillPayment, updateBillInQbo, voidBillInQbo, billQboRefs } from '@/lib/quickbooks-push'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function PATCH(
  request: Request,
  { params }: { params: { id: string; invoiceId: string } },
) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const {
    status, due_date, description, invoice_number, amount, client_paid, escrow_paid,
    markup_pct, markup_excluded, markup_note, line_items, subtotal, tax, retainage,
    allocations,
  } = body

  // Fetch existing invoice
  const { data: invoice, error: fetchError } = await db
    .from('invoices')
    .select('*')
    .eq('id', params.invoiceId)
    .single()

  if (fetchError || !invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  // Build update payload from allowed fields
  const updates: Record<string, unknown> = {}
  if (status !== undefined) updates.status = status
  if (due_date !== undefined) updates.due_date = due_date
  if (description !== undefined) updates.description = description
  if (invoice_number !== undefined) updates.invoice_number = invoice_number
  if (amount !== undefined) updates.amount = amount
  if (client_paid !== undefined) updates.client_paid = Number(client_paid) || 0
  if (escrow_paid !== undefined) updates.escrow_paid = Number(escrow_paid) || 0
  // Cost-plus markup on this one item. null is meaningful and different from 0:
  // it means "follow the project rate", so the item keeps tracking a later
  // change to it, where 0 would freeze it at no markup.
  if (markup_pct !== undefined) {
    updates.markup_pct = markup_pct === '' || markup_pct === null ? null : Number(markup_pct)
  }
  if (markup_excluded !== undefined) updates.markup_excluded = !!markup_excluded
  if (markup_note !== undefined) updates.markup_note = markup_note || null
  if (line_items !== undefined) updates.line_items = Array.isArray(line_items) ? line_items : []
  if (subtotal !== undefined) updates.subtotal = subtotal === '' ? null : subtotal
  if (tax !== undefined) updates.tax = tax === '' ? null : tax
  if (retainage !== undefined) updates.retainage = retainage === '' ? null : retainage

  // Splitting this bill across budget lines. Replace-in-full rather than
  // patch-by-row: the editor sends the whole set, so a row deleted there has to
  // disappear here, and reconciling row-by-row would leave orphans behind.
  //
  // Validated server-side as well as in the form - over-allocating is the one
  // mistake that would quietly overstate what has landed on the budget.
  let allocationRows: { budget_line_item_id: string; amount: number; note: string | null }[] | null = null
  if (allocations !== undefined) {
    const rows = (Array.isArray(allocations) ? allocations : [])
      .filter((a: any) => a?.budget_line_item_id)
      .map((a: any) => ({
        budget_line_item_id: String(a.budget_line_item_id),
        amount: Number(a.amount) || 0,
        note: a.note ? String(a.note) : null,
      }))
    const nextAmount = amount !== undefined && amount !== '' ? Number(amount) : Number(invoice.amount ?? 0)
    const problems = validateAllocations(nextAmount, rows)
    if (problems.length) {
      return NextResponse.json({ error: problems.map(p => p.message).join(' ') }, { status: 400 })
    }
    allocationRows = rows
  }

  if (status === 'approved') {
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
    updates.approved_at = new Date().toISOString()
    updates.approved_by_name = (profile as any)?.full_name ?? null

    await logActivity(db, params.id, (profile as any)?.full_name ?? 'GC', 'invoice_approved', `Invoice ${invoice.invoice_number} approved - $${Number(invoice.amount).toLocaleString()}`)

    // Notify sub company
    if (invoice.company_id) {
      const { data: subProfiles } = await db
        .from('profiles')
        .select('id')
        .eq('company_id', invoice.company_id)
      if (subProfiles?.length) {
        await notify({
          db,
          userIds: subProfiles.map(p => p.id),
          type: 'invoice_approved',
          title: `Invoice Approved`,
          message: `Invoice ${invoice.invoice_number} has been approved - $${Number(invoice.amount).toLocaleString()}`,
          link: `/projects/${params.id}/invoices`,
        })
      }
    }
  } else if (status === 'sent') {
    updates.sent_at = new Date().toISOString()

    const { data: gcProfile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
    // This is a bill the sub sent US - "sent" here means released to be paid,
    // not sent to them. The old wording described the flow backwards.
    await logActivity(db, params.id, (gcProfile as any)?.full_name ?? 'GC', 'invoice_sent', `Invoice ${invoice.invoice_number} released for payment - $${Number(invoice.amount).toLocaleString()}`)

    // Tell the sub their invoice cleared - which is the news they want.
    if (invoice.company_id) {
      const { data: subProfiles } = await db
        .from('profiles')
        .select('id')
        .eq('company_id', invoice.company_id)
      if (subProfiles?.length) {
        await notify({
          db,
          userIds: subProfiles.map(p => p.id),
          type: 'invoice_sent',
          title: `Invoice released for payment`,
          message: `Invoice ${invoice.invoice_number} - $${Number(invoice.amount).toLocaleString()} has been approved and released for payment.`,
          link: `/projects/${params.id}/invoices`,
        })
      }
    }
  } else if (status === 'paid') {
    const { data: paidProfile } = await db.from('profiles').select('full_name').eq('id', user.id).single()
    await logActivity(db, params.id, (paidProfile as any)?.full_name ?? 'GC', 'invoice_paid', `Invoice ${invoice.invoice_number} marked as paid - $${Number(invoice.amount).toLocaleString()}`)

    // Notify sub company
    if (invoice.company_id) {
      const { data: subProfiles } = await db
        .from('profiles')
        .select('id')
        .eq('company_id', invoice.company_id)
      if (subProfiles?.length) {
        await notify({
          db,
          userIds: subProfiles.map(p => p.id),
          type: 'invoice_paid',
          title: `Invoice Paid`,
          message: `Invoice ${invoice.invoice_number} has been marked as paid - $${Number(invoice.amount).toLocaleString()}`,
          link: `/projects/${params.id}/invoices`,
        })
      }
    }

    // Mark related payment schedule item as paid
    if (invoice.payment_schedule_item_id) {
      await db
        .from('payment_schedule_items')
        .update({ status: 'paid' })
        .eq('id', invoice.payment_schedule_item_id)
    }
  }

  const { data, error } = await db
    .from('invoices')
    .update(updates)
    .eq('id', params.invoiceId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // After the invoice itself saves, so a rejected update never leaves the split
  // pointing at an amount that was not written.
  if (allocationRows) {
    await db.from('invoice_allocations').delete().eq('invoice_id', params.invoiceId)
    if (allocationRows.length) {
      const { error: allocError } = await db.from('invoice_allocations')
        .insert(allocationRows.map(r => ({ ...r, invoice_id: params.invoiceId })))
      if (allocError) return NextResponse.json({ error: allocError.message }, { status: 500 })
    }
  }

  const { data: saved } = await db.from('invoice_allocations')
    .select('id, budget_line_item_id, amount, note')
    .eq('invoice_id', params.invoiceId)

  // An approved (or paid) bill belongs in QuickBooks. Same contract as the
  // payment push: never throws, 8s cap, not-connected is normal, and a miss is
  // caught by the Settings backlog sync. Runs AFTER the update is written so
  // the pusher reads the new status, and its result never gates the response.
  if (status === 'approved' || status === 'paid') {
    await pushBill(db, params.invoiceId)
  }
  // ...and paying it settles that Bill. Two records, in order: without the
  // second, the payable sat open in QuickBooks after the cash had gone out.
  // pushBill runs first so a bill approved and paid in one go has something
  // for the payment to link to.
  if (status === 'paid') {
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
  const amountChanged = amount !== undefined && amount !== '' && Number(amount) !== Number(invoice.amount ?? 0)
  if (amountChanged && invoice.qbo_id) {
    const res = await updateBillInQbo(db, params.invoiceId)
    quickbooks = res.pushed
      ? { updated: true }
      : { updated: false, detail: res.reason === 'not_connected' ? undefined : res.detail }
  }

  return NextResponse.json({ invoice: data, allocations: saved ?? [], quickbooks })
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string; invoiceId: string } },
) {
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
