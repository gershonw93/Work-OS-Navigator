import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied, ownedProject } from '@/lib/api-guard'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * The client's email address for a project, for pre-filling a Send box.
 *
 * Small and honestly named on purpose. Several places want to email this
 * project's client - the invoice, the portal link - and the alternative was
 * each of them borrowing an unrelated endpoint that happened to return it.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  // Any login got any job's client's address. It pre-fills the Send box on a
  // client invoice and a payment request, both on Billing the client - so
  // `payments: view`, and the client is the GC's (`ownedProject`), the same
  // pair `payment-requests` asks.
  const db = admin()
  const gate = await requirePermission(db, request, 'payments', 'view')
  if (denied(gate)) return gate.denied
  const owned = await ownedProject(db, gate.actor, params.id, 'id')
  if ('denied' in owned) return owned.denied

  const { data: project } = await db.from('projects')
    .select('customer_id, client').eq('id', params.id).maybeSingle()

  let clientEmail: string | null = null
  if ((project as any)?.customer_id) {
    const { data: c } = await db.from('customers').select('email').eq('id', (project as any).customer_id).maybeSingle()
    clientEmail = (c as any)?.email ?? null
  }

  return NextResponse.json({ clientEmail, clientName: (project as any)?.client ?? null })
}
