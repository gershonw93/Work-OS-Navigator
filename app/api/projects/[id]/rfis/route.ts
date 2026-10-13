import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { rfiSide } from '@/lib/rfi-access'
import { actorCan } from '@/lib/server-permissions'
import { billingLock } from '@/lib/api-guard'
import { createRfi } from '@/lib/writes/rfi'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  // Was: any signed-in account could list any job's RFIs. See lib/rfi-access.ts.
  const who = await rfiSide(db, request, params.id)
  if ('denied' in who) return who.denied
  if (who.side === 'gc' && !actorCan(who.actor, 'rfis', 'view')) {
    return NextResponse.json({ error: 'You do not have permission to view RFIs.' }, { status: 403 })
  }

  let q = db.from('rfis').select('*').eq('project_id', params.id)
  // A sub reads the questions its own company asked, not every trade's.
  if (who.side === 'sub') q = q.eq('company_id', who.actor.companyId)
  const { data: rfis, error } = await q.order('created_at', { ascending: false })

  if (error) {
    console.error('[rfis] list failed', { project: params.id, error: error.message })
    return NextResponse.json({ error: 'Could not load the RFIs. Try again.' }, { status: 500 })
  }
  return NextResponse.json({ rfis: rfis ?? [] })
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const who = await rfiSide(db, request, params.id)
  if ('denied' in who) return who.denied
  // The GC's own staff need the permission to create one; a sub on the job may
  // always ask - asking is what a sub is on the job to be able to do, and the
  // vendor role only carries `rfis: view`.
  if (who.side === 'gc' && !actorCan(who.actor, 'rfis', 'create')) {
    return NextResponse.json({ error: 'You do not have permission to create RFIs.' }, { status: 403 })
  }
  const locked = await billingLock(db, who.actor.companyId)
  if (locked) return locked
  const body = await request.json().catch(() => ({}))

  // WHO ASKED IS READ HERE, NEVER TAKEN FROM THE BODY. `company_id`,
  // `company_name` and `submitted_by_name` used to come off the request, so an
  // RFI - and the change order riding on it - could be filed under any company.
  // A sub's RFI carries the sub's company; the GC's own carries none.
  const company_id = who.side === 'sub' ? who.actor.companyId : null
  const company_name = who.side === 'sub' ? who.companyName : null

  // Everything after the gate lives in lib/writes/rfi.ts, shared with the MCP
  // server (Claude) so both write an RFI through the same checks.
  const result = await createRfi(db, {
    userId: who.actor.userId, projectId: params.id, body, asker: { company_id, company_name },
  })
  return NextResponse.json(result.body, { status: result.status })
}
