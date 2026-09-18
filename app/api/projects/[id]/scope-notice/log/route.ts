import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { requirePermission, denied } from '@/lib/api-guard'
import { noticeRecord } from '@/lib/scope-notice'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

/**
 * WHAT WAS BROADCAST ON THIS JOB, so the Sharing tab can show it.
 *
 * "so again where do i see the record?" - the honest answer used to be the
 * clock icon in the project header, which is where nobody looks. The Sharing
 * tab is the page a person already opens to ask what has gone out on this job,
 * so both kinds of send belong on it: paperwork sent to an expeditor, and an
 * update sent to the trades.
 *
 * READ-ONLY, AND NO SECOND TABLE. The notice already writes one row to
 * `project_activity`; this reads those rows back rather than storing them
 * twice. One fact, one home.
 *
 * GATED ON `files: view`, WHICH IS THE SHARING PAGE'S OWN GATE. A page's gate
 * has to COVER every route it loads from - the Invoices page loading its
 * subcontractor picker from a resource its own role is denied is the bug this
 * rule was written for, and it cost a PM a form full of nothing under a banner
 * claiming a match. So this route asks for exactly what the page already asks
 * for, never for `plans: edit` (the permission for SENDING one), which a
 * perfectly entitled reader of this page may not hold.
 */
export async function GET(request: Request, { params }: { params: { id: string } }) {
  const db = admin()
  const gate = await requirePermission(db, request, 'files', 'view')
  if (denied(gate)) return gate.denied

  const { data, error } = await db
    .from('project_activity')
    .select('id, actor_name, message, metadata, created_at')
    .eq('project_id', params.id)
    .eq('type', 'scope_change_notice')
    .order('created_at', { ascending: false })
    .limit(100)

  // KEEP THE ERROR. A refused query that nobody logs is indistinguishable from
  // an empty one, and on this page "nothing was ever broadcast" is exactly the
  // wrong thing to say when the truth is "we could not ask".
  if (error) {
    console.error('[scope-notice/log] read failed:', error.message)
    return NextResponse.json({ error: 'Could not load the updates sent from this job.' }, { status: 500 })
  }

  return NextResponse.json({ notices: (data ?? []).map(noticeRecord) })
}
