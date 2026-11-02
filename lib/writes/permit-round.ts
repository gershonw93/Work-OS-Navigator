import type { SupabaseClient } from '@supabase/supabase-js'
import { logActivity } from '@/lib/log-activity'
import { friendlyDbError } from '@/lib/db-error'
import {
  carryableFiles, cleanItems, finalFileAfter, outcomeProblem, statusAfter, submitProblem,
  OUTCOME_LABEL, type Outcome, type PermitRound, type RoundFile,
} from '@/lib/permit-rounds'
import { ROUND_SELECT } from '@/lib/permit-history'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Logging a submission, recording the answer, and ticking off what was asked.
// The ONE home for all three: a permit's own panel and the development board's
// bulk actions both call these, so a bulk submit cannot skip a rule the single
// one asks. Every function checks the permit belongs to the project it was
// asked through - the route gates the project, this gates the row.
//
// Rules live in lib/permit-rounds.ts (pure). The status column moves only
// through `statusAfter`, so the dropdown and the history cannot disagree.
// ─────────────────────────────────────────────────────────────────────────────


type Upload = () => Promise<{ files: RoundFile[] } | { error: string }>

async function actorName(db: SupabaseClient, userId: string, via?: string) {
  const { data } = await db.from('profiles').select('full_name').eq('id', userId).maybeSingle()
  return withVia((data as any)?.full_name ?? 'Someone', via)
}

type Read<T> = { ok: false; fail: WriteResult } | ({ ok: true } & T)

async function permitOnJob(db: SupabaseClient, projectId: string, permitId: string): Promise<Read<{ permit: any }>> {
  const { data, error } = await db
    .from('permits')
    .select('id, project_id, permit_type, permit_number, description, issuing_authority, status, issued_date, expiry_date')
    .eq('id', permitId)
    .eq('project_id', projectId)
    .maybeSingle()
  if (error) {
    console.error('[permit-round] permit read failed', error.message)
    return { ok: false, fail: { status: 500, body: { error: 'Could not read the permit. Try again.' } } }
  }
  if (!data) return { ok: false, fail: { status: 404, body: { error: 'That permit is not on this job.' } } }
  return { ok: true, permit: data as any }
}

async function roundsOf(db: SupabaseClient, permitId: string): Promise<Read<{ rounds: PermitRound[] }>> {
  const { data, error } = await db.from('permit_rounds').select(ROUND_SELECT).eq('permit_id', permitId)
  // A failed read must not look like "no rounds" - that would let a second
  // open round through the rule that refuses it.
  if (error) {
    console.error('[permit-round] rounds read failed', error.message)
    return { ok: false, fail: { status: 500, body: { error: 'Could not read this permit\'s history. Try again.' } } }
  }
  return { ok: true, rounds: (data ?? []) as PermitRound[] }
}

const label = (p: { permit_type: string; permit_number?: string | null }) =>
  `${p.permit_type}${p.permit_number ? ' #' + p.permit_number : ''}`

