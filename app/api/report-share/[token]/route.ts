import { NextResponse } from 'next/server'
import { reportDb } from '@/lib/report-admin-db'

export const runtime = 'nodejs'

/**
 * Public: no account, the token is the credential. Returns the snapshot taken
 * when the report was shared - never a live query, never anything wider.
 */
export async function GET(_request: Request, { params }: { params: { token: string } }) {
  if (!/^[A-Za-z0-9_-]{20,80}$/.test(params.token)) {
    return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  }
  const db = reportDb()
  const { data: share, error } = await db.from('report_shares')
    .select('id, title, snapshot, recipient_name, message, created_by_name, created_at, viewed_at, revoked_at')
    .eq('token', params.token)
    .maybeSingle()
  if (error) {
    console.error('[report share]', error)
    return NextResponse.json({ error: 'Could not open this report. Try again in a moment.' }, { status: 500 })
  }
  if (!share) return NextResponse.json({ error: 'This link is not valid.' }, { status: 404 })
  if ((share as any).revoked_at) return NextResponse.json({ error: 'This link has been turned off by the sender.' }, { status: 410 })

  // First open stamps it, so the sender can see it landed.
  if (!(share as any).viewed_at) {
    await db.from('report_shares').update({ viewed_at: new Date().toISOString() }).eq('id', (share as any).id)
  }
  const s = share as any
  return NextResponse.json({
    doc: s.snapshot,
    message: s.message,
    recipient_name: s.recipient_name,
    from_person: s.created_by_name,
    from_company: s.snapshot?.from_company ?? null,
    from_logo: s.snapshot?.from_logo ?? null,
    sent_at: s.created_at,
  })
}
