import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { jobGate, logOnJob } from '@/lib/job-access'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

export async function POST(request: Request, { params }: { params: { id: string; logId: string } }) {
  // Answered any login, and inserted onto whatever log id it was handed. Now
  // on this job, the log on this job, and the billing lock. `daily-logs: VIEW`
  // because the Daily Logs screen offers Add Photos to everybody who can open
  // a log - view-only roles included - and a lockdown must not take it away.
  const db = admin()
  const gate = await jobGate(db, request, params.id, 'daily-logs', 'view', { write: true })
  if ('denied' in gate) return gate.denied
  if (!(await logOnJob(db, params.id, params.logId))) return NextResponse.json({ error: 'Log not found' }, { status: 404 })

  const formData = await request.formData()
  const files = formData.getAll('photos') as File[]
  if (!files.length) return NextResponse.json({ error: 'No photos provided' }, { status: 400 })

  const rows: { daily_log_id: string; photo_url: string; caption: string | null; subcontract_id: string | null; category: string | null }[] = []
  for (const file of files) {
    if (!file || file.size === 0) continue
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
    const path = `${params.id}/${Date.now()}-${Math.round(Math.random() * 1e6)}-${safeName}`
    const buf = await file.arrayBuffer()
    const { error: upErr } = await db.storage.from('daily-log-photos').upload(path, buf, { contentType: file.type, upsert: true })
    if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
    const { data: signed } = await db.storage.from('daily-log-photos').createSignedUrl(path, 60 * 60 * 24 * 365 * 10)
    if (signed?.signedUrl) rows.push({
      daily_log_id: params.logId,
      photo_url: signed.signedUrl,
      caption: (formData.get(`caption_${file.name}`) as string) || null,
      subcontract_id: (formData.get(`subId_${file.name}`) as string) || null,
      category: (formData.get(`cat_${file.name}`) as string) || null,
    })
  }

  if (!rows.length) return NextResponse.json({ error: 'Nothing uploaded' }, { status: 400 })

  const { data, error } = await db.from('daily_log_photos').insert(rows).select()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ photos: data })
}
