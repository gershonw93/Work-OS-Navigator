import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { appOrigin } from '@/lib/app-url'
import { sendEmail, subWelcomeEmail } from '@/lib/email'
import { isEmailAddress } from '@/lib/contact-email'
import { accountProblem } from '@/lib/bid-thread'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

const escapeLike = (s: string) => s.replace(/[%_\\]/g, '\\$&')

/**
 * A free account for a sub, made ON their quote page, so they can message the
 * GC about the request.
 *
 * IN PLACE, NOT BY EMAIL. The first version sent a set-password link: name on
 * the quote page, then the inbox to set a password, then back to the link to
 * write the message - "too much back and forth", and it was. The password is
 * set here, the account exists when this returns, and the page signs straight
 * in and opens the conversation. The welcome email is a receipt and a way back
 * in, not a step.
 *
 * WHY THE LINK IS ENOUGH PROOF. The quote link is a secret token that was sent
 * to the address it is for - holding it is the same evidence the old emailed
 * set-password link was. So the account is ALWAYS for the address on the
 * invite, never one typed here. Only an invite with no address at all (the GC
 * copied the link and texted it) takes one from the body, and it is written
 * onto the invite so the link is then bound to it.
 *
 * WHAT KIND OF ACCOUNT. A VENDOR one - what `/api/invite` makes with
 * `audience: 'vendor'`: `read_only` on the sub's own company row in this GC's
 * Directory. It sees what it is invited to and cannot open a job of its own
 * (`read_only` holds `projects: view` only, and both doors that create a job
 * ask for `create`). No billing row: a sub is not a tenant.
 */
export async function POST(request: Request, { params }: { params: { token: string } }) {
  const db = admin()
  const { data: invite } = await db
    .from('bid_invites')
    .select('id, token, bid_request_id, vendor_company_id, vendor_name, vendor_email, bid_requests ( title, trade, projects ( name, gc_company_id ) )')
    .eq('token', params.token)
    .maybeSingle()
  if (!invite) return NextResponse.json({ error: 'Invalid or expired link' }, { status: 404 })

  const body = await request.json().catch(() => ({} as any))
  const fullName = String(body.full_name ?? '').trim()
  const password = String(body.password ?? '')
  const problem = accountProblem({ fullName, password })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })

  const req = (invite as any).bid_requests
  const gcCompanyId: string | null = req?.projects?.gc_company_id ?? null
  if (!gcCompanyId) return NextResponse.json({ error: 'This request is not linked to a contractor any more.' }, { status: 409 })

  // ── The company the invite went to ─────────────────────────────────────
  let company: { id: string; name: string; contact_email: string | null } | null = null
  if (invite.vendor_company_id) {
    const { data } = await db.from('companies').select('id, name, contact_email').eq('id', invite.vendor_company_id).maybeSingle()
    company = data
  }

  // ── The address ─────────────────────────────────────────────────────────
  const onFile = (invite.vendor_email || company?.contact_email || '').trim()
  const email = (onFile || String(body.email ?? '')).trim()
  if (!isEmailAddress(email)) {
    return NextResponse.json({ error: onFile ? 'The address on this request is not a real email address. Ask the contractor to fix it.' : 'Enter your email address.' }, { status: 400 })
  }

  // A company that already has people on SyteNav is somebody's account. A
  // forwarded quote link must not be a way to join it.
  if (company) {
    const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('company_id', company.id)
    if ((count ?? 0) > 0) {
      return NextResponse.json({
        signIn: true, email,
        message: `${company.name} already has a SyteNav account. Sign in, or ask whoever set it up to add you.`,
      })
    }
  }

  // ── The login first, so nothing else is written for an address that has one ──
  const { data: made, error: authErr } = await db.auth.admin.createUser({
    email,
    password,
    // The link was the proof - see the header.
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })
  if (authErr || !made?.user) {
    if (/already|registered|exists/i.test(authErr?.message ?? '')) {
      return NextResponse.json({ signIn: true, email, message: `${email} already has a SyteNav account. Sign in to message them.` })
    }
    console.error('[bid/account] createUser failed', { invite: invite.id, error: authErr?.message })
    return NextResponse.json({ error: 'Could not create your account. Try again.' }, { status: 500 })
  }
  const userId = made.user.id

  // From here a failure leaves a login with nothing behind it, so it is taken
  // back out rather than left to confuse the next attempt.
  const undo = async (why: string, detail?: string) => {
    console.error(`[bid/account] ${why}`, { invite: invite.id, detail })
    await db.auth.admin.deleteUser(userId).catch(() => {})
    return NextResponse.json({ error: 'Could not set up your account. Try again.' }, { status: 500 })
  }

  // No company on the invite yet: the one already in this GC's Directory under
  // that address, or a new Directory entry.
  if (!company) {
    const { data: known } = await db
      .from('companies')
      .select('id, name, contact_email')
      .eq('added_by_company_id', gcCompanyId)
      .ilike('contact_email', escapeLike(email))
      .limit(1)
      .maybeSingle()
    company = known
    if (!company) {
      const { data: created, error: makeErr } = await db
        .from('companies')
        .insert({
          name: String(body.company_name ?? '').trim() || invite.vendor_name || fullName,
          type: 'subcontractor',
          contact_email: email,
          contact_name: fullName,
          added_by_company_id: gcCompanyId,
        })
        .select('id, name, contact_email')
        .single()
      if (makeErr || !created) return undo('company insert failed', makeErr?.message)
      company = created
    }
  }

  const { error: profileErr } = await db.from('profiles').upsert({
    id: userId, email, full_name: fullName, company_id: company.id, role: 'read_only',
  })
  if (profileErr) return undo('profile insert failed', profileErr.message)

  // Remember who this invite is for. A unique clash (that company or address
  // already on this request on another row) is left alone: the address match
  // in `canUseThread` still lets them in.
  const patch: Record<string, string> = {}
  if (!invite.vendor_company_id) patch.vendor_company_id = company.id
  if (!invite.vendor_email) patch.vendor_email = email
  if (Object.keys(patch).length) {
    const { error: linkErr } = await db.from('bid_invites').update(patch).eq('id', invite.id)
    if (linkErr) console.error('[bid/account] could not link invite', { invite: invite.id, error: linkErr.message })
  }

  // The receipt. Never fails the account - it exists, and the page is about
  // to sign them in.
  const gcName = (await db.from('companies').select('name').eq('id', gcCompanyId).maybeSingle()).data?.name ?? null
  const askedAbout = [req?.title || req?.trade, req?.projects?.name].filter(Boolean).join(' on ') || null
  const sent = await sendEmail({
    to: email,
    ...subWelcomeEmail({ name: fullName, gcName, signInUrl: `${appOrigin(request.headers.get('origin'))}/login`, askedAbout }),
  })
  if (!sent.sent) console.error('[bid/account] welcome did not send', { to: email, reason: sent.reason })

  // The address goes back so the page can sign in with it. The holder of the
  // link already reached that address's quote; this tells them nothing new.
  return NextResponse.json({ created: true, email })
}
