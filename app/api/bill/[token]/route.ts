import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * The invoice as the client sees it. No account, no login.
 *
 * Only ever returns what belongs on a bill. `show_markup` is honoured HERE, on
 * the server: when it is off, the cost and markup columns are not sent at all
 * rather than being hidden by the page. A margin that is merely not rendered is
 * still in the response, and "view source" is not a hard thing to do.
 */
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  const db = admin()

  const { data: bill } = await db
    .from('client_invoices')
    .select('*, client_invoice_lines(*)')
    .eq('token', params.token)
    .maybeSingle()

  if (!bill) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  if (bill.status === 'void') {
    return NextResponse.json({ error: 'This invoice has been cancelled.' }, { status: 410 })
  }
  if (bill.status === 'draft') {
    return NextResponse.json({ error: 'This invoice has not been issued yet.' }, { status: 404 })
  }

  const { data: project } = await db
    .from('projects').select('name, address, client, gc_company_id')
    .eq('id', bill.project_id).maybeSingle()

  // The letterhead - who the client is paying. `contact_email` is the column;
  // there is no `companies.email`, and selecting one would quietly return null
  // for the whole row rather than erroring.
  const { data: company } = project?.gc_company_id
    ? await db.from('companies')
      .select('name, phone, contact_email, address')
      .eq('id', project.gc_company_id).maybeSingle()
    : { data: null }

  // "Did they even get it" is the question behind most chasing phone calls,
  // and "they opened it four times last Tuesday" is a different conversation
  // from "they have never opened it". Only the first open was being recorded,
  // so every invoice looked the same from the day it was read once.
  //
  // One statement in the database rather than read-add-write here: two opens
  // in the same instant both count.
  await db.rpc('bump_client_invoice_view', { p_id: bill.id })

  const show = !!bill.show_markup
  const lines = [...(bill.client_invoice_lines ?? [])]
    .sort((a: any, b: any) => a.sort_order - b.sort_order)
    .map((l: any) => ({
      id: l.id,
      description: l.description,
      amount: Number(l.amount ?? 0),
      // Only present when the invoice is open-book.
      ...(show ? { cost: Number(l.cost ?? 0), markup: Number(l.markup ?? 0), markup_pct: Number(l.markup_pct ?? 0) } : {}),
    }))

  const total = lines.reduce((s, l) => s + l.amount, 0)

  return NextResponse.json({
    invoice_number: bill.invoice_number,
    status: bill.status,
    issue_date: bill.issue_date,
    due_date: bill.due_date,
    show_markup: show,
    notes: bill.notes,
    terms: bill.terms,
    lines,
    total,
    ...(show
      ? {
        cost_total: lines.reduce((s, l: any) => s + (l.cost ?? 0), 0),
        markup_total: lines.reduce((s, l: any) => s + (l.markup ?? 0), 0),
      }
      : {}),
    project: { name: project?.name ?? null, address: (project as any)?.address ?? null, client: project?.client ?? null },
    from: company
      ? {
        name: company.name ?? null,
        phone: company.phone ?? null,
        email: (company as any).contact_email ?? null,
        address: company.address ?? null,
      }
      : null,
  })
}
