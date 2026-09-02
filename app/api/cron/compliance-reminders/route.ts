import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { audienceFor } from '@/lib/notification-audience'
import { notify } from '@/lib/notify'
import { checkCronAuth } from '@/lib/cron-auth'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const WINDOW_DAYS = 30

// Daily job: notify the owning company a month before a compliance doc expires.
// Runs once per expiry cycle per doc (reminder_sent_at gate).
export async function GET(request: Request) {
  // Auth. Vercel sends CRON_SECRET as a bearer token on every scheduled run
  // once the variable is set, so the bearer check is the whole check - see
  // lib/cron-auth.ts for why the old `secret &&` version let anyone run this.
  const auth = checkCronAuth({
    secret: process.env.CRON_SECRET,
    authorization: request.headers.get('Authorization'),
    querySecret: new URL(request.url).searchParams.get('secret'),
    isVercelCron: request.headers.get('x-vercel-cron') != null,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

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
    // The company that owns the document decides who hears its certificates are
    // expiring - it is their insurance, and their choice. Was everyone at that
    // company, which on a twenty-person sub is nineteen people who cannot
    // upload the renewal.
    const audience = await audienceFor({ db, companyId: doc.company_id, type: 'compliance_expiring' })
    const people = audience.map(id => ({ id }))
    const { data: company } = await db.from('companies').select('name').eq('id', doc.company_id).single()
    const days = Math.max(0, Math.ceil((new Date(doc.expiry_date + 'T00:00:00').getTime() - now.getTime()) / 86400000))
    const label = (doc.type ?? 'compliance document').replace(/_/g, ' ')
    const msg = `${label} ${company?.name ? `for ${company.name} ` : ''}expires in ${days} day${days !== 1 ? 's' : ''} (${doc.expiry_date}). Please upload an updated copy.`

    if (people?.length) {
      await notify({
        db, userIds: people.map(p => p.id), type: 'compliance_expiring',
        title: 'Document expiring', message: msg, link: `/compliance`,
      })
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
