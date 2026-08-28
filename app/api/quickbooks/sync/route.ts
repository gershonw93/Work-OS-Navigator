import { NextResponse } from 'next/server'
import { admin, getValidConnection, qboFetch } from '@/lib/quickbooks'
import { pushBill, pushBillPayment, pushClientInvoice, pushPaymentForProject, refreshBillInQbo, refreshPaymentInQbo, type PushContext } from '@/lib/quickbooks-push'

export const runtime = 'nodejs'
export const maxDuration = 60

// Push SyteNav records into QuickBooks Online.
//   customers -> Customer, vendors (subs) -> Vendor,
//   bills (sub invoices) -> Bill, payments (client payments) -> SalesReceipt.
// Bills/payments auto-create the referenced vendor/customer if it isn't in QBO
// yet. Body: { entity, ids? } (ids omitted = everything not yet synced).
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).single()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company' }, { status: 400 })
  if (!['admin', 'manager'].includes(profile.role)) {
    return NextResponse.json({ error: 'Only an admin can sync QuickBooks.' }, { status: 403 })
  }

  const conn = await getValidConnection(db, profile.company_id)
  if (!conn) return NextResponse.json({ error: 'QuickBooks is not connected (or the connection expired - reconnect).' }, { status: 409 })

  const body = await request.json().catch(() => ({}))
  const entity: string = body.entity
  const ids: string[] | undefined = Array.isArray(body.ids) ? body.ids : undefined

  const results: { id: string; name: string; status: 'success' | 'skipped' | 'error'; qbo_id?: string; message?: string }[] = []

  async function logRow(entity_type: string, entity_id: string, action: string, status: string, qbo_id?: string, message?: string) {
    await db.from('quickbooks_sync_log').insert({
      company_id: profile!.company_id, entity_type, entity_id, action, status, qbo_id, message,
    })
  }

  // Project ids owned by this company (GC or standalone), for scoping bills/payments.
  async function ownedProjectIds(): Promise<string[]> {
    const { data: projects } = await db.from('projects').select('id, customer_id')
      .or(`gc_company_id.eq.${profile!.company_id},created_by_company_id.eq.${profile!.company_id}`)
    return (projects ?? []).map((p: any) => p.id)
  }

  if (entity === 'customers') {
    let q = db.from('customers').select('*').eq('gc_company_id', profile.company_id)
    if (ids) q = q.in('id', ids)
    const { data: rows } = await q
    for (const c of rows ?? []) {
      if (c.qbo_id) { results.push({ id: c.id, name: c.name, status: 'skipped', qbo_id: c.qbo_id, message: 'Already synced' }); continue }
      try {
        const payload: any = { DisplayName: c.name }
        if (c.contact_name) payload.CompanyName = c.name
        if (c.email) payload.PrimaryEmailAddr = { Address: c.email }
        if (c.phone) payload.PrimaryPhone = { FreeFormNumber: c.phone }
        if (c.billing_address) payload.BillAddr = { Line1: c.billing_address }
        const res = await qboFetch(conn, 'customer', { method: 'POST', body: JSON.stringify(payload) })
        const qboId = res?.Customer?.Id
        await db.from('customers').update({ qbo_id: qboId, qbo_synced_at: new Date().toISOString() }).eq('id', c.id)
        await logRow('customer', c.id, 'create', 'success', qboId)
        results.push({ id: c.id, name: c.name, status: 'success', qbo_id: qboId })
      } catch (err: any) {
        await logRow('customer', c.id, 'create', 'error', undefined, err.message)
        results.push({ id: c.id, name: c.name, status: 'error', message: err.message })
      }
    }
  } else if (entity === 'vendors') {
    // Vendors = subcontractor/supplier companies this GC works with, gathered
    // from subcontracts on the GC's projects.
    const { data: projects } = await db.from('projects').select('id')
      .or(`gc_company_id.eq.${profile.company_id},created_by_company_id.eq.${profile.company_id}`)
    const projectIds = (projects ?? []).map((p: any) => p.id)
    let vendorIds: string[] = []
    if (projectIds.length) {
      const { data: subs } = await db.from('subcontracts').select('company_id').in('project_id', projectIds)
      vendorIds = Array.from(new Set((subs ?? []).map((s: any) => s.company_id).filter(Boolean)))
    }
    if (ids) vendorIds = vendorIds.filter(v => ids.includes(v))
    // Never map our own company as a vendor.
    vendorIds = vendorIds.filter(v => v !== profile.company_id)

    const { data: companies } = vendorIds.length
      ? await db.from('companies').select('id, name, contact_name, contact_email, phone, address, qbo_vendor_id').in('id', vendorIds)
      : { data: [] as any[] }

    for (const co of companies ?? []) {
      if (co.qbo_vendor_id) { results.push({ id: co.id, name: co.name, status: 'skipped', qbo_id: co.qbo_vendor_id, message: 'Already synced' }); continue }
      try {
        const payload: any = { DisplayName: co.name }
        if (co.contact_email) payload.PrimaryEmailAddr = { Address: co.contact_email }
        if (co.phone) payload.PrimaryPhone = { FreeFormNumber: co.phone }
        if (co.address) payload.BillAddr = { Line1: co.address }
        const res = await qboFetch(conn, 'vendor', { method: 'POST', body: JSON.stringify(payload) })
        const qboId = res?.Vendor?.Id
        await db.from('companies').update({ qbo_vendor_id: qboId, qbo_vendor_synced_at: new Date().toISOString() }).eq('id', co.id)
        await logRow('vendor', co.id, 'create', 'success', qboId)
        results.push({ id: co.id, name: co.name, status: 'success', qbo_id: qboId })
      } catch (err: any) {
        await logRow('vendor', co.id, 'create', 'error', undefined, err.message)
        results.push({ id: co.id, name: co.name, status: 'error', message: err.message })
      }
    }
  } else if (entity === 'bills') {
    // Sub invoices (what the GC owes a sub) -> QBO Bill. Delegates to the same
    // pusher the auto-push uses, so the button and the auto-push cannot drift.
    // Only approved/paid invoices; the pusher enforces that too.
    const projectIds = await ownedProjectIds()
    if (!projectIds.length) return NextResponse.json({ summary: { total: 0, synced: 0, skipped: 0, errors: 0 }, results: [] })

    let q = db.from('invoices').select('id, qbo_id, status')
      .in('project_id', projectIds)
      .in('status', ['approved', 'paid'])
    if (ids) q = q.in('id', ids)
    const { data: invoices } = await q

    const ctx: PushContext = { conn }
    for (const inv of invoices ?? []) {
      const label = `Bill ${inv.id.slice(0, 8)}`
      if (inv.qbo_id) { results.push({ id: inv.id, name: label, status: 'skipped', qbo_id: inv.qbo_id, message: 'Already synced' }); continue }
      const r = await pushBill(db, inv.id, ctx)
      if (r.pushed) results.push({ id: inv.id, name: label, status: 'success', qbo_id: r.qboId })
      else if (r.reason === 'already') results.push({ id: inv.id, name: label, status: 'skipped', message: 'Already synced' })
      else results.push({ id: inv.id, name: label, status: 'error', message: r.detail ?? r.reason })
    }
  } else if (entity === 'bill-payments') {
    // Bills you have PAID -> a QBO BillPayment against each Bill. Without this
    // the payable stays open in QuickBooks after the money has gone out.
    const projectIds = await ownedProjectIds()
    if (!projectIds.length) return NextResponse.json({ summary: { total: 0, synced: 0, skipped: 0, errors: 0 }, results: [] })

    let q = db.from('invoices').select('id, invoice_number, qbo_id, qbo_payment_id')
      .in('project_id', projectIds)
      .eq('status', 'paid')
      .not('qbo_id', 'is', null)
    if (ids) q = q.in('id', ids)
    const { data: paidBills, error: paidErr } = await q

    // Migration 089 has not landed here yet: say so plainly rather than
    // reporting every bill as an error.
    if (paidErr && (paidErr as any).code === '42703') {
      return NextResponse.json({
        summary: { total: 0, synced: 0, skipped: 0, errors: 0 },
        results: [{ id: 'setup', name: 'Bill payments', status: 'skipped', message: 'Not set up on this database yet' }],
      })
    }

    const ctx: PushContext = { conn }
    for (const b of paidBills ?? []) {
      const label = `Payment for bill ${b.invoice_number ?? b.id.slice(0, 8)}`
      if (b.qbo_payment_id) { results.push({ id: b.id, name: label, status: 'skipped', qbo_id: b.qbo_payment_id, message: 'Already synced' }); continue }
      const r = await pushBillPayment(db, b.id, ctx)
      if (r.pushed) results.push({ id: b.id, name: label, status: 'success', qbo_id: r.qboId })
      else if (r.reason === 'already') results.push({ id: b.id, name: label, status: 'skipped', message: 'Already synced' })
      else results.push({ id: b.id, name: label, status: 'error', message: r.detail ?? r.reason })
    }
  } else if (entity === 'payments') {
    // Client payments received -> applied against the invoice they settle, or
    // a Sales Receipt when they settle nothing. Via pushPaymentForProject, NOT
    // pushClientPayment: this branch used to call the Sales Receipt pusher
    // directly, so pressing Sync now on a payment that settled an invoice
    // already in QuickBooks booked the same sale a second time.
    const projectIds = await ownedProjectIds()
    if (!projectIds.length) return NextResponse.json({ summary: { total: 0, synced: 0, skipped: 0, errors: 0 }, results: [] })

    // Hand-entered payments are excluded, not just skipped by the pusher:
    // otherwise every backlog run walks them again and reports them as work.
    let q = db.from('client_payments').select('id, qbo_id')
      .in('project_id', projectIds)
      .or('qb_entered.is.null,qb_entered.eq.false')
    if (ids) q = q.in('id', ids)
    const { data: payments } = await q

    const ctx: PushContext = { conn }
    for (const p of payments ?? []) {
      const label = `Payment ${p.id.slice(0, 8)}`
      if (p.qbo_id) { results.push({ id: p.id, name: label, status: 'skipped', qbo_id: p.qbo_id, message: 'Already synced' }); continue }
      const r = await pushPaymentForProject(db, p.id, ctx)
      if (r.pushed) results.push({ id: p.id, name: label, status: 'success', qbo_id: r.qboId })
      else if (r.reason === 'already') results.push({ id: p.id, name: label, status: 'skipped', message: 'Already synced' })
      else results.push({ id: p.id, name: label, status: 'error', message: r.detail ?? r.reason })
    }
  } else if (entity === 'client-invoices') {
    // Invoices you sent your client -> QBO Invoice (money owed to you).
    // Drafts are excluded by the pusher: nobody has been asked for that money.
    const projectIds = await ownedProjectIds()
    if (!projectIds.length) return NextResponse.json({ summary: { total: 0, synced: 0, skipped: 0, errors: 0 }, results: [] })

    let q = db.from('client_invoices').select('id, invoice_number, qbo_id')
      .in('project_id', projectIds)
      .in('status', ['sent', 'paid'])
    if (ids) q = q.in('id', ids)
    const { data: bills } = await q

    const ctx: PushContext = { conn }
    for (const b of bills ?? []) {
      const label = `Invoice ${b.invoice_number ?? b.id.slice(0, 8)}`
      if (b.qbo_id) { results.push({ id: b.id, name: label, status: 'skipped', qbo_id: b.qbo_id, message: 'Already synced' }); continue }
      const r = await pushClientInvoice(db, b.id, ctx)
      if (r.pushed) results.push({ id: b.id, name: label, status: 'success', qbo_id: r.qboId })
      else if (r.reason === 'already') results.push({ id: b.id, name: label, status: 'skipped', message: 'Already synced' })
      else results.push({ id: b.id, name: label, status: 'error', message: r.detail ?? r.reason })
    }
  } else if (entity === 'refresh') {
    // Rewrite memo/reference formatting on records ALREADY in QuickBooks -
    // updates in place, never a duplicate. Chunked: each record costs two QBO
    // round trips (fetch for the SyncToken, then update), and this route has a
    // 60s ceiling, so we do 25 per call and report what remains. The card
    // keeps calling until remaining is 0.
    const CHUNK = 25
    const projectIds = await ownedProjectIds()
    if (!projectIds.length) return NextResponse.json({ summary: { total: 0, synced: 0, skipped: 0, errors: 0 }, remaining: 0, results: [] })

    const [{ data: pays }, { data: bills }] = await Promise.all([
      db.from('client_payments').select('id, qbo_synced_at').in('project_id', projectIds).not('qbo_id', 'is', null),
      db.from('invoices').select('id, qbo_synced_at').in('project_id', projectIds).not('qbo_id', 'is', null),
    ])
    // Oldest sync stamps first, so re-pressing after a partial run continues
    // where it stopped instead of redoing the same 25 forever.
    const queue = [
      ...(pays ?? []).map((r: any) => ({ kind: 'payment' as const, id: r.id, at: r.qbo_synced_at ?? '' })),
      ...(bills ?? []).map((r: any) => ({ kind: 'bill' as const, id: r.id, at: r.qbo_synced_at ?? '' })),
    ].sort((a, b) => a.at.localeCompare(b.at))

    const batch = queue.slice(0, CHUNK)
    const ctx: PushContext = { conn }
    for (const item of batch) {
      const r = item.kind === 'payment'
        ? await refreshPaymentInQbo(db, item.id, ctx)
        : await refreshBillInQbo(db, item.id, ctx)
      const label = `${item.kind === 'payment' ? 'Payment' : 'Bill'} ${item.id.slice(0, 8)}`
      if (r.pushed) results.push({ id: item.id, name: label, status: 'success', qbo_id: r.qboId })
      else results.push({ id: item.id, name: label, status: 'error', message: r.detail ?? r.reason })
    }

    const summary = {
      total: results.length,
      synced: results.filter(r => r.status === 'success').length,
      skipped: 0,
      errors: results.filter(r => r.status === 'error').length,
    }
    return NextResponse.json({ summary, remaining: queue.length - batch.length, results })
  } else {
    return NextResponse.json({ error: `Unsupported entity "${entity}".` }, { status: 400 })
  }

  const summary = {
    total: results.length,
    synced: results.filter(r => r.status === 'success').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
  }
  return NextResponse.json({ summary, results })
}
