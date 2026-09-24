import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { superAdminProfileIds } from '@/lib/super-admin'
import { notify } from '@/lib/notify'

export const runtime = 'nodejs'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
)

// Public: submit a request for access (the gated replacement for open signup).
export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const name = String(body.name ?? '').trim()
  const email = String(body.email ?? '').trim().toLowerCase()
  if (!name || !email || !/.+@.+\..+/.test(email)) {
    return NextResponse.json({ error: 'Name and a valid email are required.' }, { status: 400 })
  }

  const db = admin()
  // One request per email - resubmitting just confirms receipt.
  const { data: existing } = await db.from('access_requests').select('id, status').ilike('email', email).maybeSingle()
  if (existing) return NextResponse.json({ ok: true, already: true })

  const { error } = await db.from('access_requests').insert({
    name,
    email,
    company_name: String(body.company_name ?? '').trim() || null,
    company_type: ['gc', 'subcontractor'].includes(body.company_type) ? body.company_type : null,
    phone: String(body.phone ?? '').trim() || null,
    message: String(body.message ?? '').trim().slice(0, 1000) || null,
  })
  if (error) return NextResponse.json({ error: 'Could not submit - try again.' }, { status: 500 })

  // ── AND TELL US ──────────────────────────────────────────────────────────
  //
  // Nothing did. The row was inserted and it sat there until somebody
  // remembered to open /admin/access-requests - while this person had just been
  // told, on the screen they are looking at, that they would get an email as
  // soon as they were approved. The slowest part of getting a customer was us
  // not knowing they had asked.
  //
  // AFTER the insert and never in front of it: the request is the work, telling
  // us is the side effect. `notify` already guarantees it cannot throw, and the
  // await is here rather than floated so a serverless function cannot be frozen
  // between the response and the send.
  const who = [name, String(body.company_name ?? '').trim() || null].filter(Boolean).join(' - ')
  await notify({
    db,
    userIds: await superAdminProfileIds(db),
    type: 'access_request',
    title: 'New access request',
    message: `${who} (${email}) asked for access${body.company_type === 'subcontractor' ? ' as a subcontractor' : ''}.`
      + ' Approve them and the invite goes out automatically.',
    link: '/admin/access-requests',
  })

  return NextResponse.json({ ok: true })
}

// Public: validate an invite token (unlocks the real signup form).
export async function GET(request: Request) {
  const token = new URL(request.url).searchParams.get('token')
  if (!token) return NextResponse.json({ valid: false })
  const db = admin()
  const { data } = await db
    .from('access_requests')
    .select('name, email, company_name, company_type, status')
    .eq('invite_token', token)
    .eq('status', 'approved')
    .maybeSingle()
  if (!data) return NextResponse.json({ valid: false })
  return NextResponse.json({ valid: true, request: data })
}
