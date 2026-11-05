import type { SupabaseClient } from '@supabase/supabase-js'
import type { PermitItem, PermitRound, PermitShare } from '@/lib/permit-rounds'
import type { PermitReply } from '@/lib/permit-reply'

// The ONE reader for permits' rounds and items - the Permits tab and the
// development board read through it, so the two screens cannot be built from
// different columns. `ok: false` means the read failed and the empty lists
// mean nothing; a caller must say so rather than render "nothing logged".

export const ROUND_SELECT = 'id, permit_id, submitted_on, submitted_note, expected_by, sent_files, outcome, outcome_on, outcome_note, received_files, created_by_name, outcome_by_name, created_at'
export const ITEM_SELECT = 'id, permit_id, round_id, label, files, done_at, done_by_name, created_at'

export async function permitHistory(db: SupabaseClient, permitIds: string[]):
  Promise<{ rounds: PermitRound[]; items: PermitItem[]; shares: PermitShare[]; replies: PermitReply[]; ok: boolean }> {
  if (!permitIds.length) return { rounds: [], items: [], shares: [], replies: [], ok: true }
  const [r, i, sh, rp] = await Promise.all([
    db.from('permit_rounds').select(ROUND_SELECT).in('permit_id', permitIds),
    db.from('permit_items').select(ITEM_SELECT).in('permit_id', permitIds).order('created_at', { ascending: true }),
    // The links sent from these permits, with what came back on them - the
    // other half of the back and forth, which used to sit in the Sharing tab
    // knowing nothing about the permit it was for.
    db.from('file_shares')
      .select('id, permit_id, name, recipient_name, recipient_email, status, created_at, viewed_at, responded_at, revoked_at, file_share_uploads ( id, name, file_url, file_type, size_bytes, note, created_at )')
      .in('permit_id', permitIds).order('created_at', { ascending: true }),
    // What the township emailed back to the permit's own address.
    db.from('permit_inbound_emails')
      .select('id, permit_id, from_email, from_name, subject, text_body, attachments, received_at, forwarded_to, suggestion, suggestion_status, used_at')
      .in('permit_id', permitIds).order('received_at', { ascending: true }),
  ])
  if (r.error) console.error('[permit-history] rounds read failed', r.error.message)
  if (i.error) console.error('[permit-history] items read failed', i.error.message)
  if (sh.error) console.error('[permit-history] shares read failed', sh.error.message)
  if (rp.error) console.error('[permit-history] replies read failed', rp.error.message)
  if (r.error || i.error || sh.error || rp.error) return { rounds: [], items: [], shares: [], replies: [], ok: false }
  const shares: PermitShare[] = (sh.data ?? []).map((x: any) => ({
    id: x.id, permit_id: x.permit_id, name: x.name, recipient_name: x.recipient_name, recipient_email: x.recipient_email,
    status: x.status, created_at: x.created_at, viewed_at: x.viewed_at, responded_at: x.responded_at, revoked_at: x.revoked_at,
    uploads: (x.file_share_uploads ?? []).map((u: any) => ({
      id: u.id, name: u.name, url: u.file_url, type: u.file_type ?? null, size: u.size_bytes ?? null, note: u.note ?? null, created_at: u.created_at,
    })),
  }))
  return { rounds: (r.data ?? []) as PermitRound[], items: (i.data ?? []) as PermitItem[], shares, replies: (rp.data ?? []) as PermitReply[], ok: true }
}
