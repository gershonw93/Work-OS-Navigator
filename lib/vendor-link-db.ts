import type { SupabaseClient } from '@supabase/supabase-js'
import { linkPlan, LINK_REFUSAL_TEXT, type LinkRefusal, type VendorRow } from './vendor-link'

// ─────────────────────────────────────────────────────────────────────────────
// The writes behind `linkPlan` (lib/vendor-link.ts). Nothing here decides
// anything the plan has not already decided.
//
// THE LINK IS ONE CONDITIONAL UPDATE: `linked_company_id IS NULL` in the WHERE,
// so two accepts racing for one Directory row cannot both win - the loser
// re-reads and is told whose it is. And the unique index (one link per GC per
// company, migration 169) answers 23505 when this GC already has the business
// under another entry: a refusal with a sentence, never a 500.
// ─────────────────────────────────────────────────────────────────────────────

export type AcceptOutcome =
  | { ok: true; companyId: string; created: boolean; moved: boolean }
  | { ok: false; reason: LinkRefusal | 'duplicate_entry' | 'failed'; message: string }

type Profile = { id: string; company_id: string | null; role?: string | null } | null

const SEAT_TAKEN = 'Your company already has its own SyteNav account, set up by a colleague. Ask them to add you to their team.'

const ROW_COLS = 'id, name, type, trade, phone, added_by_company_id, linked_company_id'

export async function linkRow(db: SupabaseClient, rowId: string, companyId: string, userId: string): Promise<'linked' | 'already' | 'row_taken' | 'duplicate_entry' | 'failed'> {
  const { data, error } = await db.from('companies')
    .update({ linked_company_id: companyId, linked_at: new Date().toISOString(), linked_by: userId })
    .eq('id', rowId).is('linked_company_id', null)
    .select('id')
  if (error) {
    if ((error as any).code === '23505') return 'duplicate_entry'
    console.error('[vendor-link] link failed', { rowId, error: error.message })
    return 'failed'
  }
  if (data?.length) return 'linked'
  const { data: now } = await db.from('companies').select('linked_company_id').eq('id', rowId).maybeSingle()
  return (now as any)?.linked_company_id === companyId ? 'already' : 'row_taken'
}

/** His own company, born from what the GC typed about him - light until he says otherwise. */
export async function createOwnCompany(
  db: SupabaseClient,
  from: { name: string; type: string | null; trade: string | null; phone: string | null },
  email: string,
  opts: { invitedOnly?: boolean } = {},
): Promise<string | null> {
  const { data, error } = await db.from('companies').insert({
    name: from.name,
    type: from.type === 'supplier' ? 'supplier' : 'subcontractor',
    trade: from.trade,
    phone: from.phone,
    contact_email: email,
    // Born light: GC work only, until "Run your own jobs" (lib/sub-account.ts).
    // No company_billing row - a sub is unmetered (CLAUDE.md, billing).
    invited_only: opts.invitedOnly !== false,
    upgraded_at: opts.invitedOnly === false ? new Date().toISOString() : null,
  }).select('id').single()
  if (error || !data) {
    console.error('[vendor-link] company create failed', error?.message)
    return null
  }
  return (data as { id: string }).id
}

const refuse = (reason: LinkRefusal | 'duplicate_entry' | 'failed'): AcceptOutcome => ({
  ok: false, reason,
  message: reason === 'failed' ? 'Could not connect your company just now. Try again.' : LINK_REFUSAL_TEXT[reason],
})

/**
 * Accept one vendor invite for this person: the plan, then its writes.
 * `fullName` and `email` come off the AUTHENTICATED user, never a body.
 */
