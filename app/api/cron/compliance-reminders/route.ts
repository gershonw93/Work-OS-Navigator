import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const WINDOW_DAYS = 30

// Daily job: notify the owning company a month before a compliance doc expires.
// Runs once per expiry cycle per doc (reminder_sent_at gate).
export async function GET(request: Request) {
  // Auth: Vercel Cron sends x-vercel-cron; otherwise require CRON_SECRET.
  const isVercelCron = request.headers.get('x-vercel-cron') != null
  const secret = process.env.CRON_SECRET
  const provided = request.headers.get('Authorization')?.replace('Bearer ', '')
    || new URL(request.url).searchParams.get('secret')
  if (!isVercelCron && secret && provided !== secret) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = admin()
  const now = new Date()
  const horizon = new Date(now.getTime() + WINDOW_DAYS * 86400000)
  const todayIso = now.toISOString().slice(0, 10)
  const horizonIso = horizon.toISOString().slice(0, 10)

  // Docs expiring within the window that haven't already triggered a reminder
  const { data: docs, error } = await db
    .from('compliance_documents')
    .select('id, type, company_id, project_id, expiry_date, reminder_sent_at, status')
    .not('expiry_date', 'is', null)
    .gte('expiry_date', todayIso)
    .lte('expiry_date', horizonIso)
    .is('reminder_sent_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let notified = 0
  for (const doc of docs ?? []) {
    // Recipients: everyone at the company that owns the doc
    const { data: people } = await db.from('profiles').select('id').eq('company_id', doc.company_id)
    const { data: company } = await db.from('companies').select('name').eq('id', doc.company_id).single()
    const days = Math.max(0, Math.ceil((new Date(doc.expiry_date + 'T00:00:00').getTime() - now.getTime()) / 86400000))
    const label = (doc.type ?? 'compliance document').replace(/_/g, ' ')
    const msg = `${label} ${company?.name ? `for ${company.name} ` : ''}expires in ${days} day${days !== 1 ? 's' : ''} (${doc.expiry_date}). Please upload an updated copy.`

    if (people?.length) {
      await db.from('notifications').insert(
        people.map(p => ({ user_id: p.id, type: 'compliance_expiring', message: msg, read: false }))
      )
      notified += people.length
    }

    await db.from('compliance_documents').update({
      reminder_sent_at: now.toISOString(),
      status: 'expiring_soon',
    }).eq('id', doc.id)
  }

  // Clear the reminder flag on renewed docs (new expiry pushed beyond the window)
  await db.from('compliance_documents')
    .update({ reminder_sent_at: null })
    .not('reminder_sent_at', 'is', null)
    .gt('expiry_date', horizonIso)

  return NextResponse.json({ ok: true, docs_processed: docs?.length ?? 0, notifications: notified })
}
