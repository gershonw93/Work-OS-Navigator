import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { subAccountState } from '@/lib/sub-account'
import { moveGuestToOwnCompany } from '@/lib/vendor-link-db'

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
// Free: a sub's company carries no billing row, and this adds none.
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
    return NextResponse.json({ ok: true, state: 'open' })
  }

  const moved = await moveGuestToOwnCompany(db, { id: user.id, email: user.email }, company.id)
  if (!moved.ok) return NextResponse.json({ error: moved.message }, { status: 409 })
  return NextResponse.json({ ok: true, state: 'open', company_id: moved.companyId, moved: true })
}
