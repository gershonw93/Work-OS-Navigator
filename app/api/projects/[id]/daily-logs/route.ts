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
    .select('*, daily_log_photos(id, photo_url, created_at)')
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

  const { data: profile } = await db.from('profiles').select('full_name, company_id').eq('id', user.id).single()

  const formData = await request.formData()
  const log_date = formData.get('log_date') as string
  const weather_condition = formData.get('weather_condition') as string | null
  const temperature = formData.get('temperature') as string | null
  const notes = formData.get('notes') as string | null
  const has_issues = formData.get('has_issues') === 'true'
  const issue_description = formData.get('issue_description') as string | null
  const delays_raw = formData.get('delays') as string | null
  const subs_on_site_raw = formData.get('subs_on_site') as string | null
  const workers_on_site_raw = formData.get('workers_on_site') as string | null

  const delays = delays_raw ? JSON.parse(delays_raw) : []
  const subs_on_site = subs_on_site_raw ? JSON.parse(subs_on_site_raw) : []
  const workers_on_site = workers_on_site_raw ? JSON.parse(workers_on_site_raw) : []

  // Upload photos
  const photos: { url: string; path: string; caption: string }[] = []
  const photoFiles = formData.getAll('photos') as File[]
  for (const file of photoFiles) {
    if (!file || file.size === 0) continue
    const caption = (formData.get(`caption_${file.name}`) as string) ?? ''
    const timestamp = Date.now()
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const storagePath = `${params.id}/${timestamp}-${safeName}`
    const arrayBuffer = await file.arrayBuffer()
    const { error: uploadError } = await db.storage
      .from('daily-log-photos')
      .upload(storagePath, arrayBuffer, { contentType: file.type, upsert: true })
    if (!uploadError) {
      const { data: signed } = await db.storage.from('daily-log-photos').createSignedUrl(storagePath, 60 * 60 * 24 * 365 * 10)
      if (signed?.signedUrl) photos.push({ url: signed.signedUrl, path: storagePath, caption })
    }
  }

  // Insert only columns confirmed to exist in DB
  const { data: log, error } = await db.from('daily_logs').insert({
    project_id: params.id,
    log_date,
    notes: notes || '',
    workers_onsite: workers_on_site.length || 0,
    weather: weather_condition || null,
  }).select().single()

  if (error) return NextResponse.json({ error: `Save failed: ${error.message} (code: ${error.code})` }, { status: 500 })

  // Insert into daily_log_photos table
  if (photos.length > 0) {
    await db.from('daily_log_photos').insert(
      photos.map(p => ({ daily_log_id: log.id, photo_url: p.url }))
    )
  }

  const actorName = (profile as any)?.full_name ?? 'Someone'
  const delayNote = delays.length > 0 ? ` · Delays: ${delays.map((d: any) => d.type).join(', ')}` : ''
  const issueNote = has_issues ? ' · ⚠ Issue flagged' : ''
  await logActivity(db, params.id, actorName, 'daily_log_submitted',
    `Daily log submitted for ${new Date(log_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}${delayNote}${issueNote}`,
    { log_id: log.id, log_date, has_issues, delays }
  )

  return NextResponse.json({ log })
}
