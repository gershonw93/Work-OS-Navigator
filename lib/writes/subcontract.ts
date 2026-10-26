import type { SupabaseClient } from '@supabase/supabase-js'
import { friendlyDbError } from '@/lib/db-error'
import { logActivity } from '@/lib/log-activity'
import { money } from '@/lib/validate'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Putting a subcontractor on a job, and editing that subcontract - the ONE home
// for both.
//
// Moved out of `POST /api/projects/[id]/subcontracts` and
// `PATCH /api/projects/[id]/subcontracts/[subId]` unchanged, so the MCP server
// (Claude) writes a subcontract through exactly the code the app does. The
// routes keep their gates - and the POST's gate DEPENDS ON THE BODY
// (`invoices: edit` to attach a Directory sub, `team: edit` to mint a new
// company), so a caller must ask the same question before calling this.
//
// The POST route takes multipart form-data; it hands the form over as a plain
// object of its fields (`proposal` is the File, if any). `line_items` and
// `payment_schedule` arrive from the form as JSON strings; an array is taken
// as-is, so a caller with no form need not stringify one.
// ─────────────────────────────────────────────────────────────────────────────

/** A form value as the route read it: `(form.get(k) as string ?? '').trim()`. */
function field(body: any, key: string): string {
  const v = body?.[key]
  return (v == null ? '' : String(v)).trim()
}

function jsonList(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw
  if (raw) return JSON.parse(raw as string)
  return []
}

