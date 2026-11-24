import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { linkTeamRows } from '@/lib/my-jobs'
import { acceptedRole, inviteMove } from '@/lib/personal-access'
import { isVendorInvite } from '@/lib/vendor-link'
import { acceptVendorInvite } from '@/lib/vendor-link-db'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

type Invite = { id: string; company_id: string; role: string | null; status: string; audience: string | null; created_at: string }
type Target = { id: string; name: string; type: string | null; added_by_company_id: string | null }

async function signedIn(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return null
  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  return user?.email ? { db, user } : null
}

/** The caller's pending invites, each with the company it points at. */
async function pendingFor(db: ReturnType<typeof admin>, email: string) {
  const { data: invites } = await db
    .from('company_invites')
    .select('id, company_id, role, status, audience, created_at')
    .eq('email', email)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  const list = (invites ?? []) as Invite[]
  const ids = Array.from(new Set(list.map(i => i.company_id).filter(Boolean)))
  const { data: targets } = ids.length
    ? await db.from('companies').select('id, name, type, added_by_company_id').in('id', ids)
    : { data: [] as Target[] }
  const byId = new Map(((targets ?? []) as Target[]).map(t => [t.id, t]))
  return list.map(i => ({ invite: i, target: byId.get(i.company_id) ?? null, vendor: isVendorInvite(i, byId.get(i.company_id) ?? null) }))
}

async function markAnswered(db: ReturnType<typeof admin>, invite: Invite, email: string, status: 'accepted' | 'declined') {
  // Every pending row for this email and Directory entry (covers resends).
  await db.from('company_invites')
    .update({ status, answered_at: new Date().toISOString() })
    .eq('company_id', invite.company_id).eq('email', email).eq('status', 'pending')
}

// GET /api/invite/accept - the vendor invites waiting on this person's answer:
// what the "Connect with <GC>" card shows. A team invite is never listed: it
// is answered by signing up from its own link, as it always was.
export async function GET(request: Request) {
  const who = await signedIn(request)
  if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, user } = who
  const pending = (await pendingFor(db, user.email!)).filter(p => p.vendor && p.target?.added_by_company_id)
  const gcIds = Array.from(new Set(pending.map(p => p.target!.added_by_company_id!)))
  const { data: gcs } = gcIds.length ? await db.from('companies').select('id, name').in('id', gcIds) : { data: [] }
  const gcName = new Map(((gcs ?? []) as { id: string; name: string }[]).map(g => [g.id, g.name]))
  return NextResponse.json({
    invites: pending.map(p => ({
      id: p.invite.id,
      gc_name: gcName.get(p.target!.added_by_company_id!) ?? 'A contractor',
      listed_as: p.target!.name,
      created_at: p.invite.created_at,
    })),
  })
}

// POST /api/invite/accept
//
// TWO CALLERS, TWO MEANINGS.
//
//   No body - right after somebody sets a password from an invite email, and
//   on every password reset (that page calls it too). A TEAM invite is
//   accepted here as it always was. A VENDOR invite is accepted here only for
//   somebody with no company yet: setting a password from that email is them
//   saying yes, and the answer is their OWN company, linked to the GC's
//   Directory row (lib/vendor-link.ts). Somebody who already runs a company is
//   never linked by a password reset - their invites wait for the card.
//
//   { invite_id, decision } - the card. Accept links; decline closes it.
//
// Idempotent and safe on any sign-in: with nothing pending it reports nothing
// to do.
export async function POST(request: Request) {
  const who = await signedIn(request)
  if (!who) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { db, user } = who
  const email = user.email!
  const fullName = (user.user_metadata?.full_name as string) ?? ''
  const body = await request.json().catch(() => ({} as any))

  const pending = await pendingFor(db, email)

  // ── the card: one named vendor invite, answered explicitly ──────────────
  if (body?.invite_id) {
    const found = pending.find(p => p.invite.id === body.invite_id)
    if (!found || !found.vendor) return NextResponse.json({ error: 'That invite is no longer waiting for you.' }, { status: 404 })
    if (body.decision === 'decline') {
      await markAnswered(db, found.invite, email, 'declined')
      return NextResponse.json({ accepted: false, declined: true })
    }
    if (body.decision !== 'accept') return NextResponse.json({ error: 'Accept or decline?' }, { status: 400 })
    const out = await acceptVendorInvite(db, { id: user.id, email, fullName }, found.invite.company_id)
    if (!out.ok) {
      console.warn('[invite/accept] vendor link refused', { user: user.id, invite: found.invite.id, reason: out.reason })
      return NextResponse.json({ accepted: false, reason: out.reason, error: out.message }, { status: out.reason === 'failed' ? 500 : 409 })
    }
    await markAnswered(db, found.invite, email, 'accepted')
    await linkTeamRows(db, user.id, email)
    return NextResponse.json({ accepted: true, company_id: out.companyId, created: out.created, moved: out.moved })
  }

  // ── a sign-in: a team invite first, as before ───────────────────────────
  const team = pending.find(p => !p.vendor)
  const { data: existing } = await db.from('profiles').select('id, role, company_id').eq('id', user.id).maybeSingle()

  if (team) {
    const invite = team.invite
    // Somebody who already belongs to ANOTHER company is never moved by an
    // invite (`inviteMove`). The invite stays pending so the inviter still sees
    // it, and the person keeps the company they are in.
    if (inviteMove(existing, invite) === 'blocked') {
      console.warn(`[invite/accept] ${user.id} is in another company; invite ${invite.id} left pending`)
      return NextResponse.json({ accepted: false, reason: 'other_company' })
    }
    const role = invite.role ?? 'read_only'
    if (existing) {
      const patch: Record<string, unknown> = { company_id: invite.company_id, email }
      // Kept only when THIS company set it - see `acceptedRole`.
      const write = acceptedRole(existing, invite)
      if (write) patch.role = write
      await db.from('profiles').update(patch).eq('id', user.id)
    } else {
      await db.from('profiles').upsert({ id: user.id, email, full_name: fullName, company_id: invite.company_id, role })
    }
    // CLAIM THE TEAM ROWS SOMEBODY TYPED FOR THEM BEFORE THEY HAD AN ACCOUNT.
    // Never fatal: logged, not thrown.
    const linked = await linkTeamRows(db, user.id, email)
    if (linked) console.log(`[invite/accept] linked ${linked} team row(s) to ${user.id}`)
    await markAnswered(db, invite, email, 'accepted')
    return NextResponse.json({ accepted: true, company_id: invite.company_id, role, linked })
  }

  // ── a vendor invite, for somebody with no company yet ───────────────────
  const vendor = pending.find(p => p.vendor)
  if (!vendor) return NextResponse.json({ accepted: false })
  if (existing?.company_id) {
    // An existing business answers on the card, never by resetting a password.
    return NextResponse.json({ accepted: false, waiting: pending.filter(p => p.vendor).length })
  }
  const out = await acceptVendorInvite(db, { id: user.id, email, fullName }, vendor.invite.company_id)
  if (!out.ok) {
    console.warn('[invite/accept] vendor link refused', { user: user.id, invite: vendor.invite.id, reason: out.reason })
    return NextResponse.json({ accepted: false, reason: out.reason, error: out.message })
  }
  await markAnswered(db, vendor.invite, email, 'accepted')
  const linked = await linkTeamRows(db, user.id, email)
  return NextResponse.json({ accepted: true, company_id: out.companyId, created: out.created, linked })
}
