import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { asContractType } from '@/lib/contract-type'
import { activationConcerns } from '@/lib/activation'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * The pre-flight shown before a job is set to Active.
 *
 * Active means "under contract" - won, not mobilised. That's the boundary the
 * rest of the app is built on: the markup locks because it becomes the billed
 * fee, and Invoices/Payments open up because you can now bill (a deposit
 * arrives long before anyone is on site). Whether crews have started is a
 * different question, answered by the start date.
 *
 * Every check is informational. Plenty of real jobs start before the permit
 * lands, so nothing here blocks the change - it just means nobody flips a job
 * live having forgotten the deposit.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const count = async (table: string, build?: (q: any) => any) => {
    try {
      let q = db.from(table).select('id', { count: 'exact', head: true }).eq('project_id', params.id)
      if (build) q = build(q)
      const { count: c } = await q
      return c ?? 0
    } catch { return 0 }
  }

  const [project, budgetLines, payments, paymentRequests, permits, compliance, subcontracts] = await Promise.all([
    db.from('projects').select('start_date, contractor_fee_pct, billing_mode, contract_type, sellout_amount').eq('id', params.id).single(),
    count('budget_line_items'),
    db.from('client_payments').select('amount').eq('project_id', params.id),
    db.from('client_payment_requests').select('amount, sent_at').eq('project_id', params.id).eq('status', 'pending'),
    count('permits'),
    count('compliance_documents'),
    count('subcontracts'),
  ])

  const p: any = project.data ?? {}
  const paidTotal = (payments.data ?? []).reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)
  // Asked for but not yet in the bank. This item stays unticked - it is about
  // money RECEIVED - but "nothing recorded yet" reads as "you have not started"
  // when in fact you are waiting on the client, which is a different problem
  // with a different next step.
  const openRequests = paymentRequests.data ?? []
  const requestedTotal = openRequests.reduce((s: number, r: any) => s + Number(r.amount ?? 0), 0)
  const sentRequests = openRequests.filter((r: any) => r.sent_at).length

  const facts = {
    contractType: asContractType(p.contract_type),
    budgetLines,
    contractorFeePct: Number(p.contractor_fee_pct ?? 0) || 0,
    selloutAmount: p.sellout_amount == null ? null : Number(p.sellout_amount),
    billingMode: p.billing_mode ?? 'simple',
  }
  const concerns = activationConcerns(facts)
  const priceAnswered = !concerns.some(c => c.key === 'price')

  const checks = [
    {
      key: 'budget',
      label: 'Budget has line items',
      ok: budgetLines > 0,
      detail: budgetLines > 0 ? `${budgetLines} line${budgetLines !== 1 ? 's' : ''}` : 'Nothing budgeted yet',
      // Serious: every "what is left" answer on the job is measured against
      // these lines, so with none they all read zero and look like facts.
      serious: budgetLines <= 0,
      href: 'budget',
    },
    // THE PRICE QUESTION IS NOT THE SAME QUESTION ON EVERY JOB.
    //
    // This used to test `contractor_fee_pct > 0` on all of them. The markup is
    // what you are paid on COST-PLUS only - lib/contract-type.ts says so - and
    // on a fixed price or a spec build revenue is the agreed price or the sale
    // price. So a Building To Sell job was told "No markup set on the budget",
    // about a number that does not affect its pay, and nobody ever asked for
    // the sellout figure that does. That is #357 - demanding a client from a
    // job that cannot have one - in a second place.
    //
    // Delegated to lib/activation so the pre-flight and the route that enforces
    // it cannot disagree about what this job needs.
    ...concerns
      .filter(c => c.key === 'price' || c.key === 'contract')
      .map(c => ({
        key: c.key,
        label: c.label,
        ok: false,
        detail: c.detail,
        serious: c.serious,
        href: c.href,
      })),
    ...(priceAnswered ? [{
      key: 'price',
      label: 'Price agreed with the client',
      ok: true,
      detail: p.billing_mode === 'aia'
        ? 'AIA job - billed by pay application'
        : Number(p.contractor_fee_pct ?? 0) > 0
          ? `${Math.round(Number(p.contractor_fee_pct) * 1000) / 10}% markup set`
          : `$${Number(p.sellout_amount).toLocaleString(undefined, { maximumFractionDigits: 0 })} revenue set`,
      serious: false,
      href: 'budget',
    }] : []),
    {
      key: 'deposit',
      label: 'Deposit or first payment received',
      ok: paidTotal > 0,
      detail: paidTotal > 0
        ? `$${paidTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} recorded`
        : requestedTotal > 0
          ? `$${requestedTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} requested${sentRequests ? ', waiting on the client' : ' - not sent yet'}`
          : 'Nothing recorded yet',
      href: 'payments',
    },
    {
      key: 'subs',
      label: 'Subcontractors lined up',
      ok: subcontracts > 0,
      detail: subcontracts > 0 ? `${subcontracts} subcontract${subcontracts !== 1 ? 's' : ''}` : 'None awarded yet',
      href: 'team',
    },
    {
      key: 'compliance',
      label: 'Insurance & compliance docs on file',
      ok: compliance > 0,
      detail: compliance > 0 ? `${compliance} document${compliance !== 1 ? 's' : ''}` : 'Nothing collected yet',
      href: 'compliance',
    },
    {
      key: 'permits',
      label: 'Permits filed',
      ok: permits > 0,
      detail: permits > 0 ? `${permits} permit${permits !== 1 ? 's' : ''}` : 'None recorded yet',
      href: 'permits',
    },
  ]

  return NextResponse.json({
    checks,
    start_date: p.start_date ?? null,
    ready: checks.filter(c => c.ok).length,
    total: checks.length,
    // The keys the browser has to name back on the PATCH that goes Active.
    // Sent rather than inferred, so the screen and the gate agree by
    // construction instead of by both being written carefully.
    acknowledge: checks.filter((c: any) => !c.ok && c.serious).map(c => c.key),
  })
}