export async function acceptVendorInvite(
  db: SupabaseClient,
  user: { id: string; email: string; fullName: string },
  rowId: string,
): Promise<AcceptOutcome> {
  const [{ data: row }, { data: profile }] = await Promise.all([
    db.from('companies').select(ROW_COLS).eq('id', rowId).maybeSingle(),
    db.from('profiles').select('id, company_id, role').eq('id', user.id).maybeSingle(),
  ])
  if (!row) return refuse('not_a_directory_row')
  const mine = (profile as Profile)?.company_id ?? null
  const { data: myCompany } = mine
    ? await db.from('companies').select(ROW_COLS).eq('id', mine).maybeSingle()
    : { data: null }

  const plan = linkPlan({
    companyId: mine,
    companyType: (myCompany as any)?.type ?? null,
    companyIsDirectoryRow: !!(myCompany as any)?.added_by_company_id,
  }, row as VendorRow)

  if (plan.do === 'refuse') return refuse(plan.reason)
  if (plan.do === 'already') return { ok: true, companyId: mine ?? rowId, created: false, moved: false }

  let companyId = mine
  let created = false
  let moved = false

  if (plan.do === 'move_and_link' && (myCompany as any)?.linked_company_id) {
    return { ok: false, reason: 'row_taken', message: SEAT_TAKEN }
  }

  if (plan.do === 'create_company' || plan.do === 'move_and_link') {
    // For a guest moving out, his company is born from the row he sat in; for
    // a new person, from the row he was invited to. Same shape either way.
    const from = (plan.do === 'move_and_link' ? myCompany : row) as any
    const own = await createOwnCompany(db, { name: from.name, type: from.type, trade: from.trade ?? null, phone: from.phone ?? null }, user.email)
    if (!own) return refuse('failed')
    const { error: pErr } = profile
      ? await db.from('profiles').update({ company_id: own, role: 'admin' }).eq('id', user.id)
      : await db.from('profiles').upsert({ id: user.id, email: user.email, full_name: user.fullName, company_id: own, role: 'admin' })
    if (pErr) {
      console.error('[vendor-link] profile write failed', { user: user.id, error: pErr.message })
      await db.from('companies').delete().eq('id', own)   // nothing points at it yet
      return refuse('failed')
    }
    companyId = own
    created = true
    if (plan.do === 'move_and_link') {
      // The seat he left keeps every record it holds and points at him now.
      moved = true
      const back = await linkRow(db, mine!, own, user.id)
      if (back !== 'linked' && back !== 'already') console.error('[vendor-link] old seat not linked', { row: mine, back })
    }
  }

  const res = await linkRow(db, rowId, companyId!, user.id)
  if (res === 'linked' || res === 'already') return { ok: true, companyId: companyId!, created, moved }
  return refuse(res)
}

/**
 * "Run your own jobs" for somebody whose login sits INSIDE a GC's Directory
 * row (the old invite's seat): a company of his own, his login moved to it as
 * its admin, and the row he sat in linked to it - so every record it holds
 * stays the GC's and stays reachable. Nothing else moves.
 */
export async function moveGuestToOwnCompany(
  db: SupabaseClient,
  user: { id: string; email: string },
  seatId: string,
): Promise<{ ok: true; companyId: string } | { ok: false; message: string }> {
  const { data: seat } = await db.from('companies').select(ROW_COLS).eq('id', seatId).maybeSingle()
  if (!seat) return { ok: false, message: 'Could not find your company just now. Try again.' }
  // Somebody from this seat already moved out, and the row links to THEIR
  // company. A second company could not be linked to it, so the second person
  // would lose that contractor's jobs; they join the first one's team instead.
  if ((seat as any).linked_company_id) return { ok: false, message: SEAT_TAKEN }
  const own = await createOwnCompany(db, {
    name: (seat as any).name, type: (seat as any).type, trade: (seat as any).trade ?? null, phone: (seat as any).phone ?? null,
  }, user.email, { invitedOnly: false })
  if (!own) return { ok: false, message: 'Could not set up your company just now. Try again.' }
  const { error } = await db.from('profiles').update({ company_id: own, role: 'admin' }).eq('id', user.id).eq('company_id', seatId)
  if (error) {
    console.error('[vendor-link] guest move failed', { user: user.id, error: error.message })
    await db.from('companies').delete().eq('id', own)
    return { ok: false, message: 'Could not set up your company just now. Try again.' }
  }
  const back = await linkRow(db, seatId, own, user.id)
  if (back !== 'linked' && back !== 'already') console.error('[vendor-link] old seat not linked', { seat: seatId, back })
  return { ok: true, companyId: own }
}
