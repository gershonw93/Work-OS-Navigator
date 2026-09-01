import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { mayTransferOwnership } from '@/lib/company-owner'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/**
 * Hand ownership of the company to another admin.
 *
 * Ownership exists so an admin cannot remove the founder (#354). That
 * protection on its own would be a dead end - an owner who leaves the company
 * could never be removed by anyone, and no one else could ever become owner -
 * so it has to be possible to pass on.
 *
 * Only the owner can do it, and only to somebody who is already an admin.
 * Ownership carries the ability to remove every other admin; handing it to a
 * worker would be a promotion and a transfer in one click.
 */
export async function POST(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { memberId } = await request.json().catch(() => ({} as any))
  if (!memberId) return NextResponse.json({ error: 'No member given.' }, { status: 400 })

  const { data: caller } = await db
    .from('profiles').select('id, role, company_id').eq('id', user.id).single()
  if (!caller?.company_id) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: target } = await db
    .from('profiles').select('id, company_id, role, full_name').eq('id', memberId).single()
  if (!target || target.company_id !== caller.company_id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  // A failed read is not "no owner" - see readOwner in the members route.
  const { data: company, error: companyError } = await db
    .from('companies').select('owner_id').eq('id', caller.company_id).single()

  const verdict = mayTransferOwnership({
    callerId: caller.id,
    callerRole: caller.role ?? '',
    targetId: memberId,
    targetRole: (target as any).role ?? '',
    ownerId: companyError ? null : ((company as any)?.owner_id ?? null),
    ownerKnown: !companyError,
  })
  if (!verdict.ok) return NextResponse.json({ error: verdict.error }, { status: 403 })

  const { error } = await db
    .from('companies').update({ owner_id: memberId }).eq('id', caller.company_id)
  if (error) {
    console.error('[POST /api/settings/company/owner]', error)
    return NextResponse.json({ error: 'Could not transfer ownership.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, ownerId: memberId, ownerName: (target as any).full_name ?? null })
}
