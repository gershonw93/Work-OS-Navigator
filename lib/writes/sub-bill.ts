import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { audienceFor } from '@/lib/notification-audience'
import { notify } from '@/lib/notify'
import { validateAllocations } from '@/lib/allocations'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Entering a bill from a sub or vendor - the ONE home for it.
//
// Moved out of `POST /api/projects/[id]/invoices` unchanged. The route still
// decides WHO may bill and in whose name (the office, or a sub against its own
// subcontract); this is everything after: the number, the insert, the activity
// line and telling the people who approve bills.
//
// A BILL IS BORN `pending_approval`, AND THAT IS WHAT MAKES IT SAFE FOR CLAUDE
// TO ENTER ONE. Nothing reaches QuickBooks until a person approves it in
// SyteNav - the push runs on approval, not here - so a bill Claude read out of
// an email is a draft for somebody to check, never a booked expense.
// ─────────────────────────────────────────────────────────────────────────────

export interface SubBillFields {
  subcontract_id?: string | null
  payment_schedule_item_id?: string | null
  amount: unknown
  description?: string | null
  due_date?: string | null
  client_paid?: unknown
  escrow_paid?: unknown
  document_url?: string | null
  document_name?: string | null
  line_items?: unknown
  subtotal?: unknown
  tax?: unknown
  retainage?: unknown
  quote_check?: unknown
}

export async function createSubBill(
  db: SupabaseClient,
  { userId, projectId, fields, company_id, company_name, via }: {
    userId: string; projectId: string; fields: SubBillFields
    company_id: string | null; company_name: string | null; via?: string
  },
): Promise<WriteResult> {
  const user = { id: userId }
  const {
    subcontract_id, payment_schedule_item_id, amount,
    description, due_date, client_paid, escrow_paid, document_url, document_name,
    line_items, subtotal, tax, retainage, quote_check,
  } = fields

  // Count existing invoices for this project to generate invoice number
  const { count } = await db
    .from('invoices')
    .select('*', { count: 'exact', head: true })
    .eq('project_id', projectId)

  const invoice_number = `INV-${projectId.slice(0, 4).toUpperCase()}-${String((count ?? 0) + 1).padStart(3, '0')}`

  let { data, error } = await db
    .from('invoices')
    .insert({
      project_id: projectId,
      subcontract_id: subcontract_id || null,
      payment_schedule_item_id: payment_schedule_item_id || null,
      company_id: company_id || null,
      company_name: company_name || null,
      amount,
      description: description || null,
      due_date: due_date || null,
      client_paid: Number(client_paid) || 0,
      escrow_paid: Number(escrow_paid) || 0,
      invoice_number,
      status: 'pending_approval',
      // A scanned invoice arrives with its document already stored - attach it
      // here rather than making the user upload the same file a second time.
      ...(document_url ? { document_url, document_name: document_name || null } : {}),
      // The breakdown, kept. Every invoice should be able to say what it is
      // charging for without reopening the PDF.
      line_items: Array.isArray(line_items) ? line_items : [],
      subtotal: subtotal ?? null,
      tax: tax ?? null,
      retainage: retainage ?? null,
      quote_check: quote_check ?? null,
    })
    .select()
    .single()

  // Pre-migration fallback: the breakdown columns may not exist yet.
  if (error && (error as any).code === '42703') {
    const retry = await db.from('invoices').insert({
      project_id: projectId,
      subcontract_id: subcontract_id || null,
      payment_schedule_item_id: payment_schedule_item_id || null,
      company_id: company_id || null,
      company_name: company_name || null,
      amount,
      description: description || null,
      due_date: due_date || null,
      client_paid: Number(client_paid) || 0,
      escrow_paid: Number(escrow_paid) || 0,
      invoice_number,
      status: 'pending_approval',
      ...(document_url ? { document_url, document_name: document_name || null } : {}),
    }).select().single()
    data = retry.data as any
    error = retry.error as any
  }

  if (error) return { status: 500, body: { error: error.message } }

  const { data: creator } = await db.from('profiles').select('full_name').eq('id', user.id).single()
  const creatorName = withVia((creator as any)?.full_name ?? 'GC', via)
  await logActivity(db, projectId, creatorName, 'invoice_created', `Invoice ${invoice_number} created for ${company_name} - $${Number(amount).toLocaleString()}`)

  // A bill needs approving, so tell the people who can approve it.
  //
  // This used to notify `[user.id]` - whoever had just created the invoice. A
  // subcontractor submitting their own bill from /my-jobs was therefore told
  // to approve it themselves, and the GC was told nothing at all: the bill sat
  // pending until somebody happened to open the tab.
  //
  // Not "everyone at the GC" either. A labourer has invoices: N and cannot
  // open the page this links to, and a notification you cannot act on is how
  // people learn to ignore notifications.
  const { data: project } = await db.from('projects')
    .select('gc_company_id, created_by_company_id, name').eq('id', projectId).maybeSingle()
  const owner = (project as any)?.gc_company_id ?? (project as any)?.created_by_company_id ?? null
  // Whoever can approve a bill, unless the company named somebody else in
  // Settings -> Notifications -> Who gets told. `audienceFor` falls back to
  // exactly this permission when nothing is configured, so the behaviour here
  // is unchanged until an admin decides otherwise.
  const approvers = await audienceFor({
    db, companyId: owner, type: 'invoice_pending', exclude: user.id,
  })

  if (approvers.length) {
    await notify({
      db, userIds: approvers, type: 'invoice_pending', title: 'Bill waiting for approval',
      // Who and how much, because that is what decides whether you open it now.
      message: `${company_name || creatorName} submitted ${invoice_number} for $${Number(amount || 0).toLocaleString()}${(project as any)?.name ? ` on ${(project as any).name}` : ''}`,
      link: `/projects/${projectId}/invoices`,
    })
  }

  return { status: 200, body: { invoice: data } }
}

