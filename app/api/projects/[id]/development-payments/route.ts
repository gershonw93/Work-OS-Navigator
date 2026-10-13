import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'
import { issuedInvoices, syncInvoiceStatus } from '@/lib/invoice-settlement-db'
import { dollars, type OpenInvoice } from '@/lib/invoice-settlement'
import { splitProblem, shareRows, groupMemo, type HouseShareInput } from '@/lib/development-payment'
import { pushPaymentGroup } from '@/lib/quickbooks-push'
import { logActivity } from '@/lib/log-activity'

export const runtime = 'nodejs'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Db = ReturnType<typeof admin>

/** The development's houses and what each one's issued invoices still owe. Null when a read failed. */
async function housesAndInvoices(db: Db, developmentId: string) {
  const { data: houses, error } = await db.from('projects').select('id, name, lot')
    .eq('parent_project_id', developmentId).order('name')
  if (error) { console.error('[development-payments] houses', error.message); return null }
  const byHouse = new Map<string, OpenInvoice[]>()
  const lists = await Promise.all((houses ?? []).map(h => issuedInvoices(db, h.id)))
  for (let i = 0; i < lists.length; i++) {
    if (!lists[i]) return null
    byHouse.set((houses ?? [])[i].id, lists[i]!)
  }
  return { houses: (houses ?? []) as { id: string; name: string; lot: string | null }[], byHouse }
}

/** The houses with their open invoices, and the cheques already split here. */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'payments', 'view')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const got = await housesAndInvoices(db, params.id)
  if (!got) return NextResponse.json({ error: 'Could not read the houses and their invoices. Try again in a moment.' }, { status: 503 })
  const { data: groups, error } = await db.from('client_payment_groups')
    .select('id, amount, paid_date, method, reference, memo, qbo_id, created_at, client_payments(project_id, amount)')
    .eq('development_id', params.id).order('paid_date', { ascending: false })
  if (error) { console.error('[development-payments] groups', error.message); return NextResponse.json({ error: 'Could not read the payments.' }, { status: 503 }) }

  const name = new Map(got.houses.map(h => [h.id, h.name]))
  return NextResponse.json({
    houses: got.houses.map(h => ({
      id: h.id, name: h.name, lot: h.lot,
      invoices: (got.byHouse.get(h.id) ?? []).filter(i => i.status === 'sent' && i.balanceCents > 0)
        .map(i => ({ id: i.id, invoice_number: i.invoice_number, balance: dollars(i.balanceCents) })),
    })),
    groups: (groups ?? []).map((g: any) => ({
      id: g.id, amount: g.amount, paid_date: g.paid_date, method: g.method, reference: g.reference, memo: g.memo,
      in_quickbooks: !!g.qbo_id,
      houses: Array.from(new Set((g.client_payments ?? []).map((r: any) => name.get(r.project_id) ?? 'A house'))),
    })),
  })
}

/** Record one cheque split across houses. */
export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'payments', 'edit')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject<{ id: string; name: string | null }>(db, gate.actor, params.id, 'id, name')
  if ('denied' in owned) return owned.denied

  const body = await request.json().catch(() => ({}))
  const shares: HouseShareInput[] = Array.isArray(body?.shares) ? body.shares.map((s: any) => ({
    project_id: String(s?.project_id ?? ''),
    invoices: Array.isArray(s?.invoices) ? s.invoices.map((a: any) => ({ client_invoice_id: String(a?.client_invoice_id ?? ''), amount: a?.amount })) : [],
    other: s?.other,
  })) : []

  // The form's own question, asked again: a second tab does not run the form,
  // and a balance read here is the one that counts.
  const got = await housesAndInvoices(db, params.id)
  if (!got) return NextResponse.json({ error: 'Could not read the houses and their invoices, so nothing was saved. Try again.' }, { status: 503 })
  const name = new Map(got.houses.map(h => [h.id, h.name]))
  const problem = splitProblem(body?.amount, shares, got.byHouse, id => name.get(id) ?? 'A house')
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  if (!body?.paid_date) return NextResponse.json({ error: 'Enter the date the check was received.' }, { status: 400 })

  const rows = shareRows(shares)
  const houses = new Set(rows.map(r => r.project_id)).size
  const { data: group, error: gErr } = await db.from('client_payment_groups').insert({
    development_id: params.id,
    amount: Number(body.amount),
    paid_date: body.paid_date,
    method: body.method || null,
    reference: body.reference || null,
    memo: body.memo || null,
    created_by: gate.actor.userId,
  }).select('id').single()
  if (gErr || !group) {
    console.error('[development-payments] group insert', gErr?.message)
    return NextResponse.json({ error: 'Could not save the payment. Nothing was recorded.' }, { status: 500 })
  }

  // Every share, then every split. Any failure takes the whole cheque back
  // out: half a cheque recorded is a balance that is wrong on some houses and
  // right on others, with nothing on screen saying which.
  const undo = async (why: string) => {
    console.error('[development-payments]', why)
    await db.from('client_payment_groups').delete().eq('id', group.id)
    return NextResponse.json({ error: 'Could not record the payment on every house, so nothing was saved. Try again.' }, { status: 500 })
  }
  const memo = groupMemo({ amount: body.amount, reference: body.reference, houses }) + (body.memo ? ` - ${body.memo}` : '')
  // One at a time, so each share is paired with ITS invoices for certain -
  // nothing promises a bulk insert hands its rows back in the order sent.
  const allocs: { payment_id: string; client_invoice_id: string; amount: number }[] = []
  for (const r of rows) {
    const { data: made, error: rErr } = await db.from('client_payments').insert({
      project_id: r.project_id,
      payment_group_id: group.id,
      paid_date: body.paid_date,
      amount: dollars(r.amountCents),
      method: body.method || null,
      reference: body.reference || null,
      memo,
      retainer: false,
      qb_entered: false,
      on_account: false,
      created_by: gate.actor.userId,
    }).select('id').single()
    if (rErr || !made) return undo(`share insert: ${rErr?.message ?? 'no row'}`)
    for (const a of r.allocations) allocs.push({ payment_id: made.id, client_invoice_id: a.client_invoice_id, amount: dollars(a.amountCents) })
  }
  if (allocs.length) {
    const { error: aErr } = await db.from('client_payment_allocations').insert(allocs)
    if (aErr) return undo(`allocation insert: ${aErr.message}`)
    await syncInvoiceStatus(db, allocs.map(a => a.client_invoice_id))
  }

  const { data: me } = await db.from('profiles').select('full_name').eq('id', gate.actor.userId).maybeSingle()
  for (const r of rows) {
    await logActivity(db, r.project_id, (me as any)?.full_name || 'Someone', 'client_payment_received',
      `Client payment received - $${dollars(r.amountCents).toLocaleString()} (${memo})`,
      { payment_group_id: group.id, amount: dollars(r.amountCents) }, gate.actor.userId)
  }

  const qb = await pushPaymentGroup(db, group.id)
  return NextResponse.json({
    group_id: group.id, houses, rows: rows.length,
    quickbooks: qb.pushed ? 'pushed' : qb.reason, quickbooks_detail: qb.pushed ? null : (qb.detail ?? null),
  })
}
