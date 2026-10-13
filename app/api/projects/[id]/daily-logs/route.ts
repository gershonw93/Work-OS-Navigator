import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { createDailyLog } from '@/lib/writes/daily-log'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function GET(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: logs, error } = await db
    .from('daily_logs')
    .select('*, daily_log_photos(*), daily_log_updates(*), daily_log_attachments(*)')
    .eq('project_id', params.id)
    .order('log_date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Resolve the author for any log missing a stamped name (logs written before
  // created_by_name was set). Looked up from created_by, which has always been
  // recorded, so historical logs still show who filed them.
  const rows = logs ?? []
  const unnamed = Array.from(new Set(
    rows.filter((l: any) => !l.created_by_name && l.created_by).map((l: any) => l.created_by as string),
  ))
  if (unnamed.length > 0) {
    const { data: authors } = await db.from('profiles').select('id, full_name, email').in('id', unnamed)
    const nameById = new Map((authors ?? []).map((a: any) => [a.id, a.full_name || a.email]))
    for (const l of rows as any[]) {
      if (!l.created_by_name && l.created_by) l.created_by_name = nameById.get(l.created_by) ?? null
    }
  }

  return NextResponse.json({ logs: rows })
}

/**
 * `JSON.parse` on a field a browser sent, without taking the request with it.
 *
 * The survey and the rosters are already parsed bare above; a malformed one
 * throws a SyntaxError out of the handler and the filer sees a 500 about their
 * whole log. Used for the new field rather than retrofitted to the others in
 * this change - that is a separate fix with its own blast radius.
 */
function safeJson(raw: string): unknown {
  try { return JSON.parse(raw) } catch { return [] }
}

export async function POST(request: Request, { params }: { params: { id: string } }) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '')
  if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = admin()
  const { data: { user } } = await db.auth.getUser(token)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let { data: profile } = await db.from('profiles').select('full_name, company_id').eq('id', user.id).single()

  // Auto-create profile if missing (handles users created before schema existed)
  if (!profile) {
    const { data: project } = await db.from('projects').select('gc_company_id').eq('id', params.id).single()
    const company_id = (project as any)?.gc_company_id
    if (company_id) {
      await db.from('profiles').upsert({
        id: user.id,
        company_id,
        email: user.email ?? '',
        full_name: user.user_metadata?.full_name ?? user.email ?? 'User',
        role: 'admin',
      })
      const retry = await db.from('profiles').select('full_name, company_id').eq('id', user.id).single()
      profile = retry.data
    }
  }

  const formData = await request.formData()
  const survey_raw = formData.get('survey') as string | null
  const subs_on_site_raw = formData.get('subs_on_site') as string | null
  const workers_on_site_raw = formData.get('workers_on_site') as string | null
  const delays_raw = formData.get('delays') as string | null
  // The mobile field view flags its submissions (`source: 'field'`); the role
  // fallback is asked inside `createDailyLog`.
  const body = {
    source: formData.get('source') as string | null,
    log_date: formData.get('log_date') as string,
    weather_condition: formData.get('weather_condition') as string | null,
    notes: formData.get('notes') as string | null,
    safety_observation: formData.get('safety_observation') as string | null,
    quality_observation: formData.get('quality_observation') as string | null,
    survey: survey_raw ? JSON.parse(survey_raw) : {},
    // Parsed safely - a malformed delays field must not take the log with it.
    delays: delays_raw ? safeJson(delays_raw) : [],
    workers_on_site: workers_on_site_raw ? JSON.parse(workers_on_site_raw) : [],
    subs_on_site: subs_on_site_raw ? JSON.parse(subs_on_site_raw) : [],
    // The form posted `temperature` and nothing read it, so the number the
    // Auto-fill weather button fetched was thrown away on every log. `temp_f`
    // is the column (integer) and what the PATCH route already whitelists.
    temp_f: formData.get('temp_f') as string | null,
    // Posted by the mobile field view since it shipped, and dropped on the floor
    // here until now - the route answered 200 and the log came back without
    // them, which is a rejection wearing a success.
    has_issues: formData.get('has_issues') === 'true',
    issue_description: formData.get('issue_description') as string | null,
    signed_by_name: formData.get('signed_by_name') as string | null,
  }

  async function uploadTo(bucket: string, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${params.id}/${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`
    const buf = await file.arrayBuffer()
    const { error: upErr } = await db.storage.from(bucket).upload(storagePath, buf, { contentType: file.type, upsert: true })
    if (upErr) return null
    const { data: signed } = await db.storage.from(bucket).createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
    return signed?.signedUrl ?? null
  }

  // Work-log photos (each may carry a caption + subcontract + category)
  const photos: { url: string; caption: string; subcontract_id: string | null; category: string | null }[] = []
  const photoFiles = formData.getAll('photos') as File[]
  for (const file of photoFiles) {
    if (!file || file.size === 0) continue
    const url = await uploadTo('daily-log-photos', file)
    if (url) photos.push({
      url,
      caption: (formData.get(`caption_${file.name}`) as string) ?? '',
      subcontract_id: (formData.get(`subId_${file.name}`) as string) || null,
      category: (formData.get(`cat_${file.name}`) as string) || null,
    })
  }

  // General-notes attachments
  const attachments: { file_url: string; file_name: string }[] = []
  for (const file of formData.getAll('attachments') as File[]) {
    if (!file || file.size === 0) continue
    const url = await uploadTo('submittals', file)
    if (url) attachments.push({ file_url: url, file_name: file.name })
  }

  // Signature (drawn image and/or typed name)
  let signature_url: string | null = null
  const sigFile = formData.get('signature') as File | null
  if (sigFile && sigFile.size > 0) signature_url = await uploadTo('daily-log-photos', sigFile)

  // Everything after the uploads is `createDailyLog`, which Claude's MCP server
  // calls too: the "a log has to say something" rule, the insert, the photo
  // and attachment rows and the history line.
  const result = await createDailyLog(db, {
    userId: user.id, userEmail: user.email, projectId: params.id, profile, body,
    uploads: { photos, attachments, signature_url },
  })
  return NextResponse.json(result.body, { status: result.status })
}
