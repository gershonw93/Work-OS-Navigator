import type { SupabaseClient } from '@supabase/supabase-js'
import { cleanDelays, logSaysSomething, EMPTY_LOG_PROBLEM } from '@/lib/daily-log-delays'
import { logActivity } from '@/lib/log-activity'
import { FIELD_ROLES } from '@/lib/permissions'
import { formatDate } from '@/lib/dates'
import { withVia, type WriteResult } from './result'

// ─────────────────────────────────────────────────────────────────────────────
// Filing a daily log - the ONE home for it.
//
// Moved out of `POST /api/projects/[id]/daily-logs` unchanged, so the MCP
// server files a log through the same rule the form and the field app meet:
// `logSaysSomething` (a blank log is refused - it would assert somebody was on
// site and reported nothing, in a client-facing PDF), the field-entry review
// flag, the insert, the photo and attachment rows, and the history line.
//
// The route keeps the sign-in, the missing-profile bootstrap (it needs the
// auth user's own record) and reading the form. FILES STAY IN THE ROUTE: the
// photos, attachments and signature are uploaded there and handed in as
// `uploads`, already signed URLs. Parsed JSON arrives parsed.
// ─────────────────────────────────────────────────────────────────────────────

export interface DailyLogUploads {
  photos?: { url: string; caption: string; subcontract_id: string | null; category: string | null }[]
  attachments?: { file_url: string; file_name: string }[]
  signature_url?: string | null
}

export async function createDailyLog(
  db: SupabaseClient,
  { userId, userEmail, projectId, profile: given, body, uploads, via }: {
    userId: string
    userEmail?: string | null
    projectId: string
    /** The author's profile as the route already read it; read here when not given. */
    profile?: { full_name?: string | null } | null
    body: any
    uploads?: DailyLogUploads
    via?: string
  },
): Promise<WriteResult> {
  const user = { id: userId, email: userEmail ?? undefined }

  let profile = given
  if (profile === undefined) {
    const { data } = await db.from('profiles').select('full_name, company_id').eq('id', user.id).single()
    profile = data as any
  }

  // The mobile field view flags its submissions. Fall back to the submitter's
  // role so a field-role user filing any log is still treated as an
  // observation needing review, even if the flag is missing.
  const { data: submitterRole } = await db.from('profiles').select('role').eq('id', user.id).single()
  const isFieldEntry = body.source === 'field'
    || FIELD_ROLES.includes((submitterRole?.role as string) ?? '')
  const log_date = body.log_date as string
  const weather_condition = (body.weather_condition ?? null) as string | null
  const notes = (body.notes ?? null) as string | null
  const safety_observation = (body.safety_observation ?? null) as string | null
  const quality_observation = (body.quality_observation ?? null) as string | null
  // The form posted `temperature` and nothing read it, so the number the
  // Auto-fill weather button fetched was thrown away on every log. `temp_f`
  // is the column (integer) and what the PATCH route already whitelists.
  const temp_f_raw = body.temp_f == null ? null : String(body.temp_f)
  const has_issues = body.has_issues === true
  const issue_description = (body.issue_description ?? null) as string | null
  const signed_by_name = (body.signed_by_name ?? null) as string | null

  const survey = body.survey ?? {}
  // A HALF-TYPED DELAY ROW MUST NOT COST SOMEBODY THEIR WHOLE DAY'S LOG.
  // `cleanDelays` drops the rows that fail the rule and keeps the rest - this
  // is a record of a day on a site, often filed from a phone at the end of it,
  // and refusing all of it over one blank description is the wrong trade.
  const delays = cleanDelays(body.delays ?? [])
  const workers_on_site = body.workers_on_site ?? []
  const subs_on_site = body.subs_on_site ?? []
  const subWorkerTotal = subs_on_site.reduce((t: number, s: any) => t + (Number(s.workers) || 0), 0)
  const totalWorkers = (workers_on_site.length || 0) + subWorkerTotal

  const photos = uploads?.photos ?? []
  const attachments = uploads?.attachments ?? []
  const signature_url = uploads?.signature_url ?? null
  const signed = !!(signature_url || signed_by_name)

  // A LOG HAS TO SAY SOMETHING.
  //
  // THE BUG: opening the form and pressing Save filed a log with a date and
  // nothing else. It landed in the list, in the count, and in the client-facing
  // PDF - a page of blank fields under a heading, which is worse than no entry
  // at all because it asserts that somebody was on site and reported this.
  //
  // Checked here rather than only in the form, because the field app posts to
  // the same route. Anything substantive counts: a note, an observation, a
  // photo, an attachment, who was on site, or an answered survey question. The
  // DATE does not, and neither does the weather - both are filled in for you.
  if (!logSaysSomething({
    notes, safety_observation, quality_observation, issue_description,
    photos: photos.length,
    attachments: attachments.length,
    workers: totalWorkers,
    subs: subs_on_site.length,
    delays,
    survey,
  })) {
    return { status: 400, body: { error: EMPTY_LOG_PROBLEM } }
  }

  // Stamp the author's name too. Without this the log list and PDF render
  // "Logged by" with nothing after it, so nobody can tell who filed it.
  const authorName = (profile as any)?.full_name ?? user.email ?? null

  const { data: log, error } = await db.from('daily_logs').insert({
    project_id: projectId,
    created_by: user.id,
    created_by_name: authorName === null ? null : withVia(authorName, via),
    log_date,
    notes: notes || '',
    workers_onsite: totalWorkers,
    // The FORM field is `weather_condition`; the COLUMN is `weather`. Both
    // posters agree on the wire name, so it stays - but the second weather
    // COLUMN is gone (114), and this is the one place the two names meet.
    weather: weather_condition || null,
    temp_f: temp_f_raw && /^\d+$/.test(temp_f_raw.trim()) ? Number(temp_f_raw.trim()) : null,
    subs_on_site,
    // The roster itself, not only the count. `workers_onsite` above is the
    // derived total; this is who they were, posted all along and stored now.
    workers_on_site,
    delays,
    has_issues,
    issue_description: issue_description || null,
    survey,
    safety_observation: safety_observation || null,
    quality_observation: quality_observation || null,
    signed_by_name: signed ? (signed_by_name || null) : null,
    signature_url,
    signed_at: signed ? new Date().toISOString() : null,
    source: isFieldEntry ? 'field' : 'office',
    // Field entries are observations until a manager reviews them, and stay
    // out of the client-facing PDF until then.
    review_status: isFieldEntry ? 'pending' : 'reviewed',
  }).select().single()

  if (error) return { status: 500, body: { error: `Save failed: ${error.message} (code: ${error.code})` } }

  if (photos.length > 0) {
    await db.from('daily_log_photos').insert(
      photos.map(p => ({ daily_log_id: log.id, photo_url: p.url, caption: p.caption || null, subcontract_id: p.subcontract_id, category: p.category }))
    )
  }
  if (attachments.length > 0) {
    await db.from('daily_log_attachments').insert(
      attachments.map(a => ({ daily_log_id: log.id, file_url: a.file_url, file_name: a.file_name }))
    )
  }

  const actorName = withVia((profile as any)?.full_name ?? 'Someone', via)
  const safetyNote = safety_observation ? ' · ⚠ Safety observation' : ''
  await logActivity(db, projectId, actorName, 'daily_log_submitted',
    `Daily log submitted for ${formatDate(log_date, { month: 'short', day: 'numeric', year: 'numeric' })}${safetyNote}`,
    { log_id: log.id, log_date }
  )

  return { status: 200, body: { log } }
}
