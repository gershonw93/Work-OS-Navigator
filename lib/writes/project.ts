import type { SupabaseClient } from '@supabase/supabase-js'
import { asContractType } from '@/lib/contract-type'
import { projectSlotProblem } from '@/lib/billing-read'
import { cleanLotDetails } from '@/lib/lot-details'
import { customerForNewProject } from '@/lib/project-customer'
import { housesToFollow } from '@/lib/development-customer'
import { acknowledgedAll, activationRefusal, isProjectStatus } from '@/lib/activation'
import { COUNTED_PROJECT_STATUSES } from '@/lib/plan-limits'
import type { WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Opening a job and editing one - the ONE home for both.
//
// Moved out of `POST /api/projects` and `PATCH /api/projects/[id]` unchanged,
// so the MCP server (Claude) opens and edits a job through exactly the code
// the Projects screen does - and, above all, meets THE SAME PROJECT CAP. The
// plans meter open jobs, and a cap enforced on the app's doors and not on
// Claude's would be the eleventh job one sentence away. Both doors that open a
// slot are here: creating, and moving a job back INTO a counted status.
//
// The routes keep the permission gate, the read-only billing lock and (for an
// edit) the ownership check; everything after them is this. To keep the moved
// code reading exactly as it did in the routes - and so the pins that read it
// still describe it - the route's own names (`admin`, `profile`, `params`,
// `actor`) are rebound at the top of each function.
//
// WHAT IS NOT HERE: the QuickBooks push of a customer the create form typed
// into being. Nothing under lib/writes reaches QuickBooks (pinned in
// mcp-write.ts); the route passes `afterCustomerCreated` to push it, as it
// always did, and Claude's door passes nothing - that customer reaches the
// books with its first pushed invoice, or the Settings customer sync.
// ─────────────────────────────────────────────────────────────────────────────

export async function createProject(
  db: SupabaseClient,
  { companyId, body, afterCustomerCreated }: {
    companyId: string
    body: any
    /** Run once a typed client has become a NEW customer card. The app route syncs it to QuickBooks here. */
    afterCustomerCreated?: (customerId: string) => Promise<unknown>
  },
): Promise<WriteResult> {
  const admin = db
  const profile = { company_id: companyId }

  // THE PLAN IS METERED ON ACTIVE PROJECTS, so this is the door it is metered
  // at - for the app and for Claude alike. The read-only lock is asked before
  // this by both callers (the route by hand, the MCP dispatcher for every write).
  const slot = await projectSlotProblem(admin, profile.company_id)
  if (slot) return { status: 402, body: { error: slot, billing: 'project_limit' } }

  const { name, address, client, type, start_date, end_date, customer_id, lat, lng, interior_sqft, exterior_sqft, billing_mode, default_retainage_pct, contract_type } = body

  // A client named by typing becomes a customer card, so the Customers list
  // and Project Settings see the same client the header prints. See
  // lib/project-customer.ts.
  const linked = customer_id ? null : await customerForNewProject(admin, profile.company_id, client)
  if (linked?.created && afterCustomerCreated) await afterCustomerCreated(linked.id)

  const base = {
    name, address, type, start_date,
    client: linked ? linked.name : client,
    end_date: end_date || null,
    status: 'planning',
    customer_id: customer_id || linked?.id || null,
    gc_company_id: profile.company_id,
    created_by_company_id: profile.company_id,
  }
  const withGeo = lat != null && lng != null ? { ...base, lat, lng, geocoded_address: address } : base
  const withSqft = (interior_sqft != null || exterior_sqft != null)
    ? { ...withGeo, interior_sqft: interior_sqft ?? null, exterior_sqft: exterior_sqft ?? null }
    : withGeo
  const withBilling = billing_mode
    ? { ...withSqft, billing_mode, ...(default_retainage_pct != null ? { default_retainage_pct } : {}) }
    : withSqft
  // Optional at creation. Left off entirely when unanswered so the column stays
  // null and the Budget tab knows to ask, rather than being defaulted to a
  // guess that hides the control the job needs.
  const ct = asContractType(contract_type)
  const withContract = ct ? { ...withBilling, contract_type: ct } : withBilling
  // Lot details (migration 131), only the ones sent.
  const full = { ...withContract, ...cleanLotDetails(body) }

  let { data: project, error: insertError } = await admin.from('projects').insert(full).select().single()
  // Pre-migration fallback: billing_mode / sqft / geo columns may not exist yet.
  if (insertError && (insertError as any).code === '42703') {
    const retryLot = await admin.from('projects').insert(withContract).select().single()
    project = retryLot.data; insertError = retryLot.error
  }
  if (insertError && (insertError as any).code === '42703') {
    const retryContract = await admin.from('projects').insert(withBilling).select().single()
    project = retryContract.data; insertError = retryContract.error
  }
  if (insertError && (insertError as any).code === '42703') {
    const retryBilling = await admin.from('projects').insert(withSqft).select().single()
    project = retryBilling.data; insertError = retryBilling.error
  }
  if (insertError && (insertError as any).code === '42703') {
    const retry1 = await admin.from('projects').insert(withGeo).select().single()
    project = retry1.data; insertError = retry1.error
    if (insertError && (insertError as any).code === '42703') {
      const retry2 = await admin.from('projects').insert(base).select().single()
      project = retry2.data; insertError = retry2.error
    }
  }

  if (insertError) {
    return { status: 500, body: { error: insertError.message } }
  }

  return { status: 200, body: { project } }
}

export async function updateProject(
  db: SupabaseClient,
  { companyId, projectId, owned, body }: {
    companyId: string | null
    projectId: string
    /** The row the route's ownership check already read: is it a site, and whose customer is it now. */
    owned: { project: { is_site: boolean | null; customer_id: string | null } }
    body: any
  },
): Promise<WriteResult> {
  const params = { id: projectId }
  const actor = { companyId }

  const { name, address, client, type, status, start_date, end_date, customer_id, lat, lng, interior_sqft, exterior_sqft, billing_mode, default_retainage_pct, labor_rate, unit, floor, sellout_amount, contract_type, contractor_fee_pct, fee_on_materials } = body

  // Going Active is the one transition worth stopping on, and it had NO gate
  // at all: `updates.status = status` took any string, from any of three doors,
  // and only one of them ever showed the pre-flight. So a Building To Sell job
  // went live with no budget and no sale price and nothing said a word.
  //
  // Checked here rather than in the browser because the browser is what was
  // bypassed. The concerns have to be named back in `acknowledge` - a caller
  // cannot wave through a job it never looked at. (`guardActivation`'s rule,
  // answered as a result rather than a response.)
  if (isProjectStatus(status) && status === 'active') {
    const { data: before } = await db.from('projects').select('status').eq('id', params.id).maybeSingle()
    if (((before as any)?.status ?? 'planning') === 'planning') {
      // Imported when it is needed: activation-check.ts also carries the
      // route's NextResponse wrapper, and lib/writes stays loadable without Next.
      const { activationFacts } = await import('@/lib/activation-check')
      const facts = await activationFacts(db, params.id)
      if (!acknowledgedAll(facts, body.acknowledge)) {
        return { status: 400, body: { error: activationRefusal(facts), needsAcknowledgement: true } }
      }
    }
  }

  const updates: Record<string, unknown> = {}

  // name, type, status, billing_mode and default_retainage_pct are NOT NULL in
  // the schema, so `!= null` rather than `!== undefined`: a client sending null
  // is asking to unset something that cannot be unset, and Postgres rejects the
  // WHOLE update with a constraint message no user can act on. Null means
  // "leave it as it is".
  //
  // This is not hypothetical - switching a job to simple invoicing sent
  // default_retainage_pct: null, and the save died on a job that had never
  // billed anything.
  if (name != null) updates.name = name
  if (address !== undefined) updates.address = address
  if (lat !== undefined && lng !== undefined && lat != null && lng != null) { updates.lat = lat; updates.lng = lng; updates.geocoded_address = address }
  if (client !== undefined) updates.client = client
  if (type != null) updates.type = type
  // Validated against the known set. Any string used to write straight through
  // - the same hole #359 closed on pay-app status, still open one table over.
  if (status != null) {
    if (!isProjectStatus(status)) {
      return { status: 400, body: { error: 'That is not a project status.' } }
    }
    // BRINGING A JOB BACK IS OPENING A SLOT. Metering only the create route
    // would leave the eleventh active job one status change away - and the
    // status change is how a finished job comes back, so it is the likelier
    // door of the two. Only asked when the move is INTO a counted status from
    // outside one; re-saving an active job as active must not be refused for
    // the slot it is already occupying.
    const { data: was } = await db.from('projects')
      .select('status, gc_company_id, is_site').eq('id', params.id).maybeSingle()
    const prev = (was as { status?: string; gc_company_id?: string; is_site?: boolean } | null) ?? null
    const wasCounted = (COUNTED_PROJECT_STATUSES as readonly string[]).includes(prev?.status ?? '')
    const willCount = (COUNTED_PROJECT_STATUSES as readonly string[]).includes(status)
    // A site is a folder and never holds a slot (`readUsage`), so reopening
    // one must not be refused for want of one.
    if (willCount && !wasCounted && !prev?.is_site) {
      const slot = await projectSlotProblem(db, prev?.gc_company_id)
      if (slot) return { status: 402, body: { error: slot, billing: 'project_limit' } }
    }
    updates.status = status
  }
  if (start_date !== undefined) updates.start_date = start_date
  if (end_date !== undefined) updates.end_date = end_date
  // THE CUSTOMER IS A CARD, NOT A STRING. A picked id must be one of this
  // company's customers; a typed new name becomes one (`customerForNewProject`,
  // the create form's rule). Either way `client` - what the header prints -
  // follows the card, so the two homes of this fact cannot disagree.
  let customerName: string | null = null
  if (typeof body.new_customer_name === 'string' && body.new_customer_name.trim()) {
    const made = await customerForNewProject(db, actor?.companyId ?? '', body.new_customer_name)
    if (!made) return { status: 500, body: { error: 'Could not add that customer. Try again, or pick one from the list.' } }
    updates.customer_id = made.id
    updates.client = customerName = made.name
  } else if (customer_id !== undefined) {
    if (customer_id) {
      const { data: c } = await db.from('customers').select('id, name')
        .eq('id', customer_id).eq('gc_company_id', actor?.companyId ?? '').maybeSingle()
      if (!c) return { status: 400, body: { error: 'That customer is not one of yours. Reload and pick again.' } }
      updates.customer_id = c.id
      updates.client = customerName = (c as any).name
    } else {
      updates.customer_id = null
      updates.client = null
    }
  }
  if (interior_sqft !== undefined) updates.interior_sqft = interior_sqft
  if (exterior_sqft !== undefined) updates.exterior_sqft = exterior_sqft
  if (billing_mode != null) updates.billing_mode = billing_mode
  if (default_retainage_pct != null) updates.default_retainage_pct = default_retainage_pct
  if (labor_rate !== undefined) updates.labor_rate = Math.max(0, Number(labor_rate) || 0)
  // Kept out of `address` on purpose - an address with "Unit 3" on the end
  // can't be geocoded, which is what stranded bulk-created jobs off the map.
  if (unit !== undefined) updates.unit = (unit ?? '').toString().trim() || null
  if (floor !== undefined) updates.floor = (floor ?? '').toString().trim() || null
  // The cost-plus rate, as a fraction. Clamped rather than trusted - this
  // drives what a client is billed.
  if (contractor_fee_pct !== undefined && contractor_fee_pct !== null) {
    updates.contractor_fee_pct = Math.max(0, Math.min(Number(contractor_fee_pct) || 0, 1))
  }
  // How the job pays. Validated against the same list the CHECK constraint
  // uses, so a bad value is a no-op rather than a 500 the user cannot act on.
  if (contract_type !== undefined) {
    updates.contract_type = asContractType(contract_type)
  }
  // Does the cost-plus fee apply to material receipts on this job?
  //
  // Per project because it is per CONTRACT - some mark up everything the job
  // costs, some pass materials through. Migration 091, defaulting to false,
  // which is the behaviour every existing job already had.
  if (fee_on_materials !== undefined) {
    updates.fee_on_materials = !!fee_on_materials
  }
  // Lot details (migration 131). Only the keys the caller SENT - a form that
  // never showed the lot section must not wipe what a lot list wrote.
  Object.assign(updates, cleanLotDetails(body))
  // Projected revenue. Null means "no figure yet", which is different from 0.
  if (sellout_amount !== undefined) {
    updates.sellout_amount = sellout_amount === null || sellout_amount === ''
      ? null
      : Math.max(0, Number(sellout_amount) || 0)
  }

  let { data, error } = await db
    .from('projects')
    .update(updates)
    .eq('id', params.id)
    .select()
    .single()

  // Pre-migration fallback: drop columns that may not exist yet, one class at a time.
  if (error && (error as any).code === '42703' && 'labor_rate' in updates) {
    const { labor_rate: _lr, ...noRate } = updates
    const retry = await db.from('projects').update(noRate).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }
  if (error && (error as any).code === '42703' && 'sellout_amount' in updates) {
    const { sellout_amount: _s, ...noSellout } = updates
    const retry = await db.from('projects').update(noSellout).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }
  if (error && (error as any).code === '42703' && 'fee_on_materials' in updates) {
    const { fee_on_materials: _f, ...noFee } = updates
    const retry = await db.from('projects').update(noFee).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }
  if (error && (error as any).code === '42703' && 'contract_type' in updates) {
    const { contract_type: _c, ...noContract } = updates
    const retry = await db.from('projects').update(noContract).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }
  if (error && (error as any).code === '42703' && ('unit' in updates || 'floor' in updates)) {
    const { unit: _u, floor: _f, ...noUnit } = updates
    const retry = await db.from('projects').update(noUnit).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }
  if (error && (error as any).code === '42703' && ('billing_mode' in updates || 'default_retainage_pct' in updates)) {
    const { billing_mode: _b, default_retainage_pct: _r, ...noBilling } = updates
    const retry = await db.from('projects').update(noBilling).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }
  if (error && (error as any).code === '42703' && ('interior_sqft' in updates || 'exterior_sqft' in updates)) {
    const { interior_sqft: _i, exterior_sqft: _e, billing_mode: _b2, default_retainage_pct: _r2, ...withoutSqft } = updates
    const retry = await db.from('projects').update(withoutSqft).eq('id', params.id).select().single()
    data = retry.data; error = retry.error
  }

  if (error) return { status: 500, body: { error: error.message } }

  // A DEVELOPMENT'S CUSTOMER IS ITS HOUSES' CUSTOMER - unless a house was given
  // its own (lib/development-customer.ts says which).
  let houses: { updated: number; kept: string[] } | undefined
  if (owned.project.is_site && 'customer_id' in updates && updates.customer_id !== owned.project.customer_id) {
    const { data: kids, error: kErr } = await db.from('projects').select('id, name, customer_id').eq('parent_project_id', params.id)
    if (kErr) {
      console.error('[projects] could not read the houses to pass the customer on', kErr.message)
    } else {
      const { follow, kept } = housesToFollow((kids ?? []) as any, owned.project.customer_id)
      if (follow.length) {
        const { error: uErr } = await db.from('projects')
          .update({ customer_id: updates.customer_id ?? null, client: updates.customer_id ? customerName : null })
          .in('id', follow)
        if (uErr) console.error('[projects] could not pass the customer on to the houses', uErr.message)
        else houses = { updated: follow.length, kept }
      } else houses = { updated: 0, kept }
    }
  }

  return { status: 200, body: { project: data, ...(houses ? { houses } : {}) } }
}
