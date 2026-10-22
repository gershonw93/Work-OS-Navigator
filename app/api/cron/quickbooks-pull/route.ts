import { NextResponse } from 'next/server'
import { admin, QBO_ENV } from '@/lib/quickbooks'
import { checkCronAuth } from '@/lib/cron-auth'
import { processPending, runCdc } from '@/lib/quickbooks-pull'

export const runtime = 'nodejs'
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// The daily read of what changed in QuickBooks, for every company that has
// "Bring changes back" switched on - the safety net under Intuit's webhook,
// and the whole mechanism for a company whose webhook is not set up.
//
// Once a day because the Hobby plan refuses anything more frequent at build
// time (CLAUDE.md, Bulk mail). Intuit keeps 30 days of changes, so a missed
// day costs nothing.
// ─────────────────────────────────────────────────────────────────────────────
export async function GET(request: Request) {
  const auth = checkCronAuth({
    secret: process.env.CRON_SECRET,
    authorization: request.headers.get('Authorization'),
    querySecret: new URL(request.url).searchParams.get('secret'),
    isVercelCron: request.headers.get('x-vercel-cron') != null,
  })
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const db = admin()
  const { data: cos, error } = await db.from('companies').select('id').eq('qbo_pull_enabled', true)
  if (error) {
    console.error('[cron/quickbooks-pull] read', error.message)
    return NextResponse.json({ error: 'Could not read companies' }, { status: 500 })
  }
  let recorded = 0
  for (const c of cos ?? []) recorded += (await runCdc(db, (c as any).id)).recorded
  const tally = await processPending(db, { budgetMs: 40_000, limit: 200 })
  return NextResponse.json({ ok: true, environment: QBO_ENV, companies: (cos ?? []).length, recorded, ...tally })
}
