import type { SupabaseClient } from '@supabase/supabase-js'
import { duplicateCustomer, duplicateCustomerMessage } from '@/lib/customer-dedupe'
import type { WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Adding and editing a customer card - the ONE home for both.
//
// Moved out of `POST /api/customers`, `PATCH /api/customers` and
// `PATCH /api/customers/[customerId]` unchanged, so the MCP server (Claude)
// files a customer through the same duplicate check the New Customer form
// meets, scoped to the same company. The routes keep the gate.
//
// WHAT IS NOT HERE: the QuickBooks push. The routes push a new or corrected
// customer straight after a 200, as they always have. Nothing under
// lib/writes reaches QuickBooks (pinned in mcp-write.ts), so a customer Claude
// files gets there when its first invoice is pushed (`ensureCustomerId`) or on
// the Settings -> QuickBooks customer sync.
// ─────────────────────────────────────────────────────────────────────────────

export async function createCustomer(
  db: SupabaseClient,
  { companyId, body }: { companyId: string; body: any },
): Promise<WriteResult> {
  // Same names as the route this came from, so the code reads as it did there.
  const profile = { company_id: companyId }
  const { name, contact_name, email, phone, billing_address, notes } = body

  if (!name) return { status: 400, body: { error: 'name is required' } }

  // One client, one card. This insert used to take anything, so the New
  // Customer form could file the same client twice and split their projects
  // and invoices across two cards. See lib/customer-dedupe.ts.
  const { data: mine, error: listError } = await db
    .from('customers')
    .select('id, name, email')
    .eq('gc_company_id', profile.company_id)
  if (listError) {
    console.error('[customers] duplicate check failed', listError)
    return { status: 500, body: { error: 'Could not check your existing customers. Try again.' } }
  }
  const dup = duplicateCustomer(mine ?? [], { name, email })
  if (dup) {
    return { status: 409, body: { error: duplicateCustomerMessage(dup), existing_id: dup.customer.id } }
  }

  const { data: customer, error } = await db
    .from('customers')
    .insert({ gc_company_id: profile.company_id, name, contact_name, email, phone, billing_address, notes })
    .select()
    .single()

  if (error) return { status: 500, body: { error: error.message } }

  return { status: 200, body: { customer } }
}

export async function updateCustomer(
  db: SupabaseClient,
  { companyId, customerId, body }: { companyId: string; customerId: string; body: any },
): Promise<WriteResult> {
  const { name, contact_name, email, phone, billing_address, notes } = body

  const updates: Record<string, unknown> = {}
  if (name !== undefined) updates.name = name
  if (contact_name !== undefined) updates.contact_name = contact_name
  if (email !== undefined) updates.email = email
  if (phone !== undefined) updates.phone = phone
  if (billing_address !== undefined) updates.billing_address = billing_address
  if (notes !== undefined) updates.notes = notes

  const { data: customer, error } = await db
    .from('customers')
    .update(updates)
    .eq('id', customerId)
    .eq('gc_company_id', companyId)
    .select()
    .single()

  if (error) return { status: 500, body: { error: error.message } }

  return { status: 200, body: { customer } }
}
