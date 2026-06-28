import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { logActivity } from '@/lib/log-activity'

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
  return NextResponse.json({ logs: logs ?? [] })
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
  const log_date = formData.get('log_date') as string
  const weather_condition = formData.get('weather_condition') as string | null
  const notes = formData.get('notes') as string | null
  const safety_observation = formData.get('safety_observation') as string | null
  const quality_observation = formData.get('quality_observation') as string | null
  const survey_raw = formData.get('survey') as string | null
  const subs_on_site_raw = formData.get('subs_on_site') as string | null
  const workers_on_site_raw = formData.get('workers_on_site') as string | null
  const signed_by_name = formData.get('signed_by_name') as string | null

  const survey = survey_raw ? JSON.parse(survey_raw) : {}
  const workers_on_site = workers_on_site_raw ? JSON.parse(workers_on_site_raw) : []
  void subs_on_site_raw

  async function uploadTo(bucket: string, file: File) {
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${params.id}/${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`
    const buf = await file.arrayBuffer()
    const { error: upErr } = await db.storage.from(bucket).upload(storagePath, buf, { contentType: file.type, upsert: true })
    if (upErr) return null
    const { data: signed } = await db.storage.from(bucket).createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
    return signed?.signedUrl ?? null
  }

  // Work-log photos (each may carry a caption + subcontract)
  const photos: { url: string; caption: string; subcontract_id: string | null }[] = []
  const photoFiles = formData.getAll('photos') as File[]
  for (const file of photoFiles) {
    if (!file || file.size === 0) continue
    const url = await uploadTo('daily-log-photos', file)
    if (url) photos.push({
      url,
      caption: (formData.get(`caption_${file.name}`) as string) ?? '',
      subcontract_id: (formData.get(`subId_${file.name}`) as string) || null,
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
  const signed = !!(signature_url || signed_by_name)

  const { data: log, error } = await db.from('daily_logs').insert({
    project_id: params.id,
    created_by: user.id,
    log_date,
    notes: notes || '',
    workers_onsite: workers_on_site.length || 0,
    weather: weather_condition || null,
    survey,
    safety_observation: safety_observation || null,
    quality_observation: quality_observation || null,
    signed_by_name: signed ? (signed_by_name || null) : null,
    signature_url,
    signed_at: signed ? new Date().toISOString() : null,
  }).select().single()

  if (error) return NextResponse.json({ error: `Save failed: ${error.message} (code: ${error.code})` }, { status: 500 })

  if (photos.length > 0) {
    await db.from('daily_log_photos').insert(
      photos.map(p => ({ daily_log_id: log.id, photo_url: p.url, caption: p.caption || null, subcontract_id: p.subcontract_id }))
    )
  }
  if (attachments.length > 0) {
    await db.from('daily_log_attachments').insert(
      attachments.map(a => ({ daily_log_id: log.id, file_url: a.file_url, file_name: a.file_name }))
    )
  }

  const actorName = (profile as any)?.full_name ?? 'Someone'
  const safetyNote = safety_observation ? ' · ⚠ Safety observation' : ''
  await logActivity(db, params.id, actorName, 'daily_log_submitted',
    `Daily log submitted for ${new Date(log_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${safetyNote}`,
    { log_id: log.id, log_date }
  )

  return NextResponse.json({ log })
}