export async function submitRound(
  db: SupabaseClient,
  { userId, projectId, permitId, fields, uploadFiles, via, carry }: {
    userId: string; projectId: string; permitId: string
    fields: { submitted_on?: string | null; expected_by?: string | null; note?: string | null }
    uploadFiles?: Upload; via?: string
    /** URLs of fixes already attached to this permit's items, going in with this round. */
    carry?: string[]
  },
): Promise<WriteResult> {
  const found = await permitOnJob(db, projectId, permitId)
  if (!found.ok) return found.fail
  const history = await roundsOf(db, permitId)
  if (!history.ok) return history.fail

  const problem = submitProblem(fields, history.rounds)
  if (problem) return { status: 400, body: { error: problem } }

  // A carried file comes OFF THE ROW, never the request: only a fix attached
  // to one of this permit's own items, not yet sent, is accepted. A URL from a
  // body would otherwise put any link at all into a record other people open.
  let carried: RoundFile[] = []
  if (carry?.length) {
    const { data: itemRows, error: itemsErr } = await db.from('permit_items').select('label, files').eq('permit_id', permitId)
    if (itemsErr) {
      console.error('[permit-round] items read failed', itemsErr.message)
      return { status: 500, body: { error: 'Could not read the fixes on this permit. Try again.' } }
    }
    const allowed = new Map(carryableFiles((itemRows ?? []) as any[], history.rounds).map(f => [f.url, f]))
    carried = carry.filter(u => allowed.has(u)).map(u => {
      const { item: _item, ...f } = allowed.get(u)!
      return f
    })
  }

  let sent_files: RoundFile[] = [...carried]
  if (uploadFiles) {
    const up = await uploadFiles()
    if ('error' in up) return { status: 500, body: { error: up.error } }
    sent_files = [...carried, ...up.files]
  }

  const name = await actorName(db, userId, via)
  const { data: round, error } = await db.from('permit_rounds').insert({
    permit_id: permitId,
    project_id: projectId,
    submitted_on: fields.submitted_on,
    expected_by: fields.expected_by || null,
    submitted_note: fields.note?.trim() || null,
    sent_files,
    created_by: userId,
    created_by_name: name,
  }).select(ROUND_SELECT).single()

  if (error) {
    // The one-open-round index: another press, another tab or another house
    // in the same bulk got there first. Not an error to show as one.
    if ((error as any).code === '23505') {
      return { status: 409, body: { error: 'It is already with the reviewer. Record their answer first.' } }
    }
    console.error('[permit-round] submit failed', error.message)
    return { status: 500, body: { error: friendlyDbError(error) } }
  }

  const next = statusAfter('submitted', found.permit.status, history.rounds)
  if (next) await db.from('permits').update({ status: next }).eq('id', permitId)

  const n = history.rounds.length + 1
  await logActivity(db, projectId, name, 'permit_submitted',
    `${n > 1 ? `Resubmitted (round ${n})` : 'Submitted'}: ${label(found.permit)}`,
    { permit_id: permitId, round_id: (round as any).id })

  return { status: 201, body: { round } }
}

