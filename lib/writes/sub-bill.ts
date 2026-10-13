import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { audienceFor } from '@/lib/notification-audience'
import { notify } from '@/lib/notify'
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
