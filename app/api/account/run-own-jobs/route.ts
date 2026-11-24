import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { subAccountState } from '@/lib/sub-account'
import { moveGuestToOwnCompany } from '@/lib/vendor-link-db'
import { SUB_TRIAL_DAYS } from '@/lib/plans'
import { trialEnd } from '@/lib/billing-state'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// POST /api/account/run-own-jobs - the "Run your own jobs" button
// (lib/sub-account.ts).
//
// It touches only the caller's OWN company, resolved from the token - never an
// id from the body - so it is a sign-in-only route on the personal list
// (lib/__tests__/signed-in-only.ts):
//
//   invited_only  the company's ADMIN flips it open. Anybody else at the
//                 company is told who can; the business's shape is the
//                 owner's decision, not a crew member's
//   guest         the person in the old Directory seat gets a company of his
//                 own; only his login moves (lib/vendor-link-db.ts)
//   open          nothing to do
//
// IT STARTS A TRIAL OF SUB_TRIAL_DAYS (30), the owner's call. Until now a
// sub's company carried no billing row - unmetered, because a sub owns no
// jobs. Running his own jobs is the thing the plans meter, so it is metered
// from here, the same as a GC's. The trial row is inserted only if none
// exists (`ignoreDuplicates`): a company that already has a billing story
// keeps it. And whatever happens to that trial, the work he does on a GC's
// job is governed by the GC's plan, never his (lib/api-guard.ts).
//
// The button is never shown in the iOS build (components/my-jobs/
// run-own-jobs-card.tsx): a trial that ends in "choose a plan" is the
// purchase 3.1.3(f) keeps out of the app.
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profile } = await db.from('profiles').select('company_id, role').eq('id', user.id).maybeSingle()
  if (!profile?.company_id) return NextResponse.json({ error: 'No company found for your account.' }, { status: 400 })

  const { data: company, error } = await db.from('companies')
    .select('id, type, invited_only, added_by_company_id').eq('id', profile.company_id).maybeSingle()
  if (error || !company) return NextResponse.json({ error: 'Could not load your company just now. Try again.' }, { status: 500 })

  const state = subAccountState(company as any)
  if (state === 'open') return NextResponse.json({ ok: true, state: 'open' })

  if (state === 'invited_only') {
    if (profile.role !== 'admin') {
      return NextResponse.json({ error: 'Your company admin can turn this on.' }, { status: 403 })
    }
    const { error: upErr } = await db.from('companies')
      .update({ invited_only: false, upgraded_at: new Date().toISOString() })
      .eq('id', company.id).eq('invited_only', true)
    if (upErr) {
      console.error('[run-own-jobs] update failed', { company: company.id, error: upErr.message })
      return NextResponse.json({ error: 'Could not turn that on just now. Try again.' }, { status: 500 })
    }
    await startTrial(db, company.id)
    return NextResponse.json({ ok: true, state: 'open', trial_days: SUB_TRIAL_DAYS })
  }

  const moved = await moveGuestToOwnCompany(db, { id: user.id, email: user.email }, company.id)
  if (!moved.ok) return NextResponse.json({ error: moved.message }, { status: 409 })
  await startTrial(db, moved.companyId)
  return NextResponse.json({ ok: true, state: 'open', company_id: moved.companyId, moved: true, trial_days: SUB_TRIAL_DAYS })
}

/**
 * The trial row, once. A failure is logged and does not undo the switch: no
 * row is UNMETERED, the permissive side (CLAUDE.md, billing), and the console
 * shows a company without one.
 */
async function startTrial(db: ReturnType<typeof admin>, companyId: string) {
  const now = new Date()
  const { error } = await db.from('company_billing').upsert({
    company_id: companyId,
    status: 'trialing',
    trial_started_at: now.toISOString(),
    trial_ends_at: trialEnd(now, SUB_TRIAL_DAYS).toISOString(),
  }, { onConflict: 'company_id', ignoreDuplicates: true })
  if (error) console.error('[run-own-jobs] could not start the trial', { company: companyId, error: error.message })
}
