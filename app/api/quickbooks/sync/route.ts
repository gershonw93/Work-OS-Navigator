import { NextResponse } from 'next/server'
import { admin, getValidConnection, qboFetch } from '@/lib/quickbooks'

export const runtime = 'nodejs'
export const maxDuration = 60

// Push SyteNav records into QuickBooks Online. Phase 1a: customers + vendors
// (no QBO dependencies). Bills/payments come next - they need an account map.
// Body: { entity: 'customers' | 'vendors', ids?: string[] } (ids optional -
// omitted means "everything not yet synced").
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
  } else {
    return NextResponse.json({ error: `Unsupported entity "${entity}". Phase 1a supports customers and vendors.` }, { status: 400 })
  }

  const summary = {
    total: results.length,
    synced: results.filter(r => r.status === 'success').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
  }
  return NextResponse.json({ summary, results })
}
