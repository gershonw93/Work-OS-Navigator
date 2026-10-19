import { NextResponse } from 'next/server'
import { admin, getValidConnection, QBO_ENV } from '@/lib/quickbooks'
import { checkCronAuth } from '@/lib/cron-auth'

export const runtime = 'nodejs'
export const maxDuration = 60

// ─────────────────────────────────────────────────────────────────────────────
// Keep every QuickBooks sign-in alive, once a day.
//
// An access token lasts an hour and is renewed on the next push. But the
// REFRESH token behind it only lives while it is used: Intuit rotates it and
// lets it die after a hundred idle days, and a company that records nothing
// for a quiet month finds out on the day it finally does - from a push that
// cannot run. Renewing daily keeps the grant current, writes
// `last_refreshed_at` so the card can say "renewed this morning", and turns a
// revoked grant into the Reconnect state BEFORE anybody needs it.
//
// Once a day because the Hobby plan refuses anything more frequent at build
// time (CLAUDE.md, Bulk mail). A failure is logged by getValidConnection
// itself, against the company, where Settings reads it.
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
  const { data: rows, error } = await db.from('quickbooks_connections')
    .select('company_id').eq('status', 'connected').eq('environment', QBO_ENV)
  if (error) {
    console.error('[cron/quickbooks-refresh] read', error.message)
    return NextResponse.json({ error: 'Could not read connections' }, { status: 500 })
  }
  let renewed = 0
  const failed: string[] = []
  for (const r of rows ?? []) {
    const conn = await getValidConnection(db, (r as any).company_id, { forceRefresh: true })
    if (conn) renewed++
    else failed.push((r as any).company_id)
  }
  if (failed.length) console.error('[cron/quickbooks-refresh] not renewed', failed.join(','))
  return NextResponse.json({ ok: true, environment: QBO_ENV, renewed, failed: failed.length })
}
