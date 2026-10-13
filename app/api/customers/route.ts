/*
 * ─── SQL TO RUN IN SUPABASE ────────────────────────────────────────────────────
 *
 * CREATE TABLE IF NOT EXISTS customers (
 *   id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 *   gc_company_id uuid REFERENCES companies(id) ON DELETE CASCADE,
 *   name text NOT NULL,
 *   contact_name text,
 *   email text,
 *   phone text,
 *   billing_address text,
 *   notes text,
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * ALTER TABLE projects ADD COLUMN IF NOT EXISTS customer_id uuid REFERENCES customers(id) ON DELETE SET NULL;
 *
 * ──────────────────────────────────────────────────────────────────────────────
 */

import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { pushCustomer } from '@/lib/quickbooks-push'
import { requirePermission, denied } from '@/lib/api-guard'
import { getActor, actorCan } from '@/lib/server-permissions'
import { createCustomer, updateCustomer } from '@/lib/writes/customer'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// THESE ASKED NOTHING BUT "ARE YOU SIGNED IN". A Field Worker - `customers: N`
// - could add, rename or re-address any client card of their company by
// calling the route the screen hid from them. Writes now take `customers:
// edit`, not `create`: no built-in role holds create without edit, and the
// Project Manager and Office Staff who add customers today hold VE, so `create`
// would have taken the New Customer form away from both.
export async function GET(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const actor = await getActor(db, token)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  // The list is also the CUSTOMER PICKER on the create and edit project forms,
  // so somebody who may open or edit a job may read it, whatever a company has
  // remapped `customers` to - a picker holding nothing under a form you are
  // entitled to use is the failure the Invoices page already demonstrated.
  if (!actorCan(actor, 'customers', 'view') && !actorCan(actor, 'projects', 'create') && !actorCan(actor, 'projects', 'edit')) {
    return NextResponse.json({ error: 'You do not have permission to view customers.' }, { status: 403 })
  }
  if (!actor.companyId) return NextResponse.json({ customers: [] })

  const { data, error } = await db
    .from('customers')
    .select('*, projects(id, name, status, address, start_date, type)')
    .eq('gc_company_id', actor.companyId)
    .order('name')

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ customers: data ?? [] })
}

export async function POST(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'customers', 'edit')
  if (denied(gate)) return gate.denied
  if (!gate.actor.companyId) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const body = await request.json()
  const result = await createCustomer(db, { companyId: gate.actor.companyId, body })
  if (result.status !== 200) return NextResponse.json(result.body, { status: result.status })

  // Into QuickBooks now, not the first time somebody happens to invoice them.
  await pushCustomer(db, result.body.customer.id)

  return NextResponse.json(result.body)
}

export async function PATCH(request: Request) {
  const db = admin()
  const gate = await requirePermission(db, request, 'customers', 'edit')
  if (denied(gate)) return gate.denied
  if (!gate.actor.companyId) return NextResponse.json({ error: 'Profile not found' }, { status: 400 })

  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const result = await updateCustomer(db, { companyId: gate.actor.companyId, customerId: body.id, body })
  if (result.status !== 200) return NextResponse.json(result.body, { status: result.status })

  // Corrections reach the books too - an address fixed here used to stay here.
  await pushCustomer(db, result.body.customer.id)

  return NextResponse.json(result.body)
}