export async function createSubcontract(
  db: SupabaseClient,
  { userId, projectId, body, via }: { userId: string; projectId: string; body: any; via?: string },
): Promise<WriteResult> {
  const { data: profile } = await db.from('profiles').select('full_name, company_id').eq('id', userId).single()

  const existingCompanyId = field(body, 'existing_company_id')
  const companyName = field(body, 'company_name')
  const trade = field(body, 'trade')
  const scope = field(body, 'scope')
  const contactEmail = field(body, 'contact_email')
  const phone = field(body, 'phone')
  const file = (body?.proposal ?? null) as File | null

  // Scope line items: [{ description, amount }]
  let lineItems: { description: string; amount: number | null }[] = []
  try {
    lineItems = jsonList(body?.line_items)
  } catch { lineItems = [] }
  lineItems = (lineItems || []).filter(li => (li.description ?? '').trim() || li.amount)

  // Payment schedule milestones: [{ label, percent, amount }]
  let paymentSchedule: { label: string; percent: number | null; amount: number | null }[] = []
  try {
    paymentSchedule = jsonList(body?.payment_schedule)
  } catch { paymentSchedule = [] }
  paymentSchedule = (paymentSchedule || []).filter(p => (p.label ?? '').trim() || p.percent || p.amount)

  // Contract amount = explicit value, else sum of line items.
  // money() keeps the sign; the old clean stripped it, so a contract typed as
  // -50000 was signed for 50000.
  const amountRaw = String(body?.contract_amount ?? '').trim()
  const lineItemsTotal = lineItems.reduce((s, li) => s + (Number(li.amount) || 0), 0)
  let contractAmount: number | null = lineItemsTotal || null
  if (amountRaw) {
    const checked = money(amountRaw, { label: 'contract amount' })
    if (!checked.ok) return { status: 400, body: { error: checked.error } }
    contractAmount = checked.value
  }

  if (!existingCompanyId && !companyName) {
    return { status: 400, body: { error: 'Pick an existing subcontractor or enter a company name' } }
  }

  // Either reuse an existing directory company, or create a new off-platform one.
  //
  // The company has to exist before the subcontract can point at it, and there
  // is no transaction across these two inserts. So track whether WE created it:
  // if the subcontract then fails, the company is an orphan that this request
  // is responsible for, and leaving it behind is how one failed save turns into
  // a duplicate in the directory - two failures, two identical companies, zero
  // subcontracts. Never touch a company that already existed.
  let company: { id: string; name: string } | null = null
  let createdCompanyId: string | null = null
  if (existingCompanyId) {
    const { data: existing, error: exErr } = await db
      .from('companies').select('id, name').eq('id', existingCompanyId).single()
    if (exErr || !existing) return { status: 404, body: { error: 'Subcontractor not found' } }
    company = existing
  } else {
    const newCompany: Record<string, unknown> = {
      name: companyName,
      type: 'subcontractor',
      trade: trade || null,
      contact_email: contactEmail || '',
      phone: phone || null,
      added_by_company_id: (profile as any)?.company_id ?? null,
    }
    let { data: created, error: companyErr } = await db.from('companies').insert(newCompany).select('id, name').single()
    // Retry without added_by_company_id if that column hasn't been added
    if (companyErr && (companyErr as any).code === '42703') {
      delete newCompany.added_by_company_id
      const retry = await db.from('companies').insert(newCompany).select('id, name').single()
      created = retry.data; companyErr = retry.error
    }
    if (companyErr || !created) return { status: 500, body: { error: companyErr?.message ?? 'Could not create company' } }
    company = created
    createdCompanyId = created.id
  }

  // Nothing constrains (project_id, company_id), so attaching a sub who is
  // already on this project would quietly create a SECOND subcontract - and
  // then the bill form offers the same vendor twice with no way to tell which
  // is which. Reuse the one that exists.
  if (existingCompanyId) {
    const { data: already } = await db.from('subcontracts')
      .select('*, companies(id, name)')
      .eq('project_id', projectId).eq('company_id', existingCompanyId)
      .limit(1).maybeSingle()
    if (already) return { status: 200, body: { subcontract: already, reused: true } }
  }

  // Upload the proposal file if one was provided
  let proposal_url: string | null = null
  if (file && file.size > 0) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${projectId}/proposals/${Date.now()}-${safeName}`
    const arrayBuffer = await file.arrayBuffer()
    const { error: upErr } = await db.storage.from('submittals').upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })
    if (!upErr) {
      const { data: signed } = await db.storage.from('submittals').createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
      proposal_url = signed?.signedUrl ?? null
    }
  }

  // Build a readable scope fallback from line items if no paragraph was typed
  const scopeText = scope || lineItems.map(li => li.description).filter(Boolean).join('; ') || trade || ''

  const insertSub: Record<string, unknown> = {
    project_id: projectId,
    company_id: company.id,
    scope: scopeText,
    trade: trade || scopeText || '',
    contract_amount: contractAmount,
    status: 'active',
    added_manually: true,
    proposal_url,
    line_items: lineItems,
  }

  let { data: subcontract, error: subErr } = await db.from('subcontracts').insert(insertSub).select().single()

  // Retry dropping optional columns one tier at a time if migrations haven't run yet
  if (subErr && (subErr as any).code === '42703') {
    delete insertSub.line_items
    let retry = await db.from('subcontracts').insert(insertSub).select().single()
    if (retry.error && (retry.error as any).code === '42703') {
      delete insertSub.added_manually
      delete insertSub.proposal_url
      retry = await db.from('subcontracts').insert(insertSub).select().single()
    }
    subcontract = retry.data
    subErr = retry.error
  }

  if (subErr) {
    // Roll back the company we just minted, so a failed save does not leave a
    // duplicate in the directory for the user to find later and wonder about.
    if (createdCompanyId) {
      await db.from('companies').delete().eq('id', createdCompanyId)
    }
    return { status: 500, body: { error: friendlyDbError(subErr) } }
  }

  // --- Tie in everywhere an awarded bid would ---

  // 1) Payment schedule (the proposal's payment TERMS: deposit / progress / final).
  //    Use the entered/extracted schedule; otherwise a single line for the full amount.
  const paymentRows = (paymentSchedule.length > 0
    ? paymentSchedule.map((p, i) => {
        const pct = p.percent != null ? Number(p.percent) : null
        const amt = p.amount != null ? Number(p.amount) : (pct != null && contractAmount ? Math.round(contractAmount * pct) / 100 : null)
        return {
          subcontract_id: subcontract.id,
          label: p.label || `Payment ${i + 1}`,
          type: pct != null ? 'percent' : 'milestone',
          percentage: pct,
          amount: amt,
          status: 'pending',
          order_index: i,
        }
      })
    : (contractAmount
        ? [{ subcontract_id: subcontract.id, label: 'Contract total', type: 'milestone', percentage: null, amount: contractAmount, status: 'pending', order_index: 0 }]
        : []))
  if (paymentRows.length > 0) {
    await db.from('payment_schedule_items').insert(paymentRows)
  }

  // 1b) Record it on the Bids tab too: an awarded bid package + bid with full detail.
  try {
    const { data: pkg } = await db.from('bid_packages').insert({
      project_id: projectId,
      scope: scopeText || trade || company.name,
      description: scopeText || `Proposal from ${company.name}`,
      trade: trade || null,
      status: 'awarded',
    }).select('id').single()
    if (pkg) {
      // Map scope line items into the bid's scope_categories so they render in the bid modal
      const scopeItems = (lineItems as any[]).map((li, i) => {
        const qty = li.qty ?? (li.amount != null ? 1 : null)
        const unit_price = li.unit_price ?? (li.amount != null ? Number(li.amount) : null)
        return { id: `li-${i}`, item: li.description || `Item ${i + 1}`, qty, unit_price, included: true }
      })
      const scopeCategories = scopeItems.length > 0
        ? [{ id: 'cat-0', category: trade || 'Scope of Work', items: scopeItems }]
        : null

      const paymentTermsText = paymentSchedule.length > 0
        ? paymentSchedule.map(p => `${p.label || 'Payment'}${p.percent != null ? ` - ${p.percent}%` : ''}${p.amount != null ? ` ($${Number(p.amount).toLocaleString()})` : ''}`).join('\n')
        : null

      const startDateForBid = field(body, 'start_date') || null

      const fullBid: Record<string, unknown> = {
        bid_package_id: pkg.id,
        company_id: company.id,
        amount: contractAmount ?? 0,
        status: 'awarded',
        submitted_at: new Date().toISOString(),
        proposal_url,
        scope_categories: scopeCategories,
        payment_terms: paymentTermsText,
        earliest_start_date: startDateForBid,
        notes: scopeText || null,
      }
      let bidRes = await db.from('bids').insert(fullBid).select('id').single()
      // Progressively drop optional columns that may not exist in this DB
      if (bidRes.error && (bidRes.error as any).code === '42703') {
        for (const k of ['scope_categories', 'proposal_url', 'payment_terms', 'earliest_start_date']) delete fullBid[k]
        bidRes = await db.from('bids').insert(fullBid).select('id').single()
      }
    }
  } catch { /* bids are a nice-to-have mirror; never block the sub creation */ }

  // 2) Schedule (timeline) bar, if dates were provided
  const startDate = field(body, 'start_date')
  const endDate = field(body, 'end_date')
  if (startDate && endDate) {
    await db.from('schedule_items').insert({
      project_id: projectId,
      subcontract_id: subcontract.id,
      start_date: startDate,
      end_date: endDate,
    })
  }

  // 3) Activity log
  await logActivity(
    db,
    projectId,
    withVia((profile as any)?.full_name ?? 'Someone', via),
    'subcontractor_added',
    `Subcontractor added: ${company.name}${trade ? ` (${trade})` : ''}${contractAmount ? ` - $${Number(contractAmount).toLocaleString()}` : ''}`,
    { subcontract_id: subcontract.id, company: company.name, trade },
  )

  return { status: 201, body: { subcontract } }
}

export async function updateSubcontract(
  db: SupabaseClient,
  // `userId` and `via` are taken for the same shape as every other write here;
  // an edit records no name today, so neither is read yet.
  { projectId, subId, body }: { userId: string; projectId: string; subId: string; body: any; via?: string },
): Promise<WriteResult> {
  // Payment schedule replacement: if provided, delete old rows and insert new ones
  if (Array.isArray(body.payment_schedule)) {
    await db.from('payment_schedule_items').delete().eq('subcontract_id', subId)
    const contractAmount = body.contract_amount ?? null
    const paymentRows = (body.payment_schedule as any[])
      .filter(p => (p.label ?? '').trim() || p.percent || p.amount)
      .map((p: any, i: number) => {
        const pct = p.percent != null ? Number(p.percent) : null
        const amt = p.amount != null ? Number(p.amount) : (pct != null && contractAmount ? Math.round(contractAmount * pct) / 100 : null)
        return {
          subcontract_id: subId,
          label: p.label || `Payment ${i + 1}`,
          type: pct != null ? 'percent' : 'milestone',
          percentage: pct,
          amount: amt,
          status: 'pending',
          order_index: i,
        }
      })
    if (paymentRows.length > 0) {
      await db.from('payment_schedule_items').insert(paymentRows)
    }
  }

  // Subcontract fields
  const allowed = ['scope', 'trade', 'contract_amount', 'line_items', 'status', 'billing_type', 'progress_percent', 'weekly_amount', 'billing_notes']
  const updates: Record<string, unknown> = {}
  for (const key of allowed) {
    if (body[key] !== undefined) updates[key] = body[key]
  }

  // Company fields (name / contact) live on the companies table
  const companyUpdates: Record<string, unknown> = {}
  if (body.company_name !== undefined) companyUpdates.name = body.company_name
  if (body.contact_email !== undefined) companyUpdates.contact_email = body.contact_email
  if (body.phone !== undefined) companyUpdates.phone = body.phone

  let data: any = null
  if (Object.keys(updates).length > 0) {
    let res = await db.from('subcontracts').update(updates).eq('id', subId).eq('project_id', projectId).select('*, companies(id, name)').single()
    // Retry without line_items if that column isn't migrated yet
    if (res.error && (res.error as any).code === '42703' && 'line_items' in updates) {
      const u = { ...updates }; delete u.line_items
      res = await db.from('subcontracts').update(u).eq('id', subId).eq('project_id', projectId).select('*, companies(id, name)').single()
    }
    if (res.error) return { status: 500, body: { error: res.error.message } }
    data = res.data
  } else {
    const res = await db.from('subcontracts').select('*, companies(id, name)').eq('id', subId).eq('project_id', projectId).single()
    data = res.data
  }

  // THE VENDOR'S NAME AND CONTACT ARE CHANGED ONLY ON THIS GC'S OWN DIRECTORY
  // ROW. The company on a subcontract may be the sub's own account, or another
  // GC's Directory entry for them, and this rewrote whichever it was - a GC
  // renaming a sub on one job renamed them for everybody they work for. Same
  // fence as `directoryContactProblem`: `added_by_company_id` is what makes a
  // Directory row yours. A row that is not is left alone and SAID so.
  let companyNotChanged: string | undefined
  if (Object.keys(companyUpdates).length > 0 && data?.company_id) {
    const [{ data: vendor }, { data: project }] = await Promise.all([
      db.from('companies').select('added_by_company_id, name, contact_email, phone').eq('id', data.company_id).maybeSingle(),
      db.from('projects').select('gc_company_id, created_by_company_id').eq('id', projectId).maybeSingle(),
    ])
    const ownerIds = [project?.gc_company_id, project?.created_by_company_id].filter(Boolean)
    // The edit dialog posts all three on every save, so only a value that
    // actually CHANGED is a request to change it.
    const current = (vendor ?? {}) as Record<string, unknown>
    const changed = Object.entries(companyUpdates).some(([k, v]) => String(v ?? '') !== String(current[k] ?? ''))
    if (!changed) {
      // nothing to write
    } else if (vendor?.added_by_company_id && ownerIds.includes(vendor.added_by_company_id)) {
      await db.from('companies').update(companyUpdates).eq('id', data.company_id)
    } else {
      companyNotChanged = 'That company keeps its own SyteNav account, so only they can change its name and contact details.'
    }
  }

  return { status: 200, body: { subcontract: data, ...(companyNotChanged ? { notice: companyNotChanged } : {}) } }
}