export async function answerRound(
  db: SupabaseClient,
  { userId, projectId, permitId, roundId, fields, uploadFiles, via, shareUploadIds }: {
    userId: string; projectId: string; permitId: string; roundId: string
    fields: {
      outcome?: string | null; outcome_on?: string | null; note?: string | null
      items?: string[] | null; permit_number?: string | null; issued_date?: string | null
      expiry_date?: string | null
    }
    uploadFiles?: Upload; via?: string
    /** Files the reviewer sent back through a share link made from THIS permit. */
    shareUploadIds?: string[]
  },
): Promise<WriteResult> {
  const found = await permitOnJob(db, projectId, permitId)
  if (!found.ok) return found.fail
  const history = await roundsOf(db, permitId)
  if (!history.ok) return history.fail
  const round = history.rounds.find(r => r.id === roundId) ?? null

  const problem = outcomeProblem(fields, round, found.permit)
  if (problem) return { status: 400, body: { error: problem } }
  const outcome = fields.outcome as Outcome

  // What came back through a link sent from this permit. Looked up through the
  // SHARE's permit, never taken from the body: an upload id from another job's
  // link must not become this permit's paperwork.
  let fromLinks: RoundFile[] = []
  if (shareUploadIds?.length) {
    const { data: ups, error: upErr } = await db.from('file_share_uploads')
      .select('id, name, file_url, file_type, size_bytes, file_shares!inner ( permit_id )')
      .in('id', shareUploadIds).eq('file_shares.permit_id', permitId)
    if (upErr) {
      console.error('[permit-round] share uploads read failed', upErr.message)
      return { status: 500, body: { error: 'Could not read the files that came back through the link. Try again.' } }
    }
    fromLinks = (ups ?? []).map((u: any) => ({ name: u.name, url: u.file_url, type: u.file_type ?? null, size: u.size_bytes ?? null }))
  }

  let received_files: RoundFile[] = [...fromLinks]
  if (uploadFiles) {
    const up = await uploadFiles()
    if ('error' in up) return { status: 500, body: { error: up.error } }
    received_files = [...fromLinks, ...up.files]
  }

  const name = await actorName(db, userId, via)
  // Claimed by ONE conditional update: two people recording an answer to the
  // same round at once - one wins, the other is told.
  const { data: saved, error } = await db.from('permit_rounds').update({
    outcome,
    outcome_on: fields.outcome_on,
    outcome_note: fields.note?.trim() || null,
    received_files,
    outcome_by_name: name,
  }).eq('id', roundId).eq('permit_id', permitId).is('outcome', null).select(ROUND_SELECT).maybeSingle()

  if (error) {
    console.error('[permit-round] answer failed', error.message)
    return { status: 500, body: { error: friendlyDbError(error) } }
  }
  if (!saved) return { status: 409, body: { error: 'Somebody already recorded an answer to that submission.' } }

  if (outcome === 'corrections') {
    const rows = cleanItems(fields.items).map(l => ({
      permit_id: permitId, round_id: roundId, label: l, created_by_name: name,
    }))
    const { error: itemsErr } = await db.from('permit_items').insert(rows)
    if (itemsErr) {
      // The answer is recorded; the list is the part that did not land. Say
      // so rather than reporting success over a permit with nothing to fix.
      console.error('[permit-round] items insert failed', itemsErr.message)
      return { status: 207, body: { round: saved, error: 'The answer was saved but the list of corrections was not. Add them on the permit.' } }
    }
  }

  const permitPatch: Record<string, unknown> = {}
  const next = statusAfter(outcome, found.permit.status, history.rounds.filter(r => r.id !== roundId))
  if (next) permitPatch.status = next
  if (outcome === 'approved') {
    if (fields.permit_number?.trim()) permitPatch.permit_number = fields.permit_number.trim()
    if (fields.issued_date) permitPatch.issued_date = fields.issued_date
    if (fields.expiry_date && /^\d{4}-\d{2}-\d{2}$/.test(fields.expiry_date)) permitPatch.expiry_date = fields.expiry_date
    // The latest approved file IS the permit: it becomes the main document,
    // which is what the Permits list, the client portal and Files show.
    const final = finalFileAfter(outcome, received_files)
    if (final) permitPatch.file_url = final
  }
  if (Object.keys(permitPatch).length) {
    const { error: pErr } = await db.from('permits').update(permitPatch).eq('id', permitId)
    if (pErr) console.error('[permit-round] permit status update failed', pErr.message)
  }

  await logActivity(db, projectId, name, 'permit_answered',
    `${OUTCOME_LABEL[outcome]}: ${label({ ...found.permit, ...permitPatch })}`,
    { permit_id: permitId, round_id: roundId, outcome })

  return { status: 200, body: { round: saved } }
}

export async function addPermitItem(
  db: SupabaseClient,
  { userId, projectId, permitId, label: raw, via }: { userId: string; projectId: string; permitId: string; label?: string | null; via?: string },
): Promise<WriteResult> {
  const found = await permitOnJob(db, projectId, permitId)
  if (!found.ok) return found.fail
  const [text] = cleanItems([raw ?? ''])
  if (!text) return { status: 400, body: { error: 'Say what they asked for.' } }
  const name = await actorName(db, userId, via)
  const { data, error } = await db.from('permit_items')
    .insert({ permit_id: permitId, label: text, created_by_name: name })
    .select('id, permit_id, round_id, label, files, done_at, done_by_name, created_at').single()
  if (error) {
    console.error('[permit-round] item add failed', error.message)
    return { status: 500, body: { error: friendlyDbError(error) } }
  }
  return { status: 201, body: { item: data } }
}

