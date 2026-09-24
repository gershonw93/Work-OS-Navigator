import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getActor, actorCan } from '@/lib/server-permissions'
import { deletionProblem, deletionPromise, deletionNotice, type DeletionScope } from '@/lib/account-deletion'
import { deletionRequestEmail, sendEmail } from '@/lib/email'
import { SUPPORT_EMAIL } from '@/lib/support-email'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// ─────────────────────────────────────────────────────────────────────────────
// ASK TO DELETE AN ACCOUNT, FROM INSIDE THE APP.
//
// THE BUG. Settings -> Danger Zone -> "Delete Company Account" sent DELETE to
// /api/settings, which has only ever exported GET and PATCH - so it answered
// "Failed to delete account. Contact support." every time, and a person who is
// not an admin had no control at all. Apple requires that ANYBODY can start
// deleting their account in the app (App Store rule 5.1.1(v)).
//
// A REQUEST, AND THE SCREEN SAYS SO. Deletion walks every table pointing at a
// company, storage objects signed for ten years, device tokens and the
// QuickBooks link, and is carried out by us within DELETION_DAYS - the same
// promise /delete-account makes. This records the request, tells the person
// what will happen, and tells us.
//
// NOT BEHIND THE BILLING LOCK. It is gated with getActor + actorCan rather than
// requirePermission on purpose: requirePermission refuses writes from an
// account whose trial has lapsed, and "your trial ended, so you cannot ask us
// to delete your data" is the one refusal that must never happen.
// ─────────────────────────────────────────────────────────────────────────────

async function who(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '') ?? null
  const db = admin()
  const actor = await getActor(db, token)
  return { db, actor }
}

/** The person's open requests, so the screen can say "requested on ..." rather than offer the button twice. */
export async function GET(request: Request) {
  const { db, actor } = await who(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await db
    .from('account_deletion_requests')
    .select('id, scope, created_at')
    .eq('profile_id', actor.userId)
    .eq('status', 'open')
  if (error) {
    console.error('[account/deletion-request] read failed:', error.message)
    return NextResponse.json({ error: 'Could not check for an earlier request.' }, { status: 500 })
  }
  return NextResponse.json({ requests: data ?? [] })
}

export async function POST(request: Request) {
  const { db, actor } = await who(request)
  if (!actor) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({} as any))
  const problem = deletionProblem(body?.scope, actorCan(actor, 'settings_company', 'delete'))
  if (problem) return NextResponse.json({ error: problem }, { status: body?.scope === 'company' ? 403 : 400 })
  const scope = body.scope as DeletionScope

  const [{ data: profile }, { data: company }] = await Promise.all([
    db.from('profiles').select('full_name, email').eq('id', actor.userId).maybeSingle(),
    actor.companyId
      ? db.from('companies').select('name').eq('id', actor.companyId).maybeSingle()
      : Promise.resolve({ data: null }),
  ])
  let email = (profile as any)?.email as string | null
  if (!email) {
    const { data: { user } } = await db.auth.admin.getUserById(actor.userId)
    email = user?.email ?? null
  }
  if (!email) return NextResponse.json({ error: 'Your account has no email address to confirm to. Write to us instead.' }, { status: 400 })
  const name = ((profile as any)?.full_name as string | null) ?? null
  const companyName = ((company as any)?.name as string | null) ?? null

  const { data: row, error } = await db.from('account_deletion_requests').insert({
    profile_id: actor.userId,
    company_id: actor.companyId,
    email, name, company_name: companyName, scope,
  }).select('id, created_at').single()

  // Already asked: the unique index says so. Not an error, and not a second
  // email to support either.
  if (error?.code === '23505') {
    return NextResponse.json({ ok: true, already: true, promise: deletionPromise(scope) })
  }
  if (error || !row) {
    console.error('[account/deletion-request] insert failed:', error?.message)
    return NextResponse.json({ error: 'Could not record your request. Try again, or write to ' + SUPPORT_EMAIL + '.' }, { status: 500 })
  }

  // Tell us, then tell them. Each send reports its own outcome; a failure is
  // logged, never thrown - the request is recorded either way, and the row is
  // what support works from.
  const notice = deletionNotice({ scope, email, name, companyName, requestId: row.id })
  const [toUs, toThem] = await Promise.all([
    sendEmail({ to: SUPPORT_EMAIL, subject: notice.subject, text: notice.text }),
    sendEmail({ to: email, ...deletionRequestEmail({ name, promise: deletionPromise(scope), supportEmail: SUPPORT_EMAIL }) }),
  ])
  if (!toUs.sent) console.error('[account/deletion-request] support email not sent:', row.id, toUs.reason, toUs.detail)
  if (!toThem.sent) console.error('[account/deletion-request] confirmation not sent:', row.id, toThem.reason, toThem.detail)

  return NextResponse.json({
    ok: true,
    requestedAt: row.created_at,
    promise: deletionPromise(scope),
    confirmationSent: toThem.sent,
  })
}
