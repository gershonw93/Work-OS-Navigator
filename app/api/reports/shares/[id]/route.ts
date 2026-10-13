import { NextResponse } from 'next/server'
import { reportDb } from '@/lib/report-admin-db'
import { reportCtx } from '@/lib/report-load'

export const runtime = 'nodejs'

/**
 * Turn a shared link off. The row stays - "who did we send this to, and when"
 * is the question that arrives later - and the link answers "turned off by the
 * sender" from now on.
 */
export async function DELETE(request: Request, { params }: { params: { id: string } }) {
  const db = reportDb()
  const gate = await reportCtx(db, request, 'create')
  if ('denied' in gate) return gate.denied
  const { data, error } = await db.from('report_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', params.id).eq('company_id', gate.ctx.companyId)
    .is('revoked_at', null)
    .select('id, revoked_at').maybeSingle()
  if (error) {
    console.error('[report shares] revoke', error)
    return NextResponse.json({ error: 'Could not turn that link off. Try again.' }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'That link is already off.' }, { status: 404 })
  return NextResponse.json({ ok: true, revoked_at: (data as any).revoked_at })
}