export async function setPermitItemDone(
  db: SupabaseClient,
  { userId, projectId, permitId, itemId, done, via }: { userId: string; projectId: string; permitId: string; itemId: string; done: boolean; via?: string },
): Promise<WriteResult> {
  const found = await permitOnJob(db, projectId, permitId)
  if (!found.ok) return found.fail
  const name = done ? await actorName(db, userId, via) : null
  const { data, error } = await db.from('permit_items')
    .update({ done_at: done ? new Date().toISOString() : null, done_by_name: name })
    .eq('id', itemId).eq('permit_id', permitId)
    .select('id, permit_id, round_id, label, files, done_at, done_by_name, created_at').maybeSingle()
  if (error) {
    console.error('[permit-round] item update failed', error.message)
    return { status: 500, body: { error: friendlyDbError(error) } }
  }
  if (!data) return { status: 404, body: { error: 'That item is not on this permit.' } }
  return { status: 200, body: { item: data } }
}

export async function removePermitItem(
  db: SupabaseClient,
  { projectId, permitId, itemId }: { projectId: string; permitId: string; itemId: string },
): Promise<WriteResult> {
  const found = await permitOnJob(db, projectId, permitId)
  if (!found.ok) return found.fail
  const { error } = await db.from('permit_items').delete().eq('id', itemId).eq('permit_id', permitId)
  if (error) {
    console.error('[permit-round] item delete failed', error.message)
    return { status: 500, body: { error: friendlyDbError(error) } }
  }
  return { status: 200, body: { success: true } }
}

export async function attachItemFiles(
  db: SupabaseClient,
  { projectId, permitId, itemId, uploadFiles }: { projectId: string; permitId: string; itemId: string; uploadFiles?: Upload },
): Promise<WriteResult> {
  const found = await permitOnJob(db, projectId, permitId)
  if (!found.ok) return found.fail
  if (!uploadFiles) return { status: 400, body: { error: 'Pick a file to attach.' } }
  const { data: item, error } = await db.from('permit_items').select('id, files').eq('id', itemId).eq('permit_id', permitId).maybeSingle()
  if (error) {
    console.error('[permit-round] item read failed', error.message)
    return { status: 500, body: { error: 'Could not read that item. Try again.' } }
  }
  if (!item) return { status: 404, body: { error: 'That item is not on this permit.' } }
  const up = await uploadFiles()
  if ('error' in up) return { status: 500, body: { error: up.error } }
  const files = [...(((item as any).files ?? []) as RoundFile[]), ...up.files]
  const { data, error: saveErr } = await db.from('permit_items').update({ files })
    .eq('id', itemId).eq('permit_id', permitId)
    .select('id, permit_id, round_id, label, files, done_at, done_by_name, created_at').single()
  if (saveErr) {
    console.error('[permit-round] item files save failed', saveErr.message)
    return { status: 500, body: { error: friendlyDbError(saveErr) } }
  }
  return { status: 200, body: { item: data } }
}

/** Take one file off an item. A file already sent with a round stays in that round's record. */
export async function removeItemFile(
  db: SupabaseClient,
  { projectId, permitId, itemId, url }: { projectId: string; permitId: string; itemId: string; url?: string | null },
): Promise<WriteResult> {
  const found = await permitOnJob(db, projectId, permitId)
  if (!found.ok) return found.fail
  const { data: item, error } = await db.from('permit_items').select('id, files').eq('id', itemId).eq('permit_id', permitId).maybeSingle()
  if (error) {
    console.error('[permit-round] item read failed', error.message)
    return { status: 500, body: { error: 'Could not read that item. Try again.' } }
  }
  if (!item) return { status: 404, body: { error: 'That item is not on this permit.' } }
  const files = (((item as any).files ?? []) as RoundFile[]).filter(f => f.url !== url)
  const { error: saveErr } = await db.from('permit_items').update({ files }).eq('id', itemId).eq('permit_id', permitId)
  if (saveErr) {
    console.error('[permit-round] item file remove failed', saveErr.message)
    return { status: 500, body: { error: friendlyDbError(saveErr) } }
  }
  return { status: 200, body: { success: true } }
}