// ─────────────────────────────────────────────────────────────────────────────
// Changing a bill - moved out of `PATCH /api/projects/[id]/invoices/[invoiceId]`
// unchanged: the status moves and who is told, the derived `paid_at`, the
// split across budget lines (validated against the amount), and the
// QuickBooks pushes that follow an approval, a payment or a corrected amount.
//
// Two things added on the way, both narrowing:
//   - THE BILL MUST BE ON THE JOB IN THE URL. It was read and written by id
//     alone, so a request naming a job you could edit reached any bill.
//   - VIA CLAUDE, ONLY A BILL STILL `pending_approval`, AND NEVER ITS STATUS.
//     Approval is the moment it goes to QuickBooks - a person stays in front
//     of that. The app never passes `via`.
// ─────────────────────────────────────────────────────────────────────────────

/** What the route must tell QuickBooks after a bill edit saved. */
export interface SubBillQboFollowUp {
  pushBill: boolean
  pushPayment: boolean
  correctAmount: boolean
}

export async function updateSubBill(
  db: SupabaseClient,
  { userId, projectId, invoiceId, body, via }: {
    userId: string; projectId: string; invoiceId: string; body: any; via?: string
  },
): Promise<WriteResult & { qbo?: SubBillQboFollowUp }> {
  const {
    status, due_date, description, invoice_number, amount, client_paid, escrow_paid,
    markup_pct, markup_excluded, markup_note, line_items, subtotal, tax, retainage,
    allocations,
  } = body

  // Fetch existing invoice
  const { data: invoice, error: fetchError } = await db
    .from('invoices')
    .select('*')
    .eq('id', invoiceId)
    .eq('project_id', projectId)
    .maybeSingle()

  if (fetchError || !invoice) return { status: 404, body: { error: 'Invoice not found' } }

  // Via Claude: fields on a bill still waiting for approval, and nothing else.
  // Approving is what pushes to QuickBooks and tells the sub; paying is money.
  if (via) {
    if (invoice.status !== 'pending_approval') {
      return { status: 400, body: { error: 'Only a bill still waiting for approval can be changed through Claude. Change this one in SyteNav.' } }
    }
    if (status !== undefined) {
      return { status: 400, body: { error: 'Approving, releasing or paying a bill is done by a person in SyteNav.' } }
    }
    // Already in QuickBooks (approved once, then moved back): a correction has
    // to go through the push the route makes, which Claude's path does not.
    if (invoice.qbo_id) {
      return { status: 400, body: { error: 'This bill is already in QuickBooks, so change it in SyteNav where the correction is pushed there too.' } }
    }
  }

  // Build update payload from allowed fields
  const updates: Record<string, unknown> = {}
  if (status !== undefined) updates.status = status
  // WHEN IT WAS PAID IS DERIVED FROM THE MOVE, never taken from the body.
  // `paid_at` existed from the first migration and nothing wrote it, so every
  // reader of "paid when" fell back to a guess - the dashboard asked for an
  // `updated_at` this table has never had, and its cash-out chart read zero.
  // A re-press of Paid keeps the first date; leaving Paid clears it.
  if (status === 'paid' && invoice.status !== 'paid') updates.paid_at = new Date().toISOString()
  else if (status !== undefined && status !== 'paid') updates.paid_at = null
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
      return { status: 400, body: { error: problems.map(p => p.message).join(' ') } }
    }
    allocationRows = rows
  }

  if (status === 'approved') {
    const { data: profile } = await db.from('profiles').select('full_name').eq('id', userId).single()
    updates.approved_at = new Date().toISOString()
    updates.approved_by_name = (profile as any)?.full_name ?? null

    await logActivity(db, projectId, (profile as any)?.full_name ?? 'GC', 'invoice_approved', `Invoice ${invoice.invoice_number} approved - $${Number(invoice.amount).toLocaleString()}`)

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
          link: `/projects/${projectId}/invoices`,
        })
      }
    }
  } else if (status === 'sent') {
    updates.sent_at = new Date().toISOString()

    const { data: gcProfile } = await db.from('profiles').select('full_name').eq('id', userId).single()
    // This is a bill the sub sent US - "sent" here means released to be paid,
    // not sent to them. The old wording described the flow backwards.
    await logActivity(db, projectId, (gcProfile as any)?.full_name ?? 'GC', 'invoice_sent', `Invoice ${invoice.invoice_number} released for payment - $${Number(invoice.amount).toLocaleString()}`)

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
          link: `/projects/${projectId}/invoices`,
        })
      }
    }
  } else if (status === 'paid') {
    const { data: paidProfile } = await db.from('profiles').select('full_name').eq('id', userId).single()
    await logActivity(db, projectId, (paidProfile as any)?.full_name ?? 'GC', 'invoice_paid', `Invoice ${invoice.invoice_number} marked as paid - $${Number(invoice.amount).toLocaleString()}`)

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
          link: `/projects/${projectId}/invoices`,
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
    .eq('id', invoiceId)
    .eq('project_id', projectId)
    .select()
    .single()

  if (error) return { status: 500, body: { error: error.message } }

  // After the invoice itself saves, so a rejected update never leaves the split
  // pointing at an amount that was not written.
  if (allocationRows) {
    await db.from('invoice_allocations').delete().eq('invoice_id', invoiceId)
    if (allocationRows.length) {
      const { error: allocError } = await db.from('invoice_allocations')
        .insert(allocationRows.map(r => ({ ...r, invoice_id: invoiceId })))
      if (allocError) return { status: 500, body: { error: allocError.message } }
    }
  }

  const { data: saved } = await db.from('invoice_allocations')
    .select('id, budget_line_item_id, amount, note')
    .eq('invoice_id', invoiceId)

  // WHAT QUICKBOOKS NEEDS TO HEAR is decided here and SAID by the route: the
  // pushes stay in `app/api/projects/[id]/invoices/[invoiceId]/route.ts`, so
  // nothing under lib/writes ever reaches QuickBooks (pinned in mcp-write.ts).
  const amountChanged = amount !== undefined && amount !== '' && Number(amount) !== Number(invoice.amount ?? 0)
  const qbo: SubBillQboFollowUp = {
    pushBill: status === 'approved' || status === 'paid',
    pushPayment: status === 'paid',
    correctAmount: amountChanged && !!invoice.qbo_id,
  }

  return { status: 200, body: { invoice: data, allocations: saved ?? [] }, qbo }
}
