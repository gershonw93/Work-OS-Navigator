import { NextResponse } from 'next/server'
import { admin, getValidConnection, qboFetch } from '@/lib/quickbooks'
import { pushBill, pushClientPayment, type PushContext } from '@/lib/quickbooks-push'

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
  } else if (entity === 'payments') {
    // Client payments received -> QBO Sales Receipt, via the shared pusher.
    const projectIds = await ownedProjectIds()
    if (!projectIds.length) return NextResponse.json({ summary: { total: 0, synced: 0, skipped: 0, errors: 0 }, results: [] })

    let q = db.from('client_payments').select('id, qbo_id').in('project_id', projectIds)
    if (ids) q = q.in('id', ids)
    const { data: payments } = await q

    const ctx: PushContext = { conn }
    for (const p of payments ?? []) {
      const label = `Payment ${p.id.slice(0, 8)}`
      if (p.qbo_id) { results.push({ id: p.id, name: label, status: 'skipped', qbo_id: p.qbo_id, message: 'Already synced' }); continue }
      const r = await pushClientPayment(db, p.id, ctx)
      if (r.pushed) results.push({ id: p.id, name: label, status: 'success', qbo_id: r.qboId })
      else if (r.reason === 'already') results.push({ id: p.id, name: label, status: 'skipped', message: 'Already synced' })
      else results.push({ id: p.id, name: label, status: 'error', message: r.detail ?? r.reason })
    }
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
